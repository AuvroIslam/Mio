import React, { createContext, useContext, useState, useEffect } from 'react';
import { Alert } from 'react-native';
import { useAuth } from './AuthContext';
import firestoreService from '../services/firestoreService';

// Create the context
const SubscriptionContext = createContext();

// Custom hook to use the subscription context
export const useSubscription = () => {
  return useContext(SubscriptionContext);
};

// Constants for subscription limits
export const SUBSCRIPTION_LIMITS = {
  FREE: {
    MAX_FAVORITES: 5,
    MAX_CHANGES_PER_WEEK: 3,
    MAX_MATCHES_PER_WEEK: 15,
  },
  PREMIUM: {
    MAX_FAVORITES: 10,
    MAX_CHANGES_PER_WEEK: Infinity,
    MAX_MATCHES_PER_WEEK: Infinity,
  }
};

// Provider component
export const SubscriptionProvider = ({ children }) => {
  const { currentUser } = useAuth();
  const [isPremium, setIsPremium] = useState(false);
  const [usageStats, setUsageStats] = useState({
    favoritesCount: 0,
    changesThisWeek: 0,
    matchesThisWeek: 0,
    lastResetDate: new Date().toISOString(),
    counterStartedAt: null, // When the counter started (after 3rd change)
  });
  const [loading, setLoading] = useState(true);

  // Load subscription status when user changes
  useEffect(() => {
    const loadSubscriptionStatus = async () => {
      if (!currentUser) {
        setIsPremium(false);
        setUsageStats({
          favoritesCount: 0,
          changesThisWeek: 0,
          matchesThisWeek: 0,
          lastResetDate: new Date().toISOString(),
          counterStartedAt: null,
        });
        setLoading(false);
        console.log('SUBSCRIPTION LOADING COMPLETE (no user)');
        return;
      }

      try {
        setLoading(true);
        console.log('SUBSCRIPTION LOADING STARTED:', currentUser.uid);
        
        // Get subscription status from Firestore
        const response = await firestoreService.getUserSubscription(currentUser.uid);
        console.log('Firestore data loaded:', response.data);
        
        if (response.success && response.data) {
          // Store a direct copy of the Firestore data to avoid any race conditions
          const firestoreData = { ...response.data };
          
          // Set premium status
          setIsPremium(firestoreData.isPremium || false);
          
          // Check if cooldown timer is active
          if (firestoreData.counterStartedAt) {
            console.log('COOLDOWN ACTIVE - counterStartedAt found:', firestoreData.counterStartedAt);
            console.log('Current changesThisWeek in Firestore:', firestoreData.changesThisWeek);
            
            const counterStartDate = new Date(firestoreData.counterStartedAt);
            const currentDate = new Date();
            
            // Calculate elapsed time in seconds
            const secondsSinceCounterStarted = Math.floor((currentDate - counterStartDate) / 1000);
            const cooldownTotalSeconds = 2 * 60; // 2 minutes in seconds
            console.log('Seconds since cooldown started:', secondsSinceCounterStarted, '/', cooldownTotalSeconds);
            
            // If cooldown period has passed, reset the counter
            if (secondsSinceCounterStarted >= cooldownTotalSeconds) {
              console.log('Cooldown expired, resetting counter');
              const resetStats = {
                ...firestoreData,
                changesThisWeek: 0,
                counterStartedAt: null,
              };
              
              setUsageStats(resetStats);
              await firestoreService.updateUserSubscription(currentUser.uid, resetStats);
              console.log('Updated Firestore - reset cooldown:', resetStats);
            } else {
              // Counter still running - NEVER reset changesThisWeek during cooldown
              // Always force it to MAX_CHANGES_PER_WEEK to prevent UI confusion
              const updatedStats = {
                ...firestoreData,
                changesThisWeek: Math.max(firestoreData.changesThisWeek, SUBSCRIPTION_LIMITS.FREE.MAX_CHANGES_PER_WEEK)
              };
              
              console.log('Setting local state with forced changesThisWeek:', updatedStats);
              setUsageStats(updatedStats);
              
              // Update Firestore if changesThisWeek doesn't match expected value
              if (firestoreData.changesThisWeek < SUBSCRIPTION_LIMITS.FREE.MAX_CHANGES_PER_WEEK) {
                console.log('Fixing changesThisWeek in Firestore to:', SUBSCRIPTION_LIMITS.FREE.MAX_CHANGES_PER_WEEK);
                await firestoreService.updateUserSubscription(currentUser.uid, updatedStats);
                console.log('Firestore updated with fixed changesThisWeek value');
              }
              
              console.log(`Cooldown still active: ${cooldownTotalSeconds - secondsSinceCounterStarted} seconds remaining`);
            }
          } else {
            // No counter running
            console.log('No cooldown active, using data as-is:', firestoreData);
            setUsageStats(firestoreData);
          }
        } else {
          // Initialize with default values if no data exists
          // IMPORTANT: This must only run for brand new users, not on every login
          console.log('No subscription data found, initializing with defaults');
          const newUserData = {
            isPremium: false,
            favoritesCount: 0,
            changesThisWeek: 0,
            matchesThisWeek: 0,
            lastResetDate: new Date().toISOString(),
            counterStartedAt: null,
          };
          
          setIsPremium(false);
          setUsageStats(newUserData);
          
          // This call will now preserve any existing cooldown data thanks to our fix
          await firestoreService.updateUserSubscription(currentUser.uid, newUserData);
          console.log('Created initial subscription data in Firestore:', newUserData);
        }
      } catch (error) {
        console.error('Error loading subscription status:', error);
      } finally {
        setLoading(false);
        console.log('SUBSCRIPTION LOADING COMPLETE - ready to render UI');
      }
    };

    console.log('SubscriptionContext detected user change, loading data...');
    loadSubscriptionStatus();
  }, [currentUser]);

  // Update usage stats in Firestore
  const updateUsageStats = async (newStats) => {
    if (!currentUser) return;
    
    try {
      console.log('==========================================');
      console.log('UPDATE USAGE STATS CALLED');
      console.log('CURRENT STATE:', usageStats);
      console.log('NEW STATS TO APPLY:', newStats);
      
      const updatedStats = { ...usageStats, ...newStats };
      console.log('MERGED STATS TO SAVE:', updatedStats);
      
      setUsageStats(updatedStats);
      await firestoreService.updateUserSubscription(currentUser.uid, updatedStats);
      
      console.log('STATE UPDATED SUCCESSFULLY');
      console.log('==========================================');
      return updatedStats;
    } catch (error) {
      console.error('Error updating usage stats:', error);
      return usageStats;
    }
  };

  // Increment favorites count
  const incrementFavoritesCount = async () => {
    const newCount = usageStats.favoritesCount + 1;
    const updated = await updateUsageStats({ favoritesCount: newCount });
    return updated.favoritesCount;
  };

  // Decrement favorites count
  const decrementFavoritesCount = async () => {
    const newCount = Math.max(0, usageStats.favoritesCount - 1);
    const updated = await updateUsageStats({ favoritesCount: newCount });
    return updated.favoritesCount;
  };

  // Record a favorites change (removal)
  const recordFavoriteChange = async () => {
    console.log('==========================================');
    console.log('RECORD FAVORITE CHANGE CALLED');
    console.log('CURRENT STATE:', {
      isPremium,
      counterStartedAt: usageStats.counterStartedAt,
      changesThisWeek: usageStats.changesThisWeek
    });
    
    if (isPremium) {
      console.log('USER IS PREMIUM - NO LIMIT APPLIES');
      console.log('==========================================');
      return 0; // Premium users have unlimited changes
    }
    
    // Check if cooldown is active
    if (usageStats.counterStartedAt) {
      console.log('COOLDOWN IS ACTIVE - CHECKING EXPIRATION');
      const counterStartDate = new Date(usageStats.counterStartedAt);
      const currentDate = new Date();
      const secondsSinceCounterStarted = Math.floor((currentDate - counterStartDate) / 1000);
      const cooldownTotalSeconds = 2 * 60; // 2 minutes in seconds
      console.log('SECONDS SINCE COOLDOWN STARTED:', secondsSinceCounterStarted);
      console.log('COOLDOWN TOTAL SECONDS:', cooldownTotalSeconds);
      
      // If 2 minutes (120 seconds) have passed, reset and allow a new change
      if (secondsSinceCounterStarted >= cooldownTotalSeconds) {
        console.log('COOLDOWN EXPIRED - RESETTING COUNTER');
        const updated = await updateUsageStats({ 
          changesThisWeek: 1, 
          counterStartedAt: null 
        });
        console.log('COUNTER RESET - NEW CHANGES THIS WEEK:', updated.changesThisWeek);
        console.log('==========================================');
        return updated.changesThisWeek;
      }
      
      // Still in cooldown period, ensure changesThisWeek is set to max
      // This helps maintain the state properly across app restarts
      if (usageStats.changesThisWeek < SUBSCRIPTION_LIMITS.FREE.MAX_CHANGES_PER_WEEK) {
        console.log('FIXING CHANGES COUNT DURING COOLDOWN');
        const updated = await updateUsageStats({ 
          changesThisWeek: SUBSCRIPTION_LIMITS.FREE.MAX_CHANGES_PER_WEEK
        });
        console.log('CHANGES FIXED - NOW AT MAX:', updated.changesThisWeek);
        console.log('==========================================');
        return updated.changesThisWeek;
      }
      
      // No changes allowed during cooldown
      console.log('STILL IN COOLDOWN - NO CHANGES ALLOWED');
      console.log('CURRENT CHANGES THIS WEEK:', usageStats.changesThisWeek);
      console.log('==========================================');
      return usageStats.changesThisWeek;
    }
    
    // If not in cooldown, increment counter
    console.log('NO COOLDOWN ACTIVE - INCREMENTING COUNTER');
    const newCount = usageStats.changesThisWeek + 1;
    console.log('NEW CHANGES COUNT:', newCount);
    let updateData = { changesThisWeek: newCount };
    
    // If this is the 3rd change, start the cooldown
    if (newCount >= SUBSCRIPTION_LIMITS.FREE.MAX_CHANGES_PER_WEEK) {
      const now = new Date();
      updateData.counterStartedAt = now.toISOString();
      console.log('WEEKLY LIMIT REACHED - STARTING COOLDOWN AT:', now.toISOString());
      console.log('UPDATE DATA:', updateData);
    }
    
    const updated = await updateUsageStats(updateData);
    console.log('COUNTER UPDATED - NEW STATE:', updated);
    console.log('==========================================');
    return updated.changesThisWeek;
  };

  // Add a function to check and refresh the cooldown status
  const checkCooldownStatus = () => {
    if (!usageStats.counterStartedAt) return;
    
    const counterStartDate = new Date(usageStats.counterStartedAt);
    const currentDate = new Date();
    const secondsSinceCounterStarted = Math.floor((currentDate - counterStartDate) / 1000);
    const cooldownTotalSeconds = 2 * 60; // 2 minutes in seconds
    
    // If 2 minutes (120 seconds) have passed, reset the counter to 0
    if (secondsSinceCounterStarted >= cooldownTotalSeconds) {
      const resetStats = {
        ...usageStats,
        changesThisWeek: 0,
        counterStartedAt: null,
      };
      
      setUsageStats(resetStats);
      if (currentUser) {
        firestoreService.updateUserSubscription(currentUser.uid, resetStats);
      }
      return true;
    }
    return false;
  };

  // Check cooldown status periodically (every 10 seconds)
  useEffect(() => {
    if (!currentUser) return;
    
    const interval = setInterval(() => {
      checkCooldownStatus();
    }, 10000); // Check every 10 seconds
    
    return () => clearInterval(interval);
  }, [currentUser, usageStats.counterStartedAt]);

  // Add explicit method to check if user is in cooldown
  const isInCooldown = () => {
    console.log('==========================================');
    console.log('IS IN COOLDOWN CHECK CALLED');
    
    if (!usageStats.counterStartedAt) {
      console.log('NO COOLDOWN TIMESTAMP - NOT IN COOLDOWN');
      console.log('==========================================');
      return false;
    }
    
    const counterStartDate = new Date(usageStats.counterStartedAt);
    const currentDate = new Date();
    const secondsSinceCounterStarted = Math.floor((currentDate - counterStartDate) / 1000);
    const cooldownTotalSeconds = 2 * 60; // 2 minutes in seconds
    
    console.log('COOLDOWN START:', counterStartDate.toISOString());
    console.log('CURRENT TIME:', currentDate.toISOString());
    console.log('SECONDS ELAPSED:', secondsSinceCounterStarted);
    console.log('COOLDOWN TOTAL:', cooldownTotalSeconds);
    console.log('REMAINING SECONDS:', Math.max(0, cooldownTotalSeconds - secondsSinceCounterStarted));
    
    const stillInCooldown = secondsSinceCounterStarted < cooldownTotalSeconds;
    console.log('STILL IN COOLDOWN:', stillInCooldown);
    console.log('==========================================');
    
    return stillInCooldown;
  };

  // Check if user can make changes
  const canMakeChange = () => {
    if (isPremium) return true;
    
    // Check for cooldown expiration first
    if (checkCooldownStatus()) {
      return true;
    }
    
    // Check if in cooldown - if yes, never allow changes
    if (isInCooldown()) {
      return false;
    }
    
    // If not in cooldown, check if under limit
    return usageStats.changesThisWeek < SUBSCRIPTION_LIMITS.FREE.MAX_CHANGES_PER_WEEK;
  };

  // Get a consistent weekly change count
  const getWeeklyChangesCount = () => {
    // During cooldown, always return MAX_CHANGES_PER_WEEK
    if (isInCooldown()) {
      return SUBSCRIPTION_LIMITS.FREE.MAX_CHANGES_PER_WEEK;
    }
    
    return usageStats.changesThisWeek || 0;
  };

  // Get time remaining until changes reset (in seconds)
  const getTimeRemainingForChanges = () => {
    if (isPremium) return 0;
    if (!usageStats.counterStartedAt) return 0;
    
    const counterStartDate = new Date(usageStats.counterStartedAt);
    const currentDate = new Date();
    const secondsSinceCounterStarted = Math.floor((currentDate - counterStartDate) / 1000);
    const cooldownTotalSeconds = 2 * 60; // 2 minutes in seconds
    
    return Math.max(0, cooldownTotalSeconds - secondsSinceCounterStarted);
  };
  
  // Get time remaining in MM:SS format
  const getFormattedTimeRemaining = () => {
    const totalSeconds = getTimeRemainingForChanges();
    if (totalSeconds <= 0) return '';
    
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  // Reset favorites count to a specific value (for syncing with actual favorites)
  const resetFavoritesCount = async (actualCount) => {
    const updated = await updateUsageStats({ favoritesCount: actualCount });
    return updated.favoritesCount;
  };

  // Check if user can add more favorites
  const canAddFavorite = (actualFavoritesCount) => {
    const count = actualFavoritesCount !== undefined ? actualFavoritesCount : usageStats.favoritesCount;
    const limit = isPremium 
      ? SUBSCRIPTION_LIMITS.PREMIUM.MAX_FAVORITES 
      : SUBSCRIPTION_LIMITS.FREE.MAX_FAVORITES;
    
    return count < limit;
  };

  // Get remaining counts
  const getRemainingCounts = () => {
    if (isPremium) {
      return {
        favorites: SUBSCRIPTION_LIMITS.PREMIUM.MAX_FAVORITES - usageStats.favoritesCount,
        changes: Infinity,
        matches: Infinity
      };
    }
    
    // Always return 0 changes remaining if cooldown is active
    const remainingChanges = usageStats.counterStartedAt 
      ? 0 
      : SUBSCRIPTION_LIMITS.FREE.MAX_CHANGES_PER_WEEK - usageStats.changesThisWeek;
    
    return {
      favorites: SUBSCRIPTION_LIMITS.FREE.MAX_FAVORITES - usageStats.favoritesCount,
      changes: remainingChanges,
      matches: SUBSCRIPTION_LIMITS.FREE.MAX_MATCHES_PER_WEEK - usageStats.matchesThisWeek
    };
  };

  // Record a match (kept for compatibility)
  const recordMatch = async () => {
    const newMatches = usageStats.matchesThisWeek + 1;
    const updated = await updateUsageStats({ matchesThisWeek: newMatches });
    return updated.matchesThisWeek;
  };

  // Check if user can have more matches (kept for compatibility)
  const canHaveMoreMatches = () => {
    if (isPremium) return true;
    return usageStats.matchesThisWeek < SUBSCRIPTION_LIMITS.FREE.MAX_MATCHES_PER_WEEK;
  };

  // Upgrade to premium
  const upgradeToPremium = async () => {
    if (!currentUser) return false;
    
    try {
      setIsPremium(true);
      await updateUsageStats({ isPremium: true });
      
      Alert.alert(
        'Premium Activated!', 
        'You now have access to all premium features.'
      );
      
      return true;
    } catch (error) {
      console.error('Error upgrading to premium:', error);
      return false;
    }
  };

  // Get subscription tier
  const getSubscriptionTier = () => {
    return isPremium ? 'PREMIUM' : 'FREE';
  };

  // Context value
  const value = {
    isPremium,
    usageStats,
    loading,
    canAddFavorite,
    canMakeChange,
    canHaveMoreMatches,
    incrementFavoritesCount,
    decrementFavoritesCount,
    resetFavoritesCount,
    recordFavoriteChange,
    recordMatch,
    upgradeToPremium,
    getRemainingCounts,
    getSubscriptionTier,
    getTimeRemainingForChanges,
    getFormattedTimeRemaining,
    isInCooldown,
    getWeeklyChangesCount,
    LIMITS: SUBSCRIPTION_LIMITS
  };

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  );
}; 