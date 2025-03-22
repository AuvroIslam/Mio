import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Alert } from 'react-native';
import { useAuth } from './AuthContext';
import firestoreService from '../services/firestoreService';
import { doc, getDoc, updateDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db } from '../config/firebaseConfig';

// Create the context
const SubscriptionContext = createContext();

// Custom hook to use the subscription context
export const useSubscription = () => {
  return useContext(SubscriptionContext);
};

// Define limits for different subscription tiers
export const SUBSCRIPTION_LIMITS = {
  FREE: {
    MAX_FAVORITES: 5,
    MAX_CHANGES_PER_WEEK: 2,
    MAX_MATCHES_PER_WEEK: 5,
    COOLDOWN_DURATION_MS: 150000 // 2 minutes for testing
  },
  PREMIUM: {
    MAX_FAVORITES: Infinity,
    MAX_CHANGES_PER_WEEK: Infinity,
    MAX_MATCHES_PER_WEEK: Infinity,
    COOLDOWN_DURATION_MS: 0 // No cooldown for premium
  }
};

// Provider component
export const SubscriptionProvider = ({ children }) => {
  const { currentUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [usageStats, setUsageStats] = useState({
    isPremium: false,
    tierName: 'FREE',
    favoritesCount: 0,
    dramasCount: 0, // Add counts for drama favorites
    changesThisWeek: 0,
    dramaChangesThisWeek: 0, // Add counts for drama changes
    matchesThisWeek: 0,
    counterStartedAt: null, // Timestamp when the cooldown started
    lastUpdated: null,
  });

  // Load subscription data when user changes
  useEffect(() => {
    const loadSubscriptionData = async () => {
      if (!currentUser) {
        setUsageStats({
          isPremium: false,
          tierName: 'FREE',
          favoritesCount: 0,
          dramasCount: 0,
          changesThisWeek: 0,
          dramaChangesThisWeek: 0,
          matchesThisWeek: 0,
          counterStartedAt: null,
          lastUpdated: null,
        });
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        
        // Get user subscription data from Firestore
        const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
        
        if (!userDoc.exists()) {
          console.error('User document not found');
          setLoading(false);
          return;
        }
        
        const userData = userDoc.data();
        const subscription = userData.subscription || {};
        
        // Default stats for a new user
        let stats = {
          isPremium: subscription.isPremium || false,
          tierName: subscription.isPremium ? 'PREMIUM' : 'FREE',
          favoritesCount: userData.favorites?.length || 0,
          dramasCount: userData.dramas?.length || 0,
          changesThisWeek: subscription.changesThisWeek || 0,
          dramaChangesThisWeek: subscription.dramaChangesThisWeek || 0,
          matchesThisWeek: subscription.matchesThisWeek || 0,
          counterStartedAt: subscription.counterStartedAt || null,
          lastUpdated: subscription.lastUpdated || null,
        };
        
        // Check if the cooldown period has passed
        if (stats.counterStartedAt) {
          const cooldownDuration = stats.isPremium ? 
            SUBSCRIPTION_LIMITS.PREMIUM.COOLDOWN_DURATION_MS : 
            SUBSCRIPTION_LIMITS.FREE.COOLDOWN_DURATION_MS;
          
          const now = Date.now();
          
          // Safely handle different timestamp formats
          let cooldownEndTime;
          if (typeof stats.counterStartedAt.toMillis === 'function') {
            cooldownEndTime = stats.counterStartedAt.toMillis() + cooldownDuration;
          } else if (stats.counterStartedAt.seconds) {
            cooldownEndTime = (stats.counterStartedAt.seconds * 1000) + cooldownDuration;
          } else {
            console.warn('Invalid counterStartedAt format:', stats.counterStartedAt);
            cooldownEndTime = now + 1; // Set to just after now to ensure it's considered ended
          }
          
          // If cooldown has ended, reset the counter
          if (now >= cooldownEndTime) {
            stats.counterStartedAt = null;
            stats.changesThisWeek = 0;
            stats.dramaChangesThisWeek = 0;
            
            // Update Firestore with reset cooldown
            await updateUsageStats({
              ...stats,
              counterStartedAt: null,
              changesThisWeek: 0,
              dramaChangesThisWeek: 0,
            });
          }
        }
        
        // Check if we need to reset weekly counters (if more than a week has passed)
        if (stats.lastUpdated) {
          const now = new Date();
          const lastUpdated = stats.lastUpdated.toDate();
          const oneWeekInMs = 7 * 24 * 60 * 60 * 1000;
          
          // If more than a week has passed since last update
          if (now - lastUpdated > oneWeekInMs) {
            stats.changesThisWeek = 0;
            stats.dramaChangesThisWeek = 0;
            stats.matchesThisWeek = 0;
            
            // Update Firestore with reset weekly counters
            await updateUsageStats({
              ...stats,
                changesThisWeek: 0,
              dramaChangesThisWeek: 0,
              matchesThisWeek: 0,
              lastUpdated: serverTimestamp()
            });
          }
        }
        
        setUsageStats(stats);
      } catch (error) {
        console.error('Error loading subscription data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadSubscriptionData();
  }, [currentUser]);

  // Update usage stats in Firestore
  const updateUsageStats = async (newStats) => {
    if (!currentUser) return;
    
    try {
      // Create an update object with only defined fields
      const updateObject = {};
      
      // Only add fields that are defined or provide default values
      updateObject['subscription.isPremium'] = newStats.isPremium !== undefined ? newStats.isPremium : usageStats.isPremium;
      updateObject['subscription.changesThisWeek'] = newStats.changesThisWeek !== undefined ? newStats.changesThisWeek : usageStats.changesThisWeek || 0;
      updateObject['subscription.dramaChangesThisWeek'] = newStats.dramaChangesThisWeek !== undefined ? newStats.dramaChangesThisWeek : usageStats.dramaChangesThisWeek || 0;
      updateObject['subscription.matchesThisWeek'] = newStats.matchesThisWeek !== undefined ? newStats.matchesThisWeek : usageStats.matchesThisWeek || 0;
      
      // Special handling for counterStartedAt since null is a valid value (to clear cooldown)
      if ('counterStartedAt' in newStats) {
        updateObject['subscription.counterStartedAt'] = newStats.counterStartedAt;
      }
      
      updateObject['subscription.lastUpdated'] = newStats.lastUpdated || serverTimestamp();
      
      await updateDoc(doc(db, 'users', currentUser.uid), updateObject);
    } catch (error) {
      console.error('Error updating subscription stats:', error);
      throw error; // Re-throw to allow caller to catch it
    }
  };
  
  // Functions to update favorites count directly
  const resetFavoritesCount = useCallback((count) => {
    setUsageStats(prev => ({
      ...prev,
      favoritesCount: count
    }));
  }, []);

  const incrementFavoritesCount = useCallback(() => {
    setUsageStats(prev => ({
      ...prev,
      favoritesCount: prev.favoritesCount + 1
    }));
  }, []);
  
  const decrementFavoritesCount = useCallback(() => {
    setUsageStats(prev => ({
      ...prev,
      favoritesCount: Math.max(0, prev.favoritesCount - 1)
    }));
  }, []);

  // Increment the dramas count
  const incrementDramasCount = useCallback((amount = 1) => {
    setUsageStats(prev => ({
      ...prev,
      dramasCount: prev.dramasCount + amount
    }));
  }, []);
  
  // Set the dramas count to an exact value (for syncing)
  const resetDramasCount = useCallback((count) => {
    console.log(`Resetting drama count to ${count}`);
    setUsageStats(prev => ({
      ...prev,
      dramasCount: count
    }));
  }, []);
  
  // Decrement the dramas count
  const decrementDramasCount = useCallback(() => {
    setUsageStats(prev => ({
      ...prev,
      dramasCount: Math.max(0, prev.dramasCount - 1)
    }));
  }, []);
  
  // Helper to get cooldown end time in a safe way
  const getCooldownEndTime = (counterStartTime) => {
    const timestamp = counterStartTime || usageStats.counterStartedAt;
    if (!timestamp) return null;
    
    const cooldownDuration = usageStats.isPremium ? 
      SUBSCRIPTION_LIMITS.PREMIUM.COOLDOWN_DURATION_MS : 
      SUBSCRIPTION_LIMITS.FREE.COOLDOWN_DURATION_MS;
    
    if (typeof timestamp.toMillis === 'function') {
      return timestamp.toMillis() + cooldownDuration;
    } else if (timestamp.seconds) {
      return (timestamp.seconds * 1000) + cooldownDuration;
    } else {
      console.warn('Invalid counterStartedAt format');
      return null;
    }
  };
  
  // Record a favorite change and start cooldown if needed
  const recordFavoriteChange = async () => {
    // If premium, no need to record changes
    if (usageStats.isPremium) return true;
    
    // Get current limits
    const limits = SUBSCRIPTION_LIMITS.FREE;
    
    // Calculate total changes (anime + drama)
    const totalChanges = (usageStats.changesThisWeek || 0) + (usageStats.dramaChangesThisWeek || 0);
    
    // Increment the anime changes count
    const newChangesCount = (usageStats.changesThisWeek || 0) + 1;
    
    // Check if total changes will be at or over the limit
    const newTotalChanges = totalChanges + 1;
    const willReachLimit = newTotalChanges >= limits.MAX_CHANGES_PER_WEEK;
    
    console.log(`Recording anime change: current total=${totalChanges}, new total=${newTotalChanges}, limit=${limits.MAX_CHANGES_PER_WEEK}, will reach limit=${willReachLimit}`);
    
    if (willReachLimit) {
      // Create new timestamp here for cooldown
      const timestamp = Timestamp.now();
      console.log('Combined total reached limit, starting cooldown with timestamp:', timestamp);
      
      try {
        // Update Firestore first
        await updateUsageStats({
          ...usageStats,
          changesThisWeek: newChangesCount,
          counterStartedAt: serverTimestamp(), // Use serverTimestamp for Firestore
          lastUpdated: serverTimestamp()
        });
        
        // Then update local state with local timestamp
        const newStats = {
          ...usageStats,
          changesThisWeek: newChangesCount,
          counterStartedAt: timestamp,
          lastUpdated: timestamp
        };
        setUsageStats(newStats);
        
        console.log('Cooldown started successfully for combined limit');
        return true;
      } catch (error) {
        console.error('Error starting cooldown at combined limit:', error);
        return false;
      }
    } else {
      // Not at combined limit yet, just update the counter
      try {
        const newStats = {
          ...usageStats,
          changesThisWeek: newChangesCount,
          lastUpdated: serverTimestamp()
        };
        
        await updateUsageStats(newStats);
        setUsageStats({
          ...newStats,
          lastUpdated: Timestamp.now()
        });
        
        return true;
      } catch (error) {
        console.error('Error updating change count:', error);
        return false;
      }
    }
  };

  // Record a drama change and start cooldown if needed
  const recordDramaChange = async () => {
    // If premium, no need to record changes
    if (usageStats.isPremium) return true;
    
    // Get current limits
    const limits = SUBSCRIPTION_LIMITS.FREE;
    
    // Calculate total changes (anime + drama)
    const totalChanges = (usageStats.changesThisWeek || 0) + (usageStats.dramaChangesThisWeek || 0);
    
    // Increment the drama changes count
    const newChangesCount = (usageStats.dramaChangesThisWeek || 0) + 1;
    
    // Check if total changes will be at or over the limit
    const newTotalChanges = totalChanges + 1;
    const willReachLimit = newTotalChanges >= limits.MAX_CHANGES_PER_WEEK;
    
    console.log(`Recording drama change: current total=${totalChanges}, new total=${newTotalChanges}, limit=${limits.MAX_CHANGES_PER_WEEK}, will reach limit=${willReachLimit}`);
    
    if (willReachLimit) {
      // Create new timestamp here for cooldown
      const timestamp = Timestamp.now();
      console.log('Combined total reached limit, starting cooldown with timestamp:', timestamp);
      
      try {
        // Update Firestore first
        await updateUsageStats({
          ...usageStats,
          dramaChangesThisWeek: newChangesCount,
          counterStartedAt: serverTimestamp(), // Use serverTimestamp for Firestore
          lastUpdated: serverTimestamp()
        });
        
        // Then update local state with local timestamp
        const newStats = {
          ...usageStats,
          dramaChangesThisWeek: newChangesCount,
          counterStartedAt: timestamp,
          lastUpdated: timestamp
        };
        setUsageStats(newStats);
        
        console.log('Cooldown started successfully for combined limit');
        return true;
      } catch (error) {
        console.error('Error starting cooldown at combined limit:', error);
        return false;
      }
    } else {
      // Not at combined limit yet, just update the counter
      try {
        const newStats = {
        ...usageStats,
          dramaChangesThisWeek: newChangesCount,
          lastUpdated: serverTimestamp()
        };
        
        await updateUsageStats(newStats);
        setUsageStats({
          ...newStats,
          lastUpdated: Timestamp.now()
        });
        
        return true;
      } catch (error) {
        console.error('Error updating drama change count:', error);
        return false;
      }
    }
  };
  
  // Record a match (for weekly limits)
  const recordMatch = async () => {
    // If premium, no need to record matches
    if (usageStats.isPremium) return true;
    
    // Get current limits
    const limits = SUBSCRIPTION_LIMITS.FREE;
    
    // If we're at the limit for this week
    if (usageStats.matchesThisWeek >= limits.MAX_MATCHES_PER_WEEK) {
    return false;
    }
    
    // Increment matches count for this week
    const newStats = {
      ...usageStats,
      matchesThisWeek: usageStats.matchesThisWeek + 1,
      lastUpdated: serverTimestamp()
    };
    
    await updateUsageStats(newStats);
    setUsageStats(newStats);
    
    return true;
  };
  
  // Set up a periodic check to reset cooldown when it ends
  useEffect(() => {
    // Only run for non-premium users in cooldown
    if (!usageStats.isPremium && usageStats.counterStartedAt) {
      console.log('Setting up cooldown check timer');
      
      // Check every second if cooldown has ended
      const checkInterval = setInterval(() => {
        const cooldownDuration = SUBSCRIPTION_LIMITS.FREE.COOLDOWN_DURATION_MS;
        const now = Date.now();
        
        let cooldownEndTime;
        if (typeof usageStats.counterStartedAt.toMillis === 'function') {
          cooldownEndTime = usageStats.counterStartedAt.toMillis() + cooldownDuration;
        } else if (usageStats.counterStartedAt.seconds) {
          cooldownEndTime = (usageStats.counterStartedAt.seconds * 1000) + cooldownDuration;
        } else {
          console.warn('Invalid counterStartedAt format');
          return;
        }
        
        // If cooldown has ended, reset it
        if (now >= cooldownEndTime) {
          console.log('Cooldown has ended, resetting state');
          
          // First reset the state locally to prevent UI flicker
          setUsageStats(prev => ({
            ...prev,
            counterStartedAt: null,
            changesThisWeek: 0,
            dramaChangesThisWeek: 0
          }));
          
          // Then update Firestore with only the necessary fields
          try {
            updateUsageStats({
              counterStartedAt: null,
              changesThisWeek: 0,
              dramaChangesThisWeek: 0,
              lastUpdated: serverTimestamp()
            }).catch(err => {
              console.error('Error resetting cooldown in Firestore:', err);
            });
          } catch (error) {
            console.error('Error preparing cooldown reset:', error);
          }
          
          // Clear the interval since cooldown has ended
          clearInterval(checkInterval);
        }
      }, 1000);
      
      // Cleanup function
      return () => clearInterval(checkInterval);
    }
  }, [usageStats.isPremium, usageStats.counterStartedAt]);

  // Check if user is in cooldown - available to other contexts
  const isInCooldown = () => {
    // Premium users are never in cooldown
    if (usageStats.isPremium) return false;
    
    // No counterStartedAt means not in cooldown
    if (!usageStats.counterStartedAt) return false;
    
    // Check if cooldown has ended
    const cooldownDuration = SUBSCRIPTION_LIMITS.FREE.COOLDOWN_DURATION_MS;
    const now = Date.now();
    
    const cooldownEndTime = getCooldownEndTime(usageStats.counterStartedAt);
    if (!cooldownEndTime) return false;
    
    // If cooldown has ended but state hasn't been updated yet
    if (now >= cooldownEndTime) {
      return false;
    }
    
    return true;
  };
  
  // Check if user can make a change (not in cooldown)
  const canMakeChange = () => {
    // Premium users can always make changes
    if (usageStats.isPremium) {
      console.log('Premium user can always make changes');
      return true;
    }
    
    // Check if in cooldown
    if (isInCooldown()) {
      console.log('User is in cooldown period, changes not allowed');
      return false;
    }
    
    // Calculate total changes
    const limits = SUBSCRIPTION_LIMITS.FREE;
    const totalChanges = (usageStats.changesThisWeek || 0) + (usageStats.dramaChangesThisWeek || 0);
    const canChange = totalChanges < limits.MAX_CHANGES_PER_WEEK;
    
    console.log(`Total changes: ${totalChanges}, limit: ${limits.MAX_CHANGES_PER_WEEK}, can change: ${canChange}`);
    
    if (totalChanges >= limits.MAX_CHANGES_PER_WEEK && !usageStats.counterStartedAt) {
      // We've hit the limit but cooldown hasn't started, we'll return false
      // but don't worry - the cooldown will be started by recordFavoriteChange/recordDramaChange
      console.log('Hit weekly limit but cooldown not started yet');
    }
    
    return canChange;
  };
  
  // Get the remaining weekly changes
  const getRemainingWeeklyChanges = () => {
    if (usageStats.isPremium) return Infinity;
    
    const limits = SUBSCRIPTION_LIMITS.FREE;
    const totalChanges = (usageStats.changesThisWeek || 0) + (usageStats.dramaChangesThisWeek || 0);
    return Math.max(0, limits.MAX_CHANGES_PER_WEEK - totalChanges);
  };
  
  // Get formatted time remaining in cooldown
  const getFormattedTimeRemaining = () => {
    if (!usageStats.counterStartedAt) return '';
    
    const now = Date.now();
    
    // Get cooldown end time using the helper
    const cooldownEndTime = getCooldownEndTime(usageStats.counterStartedAt);
    if (!cooldownEndTime) return '';
    
    // If cooldown has ended
    if (now >= cooldownEndTime) {
      return '';
    }
    
    // Calculate remaining time
    const remainingMs = cooldownEndTime - now;
    const minutes = Math.floor(remainingMs / 60000);
    const seconds = Math.floor((remainingMs % 60000) / 1000);
    
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };
  
  // Function to handle premium upgrade
  const upgradeToPremium = async () => {
    if (!currentUser) return false;
    
    try {
      // For now we'll just update the user's status to premium
      // In a real app, this would be hooked to a payment processor
      console.log('Upgrading user to premium...');
      
      // Update using firestoreService
      const result = await firestoreService.updateUserSubscription(currentUser.uid, {
        isPremium: true,
      });
      
      if (result.success) {
        // Update local state
        setUsageStats(prev => ({
          ...prev,
          isPremium: true,
          tierName: 'PREMIUM',
          counterStartedAt: null
        }));
        
        console.log('User upgraded to premium successfully');
        Alert.alert('Success', 'You have been upgraded to Premium! Enjoy unlimited favorites and no cooldown periods.');
        
        return true;
      } else {
        throw new Error(result.error || 'Failed to upgrade to premium');
      }
    } catch (error) {
      console.error('Error upgrading to premium:', error);
      Alert.alert('Error', 'Failed to upgrade to premium. Please try again.');
      return false;
    }
  };

  // Function to navigate to the premium upgrade screen
  const navigateToPremiumUpgrade = () => {
    // For now, we'll just provide this method for components to use with their navigation
    console.log('Premium upgrade navigation requested');
    return 'Subscription'; // Return the route name for consistency
  };

  // Get remaining counts for favorites, changes, and matches
  const getRemainingCounts = () => {
    const limits = usageStats.isPremium ? 
      SUBSCRIPTION_LIMITS.PREMIUM : 
      SUBSCRIPTION_LIMITS.FREE;
    
    // For Premium users, return Infinity
    if (usageStats.isPremium) {
      return {
        favorites: Infinity,
        dramas: Infinity,
        changes: Infinity,
        dramaChanges: Infinity,
        matches: Infinity
      };
    }
    
    // For free users, calculate properly
    const favoritesRemaining = Math.max(0, limits.MAX_FAVORITES - usageStats.favoritesCount);
    const dramasRemaining = Math.max(0, limits.MAX_FAVORITES - usageStats.dramasCount);
    
    const changesRemaining = Math.max(0, limits.MAX_CHANGES_PER_WEEK - usageStats.changesThisWeek);
    const dramaChangesRemaining = Math.max(0, limits.MAX_CHANGES_PER_WEEK - usageStats.dramaChangesThisWeek);
    
    const matchesRemaining = Math.max(0, limits.MAX_MATCHES_PER_WEEK - usageStats.matchesThisWeek);
    
    console.log('Remaining counts calculated:', {
      favorites: favoritesRemaining,
      dramas: dramasRemaining,
      current: {
        favorites: usageStats.favoritesCount,
        dramas: usageStats.dramasCount
      }
    });
    
    return {
      favorites: favoritesRemaining,
      dramas: dramasRemaining,
      changes: changesRemaining,
      dramaChanges: dramaChangesRemaining,
      matches: matchesRemaining
    };
  };
  
  // Function to fetch and sync subscription data from Firestore
  const syncSubscriptionData = async () => {
    if (!currentUser) return false;
    
    console.log('Syncing subscription data...');
    setLoading(true);
    
    try {
      // Use firestoreService to get user subscription data
      const result = await firestoreService.getUserSubscription(currentUser.uid);
      
      if (!result.success) {
        console.error('Failed to sync subscription data:', result.error);
        return false;
      }
      
      // Extract subscription data from Firestore
      const subscriptionData = result.data || {};
      
      // Ensure all fields exist with defaults
      const syncedData = {
        isPremium: subscriptionData.isPremium || false,
        tierName: subscriptionData.isPremium ? 'PREMIUM' : 'FREE',
        favoritesCount: subscriptionData.favoritesCount || 0,
        dramasCount: subscriptionData.dramasCount || 0,
        changesThisWeek: subscriptionData.changesThisWeek || 0,
        dramaChangesThisWeek: subscriptionData.dramaChangesThisWeek || 0,
        matchesThisWeek: subscriptionData.matchesThisWeek || 0,
        counterStartedAt: subscriptionData.counterStartedAt || null,
        lastUpdated: subscriptionData.lastUpdated || serverTimestamp()
      };
      
      // Update local state
      setUsageStats(syncedData);
      console.log('Subscription data synced successfully:', syncedData);
      
      return true;
    } catch (error) {
      console.error('Error syncing subscription data:', error);
      return false;
    } finally {
      setLoading(false);
    }
  };
  
  // Get weekly changes count
  const getWeeklyChangesCount = () => {
    return usageStats.changesThisWeek + usageStats.dramaChangesThisWeek;
  };
  
  // Check if user is subscribed to premium
  const isSubscribed = usageStats.isPremium;
  
  // Get subscription tier (for UI display)
  const getSubscriptionTier = () => {
    return usageStats.tierName;
  };

  // Check if a user can add an anime to favorites
  const canAddFavorite = () => {
    // For premium users, always return true
    if (usageStats.isPremium) {
      return {
        allowed: true
      };
    }
    
    // Check if user has reached the favorites limit
    const favoritesRemaining = Math.max(0, SUBSCRIPTION_LIMITS.FREE.MAX_FAVORITES - usageStats.favoritesCount);
    if (favoritesRemaining <= 0) {
      return {
        allowed: false,
        reason: 'LIMIT_REACHED',
        message: `You've reached your limit of ${SUBSCRIPTION_LIMITS.FREE.MAX_FAVORITES} favorites.`
      };
    }
    
    return {
      allowed: true
    };
  };

  // Check if a user can add a drama to favorites
  const canAddDrama = () => {
    // For premium users, always return true
    if (usageStats.isPremium) {
      return {
        allowed: true
      };
    }
    
    // Check if user has reached the dramas limit
    const dramasRemaining = Math.max(0, SUBSCRIPTION_LIMITS.FREE.MAX_FAVORITES - usageStats.dramasCount);
    if (dramasRemaining <= 0) {
      return {
        allowed: false,
        reason: 'LIMIT_REACHED',
        message: `You've reached your limit of ${SUBSCRIPTION_LIMITS.FREE.MAX_FAVORITES} drama favorites.`
      };
    }
    
    return {
      allowed: true
    };
  };

  // Check if user can remove a favorite (covers both anime and drama)
  const canRemoveFavorite = () => {
    // Premium users can always remove favorites
    if (usageStats.isPremium) {
      return {
        allowed: true
      };
    }
    
    // Check if user is in cooldown
    if (isInCooldown()) {
      return {
        allowed: false,
        reason: 'COOLDOWN',
        message: 'You are currently in a cooldown period.'
      };
    }
    
    // Check if user has reached weekly changes limit
    const totalChanges = usageStats.changesThisWeek + usageStats.dramaChangesThisWeek;
    if (totalChanges >= SUBSCRIPTION_LIMITS.FREE.MAX_CHANGES_PER_WEEK) {
      return {
        allowed: false,
        reason: 'WEEKLY_LIMIT',
        message: 'You have reached your weekly limit for removing favorites.'
      };
    }
    
    return {
      allowed: true
    };
  };

  // Function to update usageStats with latest counts from Firestore
  const refreshCountsFromFirestore = useCallback(async (skipLoading = false) => {
    if (!currentUser) return;

    try {
      console.log('Refreshing counts directly from Firestore');
      if (!skipLoading) {
        setLoading(true);
      }
      
      // Get user document to get actual counts
      const userRef = doc(db, 'users', currentUser.uid);
      const userDoc = await getDoc(userRef);
      
      if (userDoc.exists()) {
        const userData = userDoc.data();
        const favorites = userData.favorites || [];
        const dramas = userData.dramas || [];
        
        // Update local state with actual counts from Firestore
        setUsageStats(prev => ({
          ...prev,
          favoritesCount: favorites.length,
          dramasCount: dramas.length
        }));
        
        console.log(`Updated counts from Firestore: favorites=${favorites.length}, dramas=${dramas.length}`);
      }
    } catch (error) {
      console.error('Error refreshing counts from Firestore:', error);
    } finally {
      if (!skipLoading) {
        setLoading(false);
      }
    }
  }, [currentUser]);

  // Context value
  const value = {
    isPremium: usageStats.isPremium,
    tierName: usageStats.tierName,
    loading,
    usageStats,
    LIMITS: SUBSCRIPTION_LIMITS,
    incrementFavoritesCount,
    decrementFavoritesCount,
    resetFavoritesCount,
    incrementDramasCount,
    decrementDramasCount,
    resetDramasCount,
    recordFavoriteChange,
    recordDramaChange,
    isInCooldown,
    getFormattedTimeRemaining,
    canMakeChange,
    upgradeToPremium,
    getRemainingCounts,
    navigateToPremiumUpgrade,
    canAddFavorite,
    canRemoveFavorite,
    canAddDrama,
    isSubscribed,
    refreshCountsFromFirestore,
    getWeeklyChangesCount,
    getSubscriptionTier
  };

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  );
}; 