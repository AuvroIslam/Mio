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
    MAX_CHANGES_PER_WEEK: 5,
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
        });
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        
        // Get subscription status from Firestore
        const response = await firestoreService.getUserSubscription(currentUser.uid);
        
        if (response.success && response.data) {
          setIsPremium(response.data.isPremium || false);
          
          // Check if we need to reset weekly counters
          const lastReset = response.data.lastResetDate ? new Date(response.data.lastResetDate) : new Date();
          const currentDate = new Date();
          const daysSinceReset = Math.floor((currentDate - lastReset) / (1000 * 60 * 60 * 24));
          
          // Reset counters if it's been more than 7 days
          if (daysSinceReset >= 7) {
            const resetStats = {
              ...response.data,
              changesThisWeek: 0,
              matchesThisWeek: 0,
              lastResetDate: currentDate.toISOString()
            };
            
            setUsageStats(resetStats);
            await firestoreService.updateUserSubscription(currentUser.uid, resetStats);
          } else {
            setUsageStats(response.data);
          }
        } else {
          // Initialize with default values if no data exists
          const initialData = {
            isPremium: false,
            favoritesCount: 0,
            changesThisWeek: 0,
            matchesThisWeek: 0,
            lastResetDate: new Date().toISOString(),
          };
          
          setIsPremium(false);
          setUsageStats(initialData);
          await firestoreService.updateUserSubscription(currentUser.uid, initialData);
        }
      } catch (error) {
        console.error('Error loading subscription status:', error);
      } finally {
        setLoading(false);
      }
    };

    loadSubscriptionStatus();
  }, [currentUser]);

  // Update usage stats in Firestore
  const updateUsageStats = async (newStats) => {
    if (!currentUser) return;
    
    try {
      const updatedStats = { ...usageStats, ...newStats };
      setUsageStats(updatedStats);
      await firestoreService.updateUserSubscription(currentUser.uid, {
        ...updatedStats,
        isPremium
      });
    } catch (error) {
      console.error('Error updating usage stats:', error);
    }
  };

  // Increment favorites count
  const incrementFavoritesCount = async () => {
    const newCount = usageStats.favoritesCount + 1;
    await updateUsageStats({ favoritesCount: newCount });
    return newCount;
  };

  // Decrement favorites count
  const decrementFavoritesCount = async () => {
    const newCount = Math.max(0, usageStats.favoritesCount - 1);
    await updateUsageStats({ favoritesCount: newCount });
    return newCount;
  };

  // Record a favorites change
  const recordFavoriteChange = async () => {
    const newChanges = usageStats.changesThisWeek + 1;
    await updateUsageStats({ changesThisWeek: newChanges });
    return newChanges;
  };

  // Record a match
  const recordMatch = async () => {
    const newMatches = usageStats.matchesThisWeek + 1;
    await updateUsageStats({ matchesThisWeek: newMatches });
    return newMatches;
  };

  // Reset favorites count to a specific value (for syncing with actual favorites)
  const resetFavoritesCount = async (actualCount) => {
    await updateUsageStats({ favoritesCount: actualCount });
    return actualCount;
  };

  // Check if user can add more favorites - uses the actual count passed in by FavoritesContext
  const canAddFavorite = (actualFavoritesCount) => {
    const count = actualFavoritesCount !== undefined ? actualFavoritesCount : usageStats.favoritesCount;
    const limit = isPremium 
      ? SUBSCRIPTION_LIMITS.PREMIUM.MAX_FAVORITES 
      : SUBSCRIPTION_LIMITS.FREE.MAX_FAVORITES;
    
    return count < limit;
  };

  // Check if user can make more changes this week
  const canMakeChange = () => {
    if (isPremium) return true;
    
    return usageStats.changesThisWeek < SUBSCRIPTION_LIMITS.FREE.MAX_CHANGES_PER_WEEK;
  };

  // Check if user can have more matches this week
  const canHaveMoreMatches = () => {
    if (isPremium) return true;
    
    return usageStats.matchesThisWeek < SUBSCRIPTION_LIMITS.FREE.MAX_MATCHES_PER_WEEK;
  };

  // Upgrade to premium
  const upgradeToPremium = async () => {
    if (!currentUser) return false;
    
    try {
      // In a real app, this would involve payment processing
      // For now, we'll just update the status
      setIsPremium(true);
      await firestoreService.updateUserSubscription(currentUser.uid, {
        ...usageStats,
        isPremium: true
      });
      
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

  // Remaining counts
  const getRemainingCounts = () => {
    if (isPremium) {
      return {
        favorites: SUBSCRIPTION_LIMITS.PREMIUM.MAX_FAVORITES - usageStats.favoritesCount,
        changes: Infinity,
        matches: Infinity
      };
    }
    
    return {
      favorites: SUBSCRIPTION_LIMITS.FREE.MAX_FAVORITES - usageStats.favoritesCount,
      changes: SUBSCRIPTION_LIMITS.FREE.MAX_CHANGES_PER_WEEK - usageStats.changesThisWeek,
      matches: SUBSCRIPTION_LIMITS.FREE.MAX_MATCHES_PER_WEEK - usageStats.matchesThisWeek
    };
  };

  // Current subscription tier
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
    LIMITS: SUBSCRIPTION_LIMITS
  };

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  );
}; 