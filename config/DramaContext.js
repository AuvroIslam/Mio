import React, { createContext, useContext, useState, useEffect } from 'react';
import { Alert } from 'react-native';
import { useAuth } from './AuthContext';
import { useSubscription } from './SubscriptionContext';
import firestoreService from '../services/firestoreService';

// Create the Drama Context
const DramaContext = createContext();

// Custom hook to use the drama context
export const useDramas = () => {
  return useContext(DramaContext);
};

// Provider component to wrap our app and provide drama context
export const DramaProvider = ({ children }) => {
  const [dramas, setDramas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processingDrama, setProcessingDrama] = useState(false);
  const { currentUser } = useAuth();
  
  // Use the subscription context for limits and premium status
  const { 
    isPremium, 
    LIMITS, 
    resetDramasCount,
    recordDramaChange,
    canAddDrama,
    canRemoveDrama,
    usageStats,
    isInCooldown,
    refreshCountsFromFirestore,
    getFormattedTimeRemaining
  } = useSubscription();

  // Max counts based on subscription
  const maxDramas = isPremium ? LIMITS.PREMIUM.MAX_DRAMAS : LIMITS.FREE.MAX_DRAMAS;
  // Max weekly changes either infinity for premium or the defined limit for free
  const maxWeeklyChanges = isPremium ? Infinity : LIMITS.FREE.MAX_CHANGES_PER_WEEK;
  
  // Get the weekly changes count directly from usageStats
  const weeklyChangesCount = usageStats.changesThisWeek || 0;

  // Load user dramas when user changes
  useEffect(() => {
    loadUserDramas();
  }, [currentUser]);

  // Keep subscription context updated with our local state
  useEffect(() => {
    if (currentUser && resetDramasCount) {
      resetDramasCount(dramas.length);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dramas, currentUser]);

  // Function to sync drama count with Firestore
  const syncDramaCount = async (count) => {
    if (!currentUser) return;
    
    console.log(`Syncing drama count in Firestore: ${count}`);
    try {
      // Update local state in subscription context first
      if (resetDramasCount) {
        resetDramasCount(count);
      }
      
      // Update Firestore directly to ensure consistency
      await firestoreService.updateDramaCount(currentUser.uid, count);
      
      // Don't refresh counts automatically after every sync
      // This will be done only after full operations complete
    } catch (error) {
      console.error('Error syncing drama count:', error);
    }
  };

  // Function to load user dramas from Firestore
  const loadUserDramas = async () => {
    if (!currentUser) {
      setDramas([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      
      // Load dramas from Firestore
      const userDramas = await firestoreService.getUserDramas(currentUser.uid);
      
      if (userDramas && userDramas.length > 0) {
        // Create a unique clientKey for each drama for React's key prop
        const dramasWithClientKey = userDramas.map(drama => ({
          ...drama,
          clientKey: `${drama.id}_${Date.now()}_${Math.random().toString(36).substring(2,11)}`
        }));
        
        setDramas(dramasWithClientKey);
        
        // Explicitly sync the count with Firestore
        syncDramaCount(dramasWithClientKey.length);
      } else {
        setDramas([]);
        // Reset count to 0 if no dramas
        syncDramaCount(0);
      }
      
      // Also refresh all counts from Firestore
      await refreshCountsFromFirestore();
      
      console.log(`Loaded drama data: ${userDramas?.length || 0} dramas, weekly changes: ${weeklyChangesCount}/${maxWeeklyChanges}`);
    } catch (error) {
      console.error('Error loading dramas:', error);
      setDramas([]);
      syncDramaCount(0);
    } finally {
      setLoading(false);
    }
  };

  // Function to check if a drama is already in favorites
  const isInDramas = (dramaId) => {
    return dramas.some(drama => drama.id === dramaId);
  };

  // Function to add a drama to favorites
  const addToDramas = async (drama) => {
    if (!currentUser) {
      Alert.alert('Login Required', 'Please login to add favorite dramas');
      return false;
    }

    // Check if already in dramas
    if (isInDramas(drama.id)) {
      Alert.alert('Already Added', 'This drama is already in your favorites');
      return false;
    }

    // If already processing, don't allow another operation
    if (processingDrama) {
      return false;
    }
    
    // Set processing flag at the beginning
    setProcessingDrama(true);
    
    try {
      // Refresh counts from Firestore before checking limits, but don't set loading true
      await refreshCountsFromFirestore(true);
      
      // Check if the user has reached their drama limit
      const currentDramaCount = dramas.length;
      console.log(`Current drama count: ${currentDramaCount}, max allowed: ${maxDramas}, usageStats.dramasCount: ${usageStats.dramasCount}`);
      
      if (currentDramaCount >= maxDramas && !isPremium) {
        Alert.alert(
          'Drama Limit Reached', 
          `You can only have ${maxDramas} favorite dramas with a free account. Upgrade to premium for unlimited favorites!`,
          [
            { text: 'OK' },
            { 
              text: 'Upgrade to Premium', 
              onPress: () => {
                const route = navigateToPremiumScreen();
                console.log(`Navigation to ${route} requested but can't be performed from context`);
              } 
            }
          ]
        );
        console.log("Cannot add drama: LIMIT_REACHED");
        return false;
      }
      
      // Add a unique clientKey for React
      const dramaWithClientKey = {
        ...drama,
        clientKey: `${drama.id}_${Date.now()}_${Math.random().toString(36).substring(2,11)}`
      };
      
      // First update the state optimistically
      const updatedDramas = [...dramas, dramaWithClientKey];
      setDramas(updatedDramas);
      
      // Then save to Firestore
      const result = await firestoreService.addDrama(currentUser.uid, drama);
      
      if (result.success) {
        // Only update counts if the operation was successful
        await syncDramaCount(updatedDramas.length);
        console.log(`Successfully added drama ${drama.id} to favorites. New count: ${updatedDramas.length}`);
        
        // After a successful add, refresh counts without triggering loading screen
        setTimeout(() => {
          refreshCountsFromFirestore(true);
        }, 500);
        
        return true;
      } else {
        // If Firestore update fails, revert local state
        setDramas(dramas);
        throw new Error(result.error || 'Failed to add drama to Firestore');
      }
    } catch (error) {
      console.error('Error adding drama to favorites:', error);
      
      // Rollback the state change if the operation failed
      setDramas(dramas);
      
      Alert.alert('Error', error.message || 'Failed to add drama to favorites');
      return false;
    } finally {
      // Always reset processingDrama flag
      setProcessingDrama(false);
    }
  };

  // Function to remove a drama from favorites
  const removeFromDramas = async (dramaId) => {
    console.log(`Attempting to remove drama ${dramaId} from favorites`);
    
    if (processingDrama) {
      console.log('Already processing another drama operation');
      return false;
    }
    
    if (!currentUser) {
      console.log('No current user, cannot remove drama');
      return false;
    }

    // Check if the drama exists in favorites
    if (!isInDramas(dramaId)) {
      console.log(`Drama ${dramaId} not found in favorites`);
      return false;
    }
    
    // Set processing flag at the beginning
    setProcessingDrama(true);

    try {
      // Refresh counts from Firestore before checking limits, but don't set loading to true
      await refreshCountsFromFirestore(true);
      
      // For free users, check if they're allowed to make changes
      if (!isPremium) {
        // Check if user is in cooldown
        if (isInCooldown()) {
          const remainingTime = getFormattedTimeRemaining();
          Alert.alert(
            'Cooldown Active',
            `You are currently in a cooldown period. Please wait ${remainingTime} before removing more favorites, or upgrade to premium for unlimited changes.`,
            [
              { text: 'OK' },
              { 
                text: 'Upgrade to Premium', 
                onPress: () => {
                  const route = navigateToPremiumScreen();
                  console.log(`Navigation to ${route} requested but can't be performed from context`);
                } 
              }
            ]
          );
          setProcessingDrama(false);
          return false;
        }
        
        // Check if user has reached weekly limit
        if (weeklyChangesCount >= maxWeeklyChanges) {
          Alert.alert(
            'Weekly Limit Reached',
            `You have reached your weekly limit of ${maxWeeklyChanges} changes. Upgrade to premium for unlimited changes!`,
            [
              { text: 'OK' },
              { 
                text: 'Upgrade to Premium', 
                onPress: () => {
                  const route = navigateToPremiumScreen();
                  console.log(`Navigation to ${route} requested but can't be performed from context`);
                } 
              }
            ]
          );
          setProcessingDrama(false);
          return false;
        }
      }
      
      // Store the original dramas for rollback in case of error
      const originalDramas = [...dramas];
      
      // First update local state (optimistic update)
      const updatedDramas = dramas.filter(drama => drama.id !== dramaId);
      setDramas(updatedDramas);
      
      // Then remove from Firestore
      console.log(`Calling firestoreService.removeDramaFromFavorites(${currentUser.uid}, ${dramaId})`);
      const result = await firestoreService.removeDramaFromFavorites(currentUser.uid, dramaId);
      
      if (!result || !result.success) {
        // If Firestore update fails, revert local state
        console.error('Failed to remove drama from Firestore, reverting state');
        setDramas(originalDramas);
        
        const errorMsg = result?.error || 'Unknown error';
        console.error(`Failed to remove drama: ${errorMsg}`);
        Alert.alert('Error', errorMsg || 'Failed to remove drama from favorites');
        return false;
      }
      
      // Update the count in Firestore to ensure consistency
      await syncDramaCount(updatedDramas.length);
      
      // Record the drama change for cooldown tracking (only for free users)
      if (!isPremium) {
        console.log('Recording drama change for cooldown tracking');
        const recordResult = await recordDramaChange();
        console.log(`Drama change recorded, result: ${recordResult}, current counter: ${usageStats.changesThisWeek}`);
      }
      
      // After a successful remove, refresh counts without triggering loading screen
      setTimeout(() => {
        refreshCountsFromFirestore(true);
      }, 500);
      
      console.log(`Drama ${dramaId} successfully removed from favorites. New count: ${updatedDramas.length}`);
      return true;
    } catch (error) {
      // If error occurs, revert local state
      console.error('Error removing drama from favorites:', error);
      
      // Ensure we have original dramas to revert to
      if (dramas.some(drama => drama.id === dramaId)) {
        // No need to revert if the drama is still in the list
      } else {
        // Revert to original state if we have it
        const dramaToRestore = dramas.find(d => d.id === dramaId);
        if (dramaToRestore) {
          setDramas(prev => [...prev, dramaToRestore]);
        }
      }
      
      Alert.alert('Error', 'Failed to remove drama from favorites. Please try again.');
      return false;
    } finally {
      setProcessingDrama(false);
    }
  };

  // Ensure we have a navigate function available
  const navigateToPremiumScreen = () => {
    return 'Subscription';
  };

  // Create context value object
  const value = {
    dramas,
    loading,
    isInDramas,
    addToDramas,
    removeFromDramas,
    loadUserDramas,
    weeklyChangesCount,
    maxDramas,
    maxWeeklyChanges,
    processingDrama
  };

  return (
    <DramaContext.Provider value={value}>
      {children}
    </DramaContext.Provider>
  );
};

export default DramaProvider; 