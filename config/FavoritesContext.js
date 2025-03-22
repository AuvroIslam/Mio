import React, { createContext, useContext, useState, useEffect } from 'react';
import { Alert } from 'react-native';
import { useAuth } from './AuthContext';
import { useSubscription } from './SubscriptionContext';
import firestoreService from '../services/firestoreService';

// Create the Favorites Context
const FavoritesContext = createContext();

// Custom hook to use the favorites context
export const useFavorites = () => {
  return useContext(FavoritesContext);
};

// Provider component to wrap our app and provide favorites context
export const FavoritesProvider = ({ children }) => {
  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading] = useState(true);
  // Track if any favorite operation is in progress
  const [processingFavorite, setProcessingFavorite] = useState(false);
  const { currentUser } = useAuth();
  
  // Use the subscription context for limits and premium status
  const { 
    isPremium, 
    LIMITS, 
    resetFavoritesCount, 
    recordFavoriteChange, 
    canMakeChange,
    usageStats,
    decrementFavoritesCount,
    incrementFavoritesCount,
    isInCooldown,
    canAddFavorite,
    canRemoveFavorite,
    refreshCountsFromFirestore,
    getFormattedTimeRemaining
  } = useSubscription();

  // Max counts based on subscription
  const maxFavorites = isPremium ? LIMITS.PREMIUM.MAX_FAVORITES : LIMITS.FREE.MAX_FAVORITES;
  const maxWeeklyChanges = isPremium ? Infinity : LIMITS.FREE.MAX_CHANGES_PER_WEEK;
  
  // Get the weekly changes count directly from usageStats
  const weeklyChangesCount = usageStats.changesThisWeek || 0;

  // Load favorites when user changes
  useEffect(() => {
    loadFavorites();
  }, [currentUser]);

  // Keep subscription context updated with our local state
  useEffect(() => {
    if (currentUser && resetFavoritesCount) {
      resetFavoritesCount(favorites.length);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [favorites, currentUser]);

  // Function to load favorites from Firestore
  const loadFavorites = async () => {
    if (!currentUser) {
      setFavorites([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      
      // Load favorites
      const userFavorites = await firestoreService.getUserFavorites(currentUser.uid);
      
      if (userFavorites && userFavorites.length > 0) {
        // Create a unique clientKey for each anime for React's key prop
        const favoritesWithClientKey = userFavorites.map(anime => ({
          ...anime,
          clientKey: `${anime.mal_id}_${Date.now()}_${Math.random().toString(36).substring(2,11)}`
        }));
        
        setFavorites(favoritesWithClientKey);
        
        // Explicitly sync the count with Firestore
        syncFavoriteCount(favoritesWithClientKey.length);
      } else {
        setFavorites([]);
        // Reset count to 0 if no favorites
        syncFavoriteCount(0);
      }
      
      // Also refresh all counts from Firestore
      await refreshCountsFromFirestore(true);
      
      console.log(`Loaded data: ${userFavorites?.length || 0} favorites, weekly changes: ${weeklyChangesCount}/${maxWeeklyChanges}`);
    } catch (error) {
      console.error('Error loading favorites:', error);
      setFavorites([]);
      syncFavoriteCount(0);
    } finally {
      setLoading(false);
    }
  };

  // Function to explicitly sync the favorite count with Firestore
  const syncFavoriteCount = async (count) => {
    if (!currentUser) return;
    
    console.log(`Syncing favorite count in Firestore: ${count}`);
    try {
      // Update local state in subscription context
      if (resetFavoritesCount) {
        resetFavoritesCount(count);
      }
      
      // Update Firestore directly to ensure consistency
      await firestoreService.updateFavoriteCount(currentUser.uid, count);
      
      // Don't refresh after every sync
    } catch (error) {
      console.error('Error syncing favorite count:', error);
    }
  };

  // Function to check if an anime is already in favorites
  const isInFavorites = (animeId) => {
    return favorites.some(favorite => favorite.mal_id === animeId);
  };

  // Function to add an anime to favorites
  const addToFavorites = async (anime) => {
    if (!currentUser) {
      Alert.alert('Login Required', 'Please login to add favorites');
      return false;
    }

    // Check if already in favorites
    if (isInFavorites(anime.mal_id)) {
      Alert.alert('Already Added', 'This anime is already in your favorites');
      return false;
    }

    // If already processing, don't allow another operation
    if (processingFavorite) {
      return false;
    }

    // Set processing flag before doing any async work
    setProcessingFavorite(true);

    try {
      // Refresh counts from Firestore before checking limits, but skip loading
      await refreshCountsFromFirestore(true);
      
      // Get the current accurate count
      const currentFavoritesCount = favorites.length;
      console.log(`Current favorites count: ${currentFavoritesCount}, max allowed: ${maxFavorites}, usageStats.favoritesCount: ${usageStats.favoritesCount}`);
      
      if (currentFavoritesCount >= maxFavorites && !isPremium) {
        Alert.alert(
          'Favorites Limit Reached', 
          `You can only have ${maxFavorites} favorites with a free account. Upgrade to premium for unlimited favorites!`,
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
        console.log("Could not add to favorites - reached limit of " + maxFavorites);
        return false;
      }
      
      // Add a unique clientKey for React
      const animeWithClientKey = {
        ...anime,
        clientKey: `${anime.mal_id}_${Date.now()}_${Math.random().toString(36).substring(2,11)}`
      };
      
      // First update the state optimistically
      const updatedFavorites = [...favorites, animeWithClientKey];
      setFavorites(updatedFavorites);
      
      // Then save to Firestore
      const result = await firestoreService.addFavorite(currentUser.uid, anime);
      
      if (result.success) {
        // Only update counts if the operation was successful
        await syncFavoriteCount(updatedFavorites.length);
        
        // After successful operation, refresh counts in background
        setTimeout(() => {
          refreshCountsFromFirestore(true);
        }, 500);
        
        console.log(`Successfully added anime ${anime.mal_id} to favorites. New count: ${updatedFavorites.length}`);
      return true;
      } else {
        // If Firestore update fails, revert local state
        setFavorites(favorites);
        throw new Error(result.error || 'Failed to add to favorites');
      }
    } catch (error) {
      console.error('Error adding to favorites:', error);
      
      // Rollback the state change if the operation failed
      setFavorites(favorites);
      
      Alert.alert('Error', 'Failed to add to favorites');
      return false;
    } finally {
      setProcessingFavorite(false);
    }
  };

  // Function to remove an anime from favorites
  const removeFromFavorites = async (animeId) => {
    console.log(`[FavoritesContext] Attempting to remove anime ${animeId} from favorites`);
    
    if (processingFavorite) {
      console.log('[FavoritesContext] Already processing another anime operation');
      return false;
    }
    
    if (!currentUser) {
      console.log('[FavoritesContext] No current user, cannot remove favorite');
      return false;
    }

    // Check if the anime exists in favorites
    if (!isInFavorites(animeId)) {
      console.log(`[FavoritesContext] Anime ${animeId} not found in favorites`);
      return false;
    }

    // Set processing flag before any async work
    setProcessingFavorite(true);
    
    try {
      // Refresh counts from Firestore before checking limits, skip loading
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
          setProcessingFavorite(false);
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
          setProcessingFavorite(false);
          return false;
        }
      }

      // Store original state for rollback
      const originalFavorites = [...favorites];
      const animeToRemove = favorites.find(anime => anime.mal_id === animeId);
      
      if (!animeToRemove) {
        console.log(`[FavoritesContext] Could not find anime with ID ${animeId} in favorites array`);
        setProcessingFavorite(false);
      return false;
    }

      console.log(`[FavoritesContext] Found anime to remove: ${animeToRemove.title || 'Untitled'} (ID: ${animeId})`);
      
      // First update local state (optimistic update)
      const updatedFavorites = favorites.filter(anime => anime.mal_id !== animeId);
      setFavorites(updatedFavorites);
      
      // Convert animeId to number if it's a string to ensure consistent handling
      const normalizedAnimeId = typeof animeId === 'string' ? parseInt(animeId, 10) : animeId;
      console.log(`[FavoritesContext] Using normalized animeId: ${normalizedAnimeId} (${typeof normalizedAnimeId})`);
      
      // Remove from Firestore
      console.log(`[FavoritesContext] Calling firestoreService.removeAnimeFromFavorites(${currentUser.uid}, ${normalizedAnimeId})`);
      const result = await firestoreService.removeAnimeFromFavorites(currentUser.uid, normalizedAnimeId);
      console.log(`[FavoritesContext] Firestore remove result:`, result);
      
      if (!result || !result.success) {
        // If Firestore update fails, revert local state
        console.error('[FavoritesContext] Firestore removal failed, reverting to original state');
        setFavorites(originalFavorites);
        
        const errorMsg = result?.error || 'Unknown error';
        console.error(`[FavoritesContext] Failed to remove favorite: ${errorMsg}`);
        Alert.alert('Error', errorMsg || 'Failed to remove from favorites');
        return false;
      }
      
      // Double-check that the anime was actually removed from Firestore
      console.log('[FavoritesContext] Verifying removal from Firestore...');
      const currentFavorites = await firestoreService.getUserFavorites(currentUser.uid);
      const stillExists = currentFavorites.some(anime => anime.mal_id === animeId);
      
      if (stillExists) {
        console.error(`[FavoritesContext] Anime ${animeId} still exists in Firestore despite successful removal operation!`);
        console.log('[FavoritesContext] Attempting second removal...');
        
        // Try a second removal
        const secondResult = await firestoreService.removeAnimeFromFavorites(currentUser.uid, normalizedAnimeId);
        
        if (!secondResult || !secondResult.success) {
          console.error('[FavoritesContext] Second removal attempt failed');
          // If second attempt fails, sync with Firestore state anyway
          setFavorites(currentFavorites.map(anime => ({
            ...anime,
            clientKey: `${anime.mal_id}_${Date.now()}_${Math.random().toString(36).substring(2,11)}`
          })));
          Alert.alert('Warning', 'Could not remove anime from favorites. Please try again later.');
          return false;
        }
        
        // After second attempt, check again
        const verifiedFavorites = await firestoreService.getUserFavorites(currentUser.uid);
        const stillExistsAfterSecondAttempt = verifiedFavorites.some(anime => anime.mal_id === animeId);
        
        if (stillExistsAfterSecondAttempt) {
          console.error('[FavoritesContext] Anime still exists after second removal attempt!');
          // Sync with Firestore state
          setFavorites(verifiedFavorites.map(anime => ({
            ...anime,
            clientKey: `${anime.mal_id}_${Date.now()}_${Math.random().toString(36).substring(2,11)}`
          })));
          Alert.alert('Warning', 'Could not remove anime from favorites due to sync issues. Please try again later.');
          return false;
        } else {
          // Second attempt succeeded
          console.log('[FavoritesContext] Second removal attempt succeeded');
          // Update our local state to match verified Firestore state
          setFavorites(verifiedFavorites.map(anime => ({
            ...anime,
            clientKey: `${anime.mal_id}_${Date.now()}_${Math.random().toString(36).substring(2,11)}`
          })));
        }
      } else {
        console.log(`[FavoritesContext] Verified: Anime ${animeId} successfully removed from Firestore`);
        // Update our local state to match verified Firestore state for consistency
        setFavorites(currentFavorites.map(anime => ({
          ...anime,
          clientKey: `${anime.mal_id}_${Date.now()}_${Math.random().toString(36).substring(2,11)}`
        })));
      }
      
      // Get the new actual count from Firestore
      const updatedFavoritesFromFirestore = await firestoreService.getUserFavorites(currentUser.uid);
      const actualFavoriteCount = updatedFavoritesFromFirestore.length;
      
      // Update the count in Firestore to ensure consistency
      console.log(`[FavoritesContext] Updating count in Firestore to match actual count: ${actualFavoriteCount}`);
      await syncFavoriteCount(actualFavoriteCount);
      
      // Record the favorite change for cooldown tracking (only for free users)
      if (!isPremium) {
        console.log('[FavoritesContext] Recording favorite change for cooldown tracking');
        const recordResult = await recordFavoriteChange();
        console.log(`[FavoritesContext] Favorite change recorded, result: ${recordResult}, current counter: ${usageStats.changesThisWeek}`);
      }
      
      // After successful operation, refresh counts in background
      setTimeout(() => {
        refreshCountsFromFirestore(true);
      }, 500);
      
      console.log(`[FavoritesContext] Anime ${animeId} successfully removed from favorites. New count: ${actualFavoriteCount}`);
      return true;
    } catch (error) {
      // If error occurs, revert local state
      console.error('[FavoritesContext] Error removing from favorites:', error);
      
      // Try to recover - first get current favorites from Firestore
      try {
        console.log('[FavoritesContext] Attempting recovery by fetching current Firestore state');
        const currentFavorites = await firestoreService.getUserFavorites(currentUser.uid);
        setFavorites(currentFavorites.map(anime => ({
          ...anime,
          clientKey: `${anime.mal_id}_${Date.now()}_${Math.random().toString(36).substring(2,11)}`
        })));
        console.log('[FavoritesContext] Recovery complete, favorites reset to Firestore state');
      } catch (recoveryError) {
        console.error('[FavoritesContext] Recovery failed:', recoveryError);
        // If recovery fails, reset to an empty array to be safe
        setFavorites([]);
      }
      
      Alert.alert('Error', 'Failed to remove from favorites. Please try again.');
      return false;
    } finally {
      setProcessingFavorite(false);
    }
  };

  // Ensure we have a navigate function available
  const navigateToPremiumScreen = () => {
    return 'Subscription';
  };

  // Create context value object
  const value = {
    favorites,
    loading,
    isInFavorites,
    addToFavorites,
    removeFromFavorites,
    weeklyChangesCount,
    maxFavorites,
    maxWeeklyChanges,
    processingFavorite
  };

  return (
    <FavoritesContext.Provider value={value}>
      {children}
    </FavoritesContext.Provider>
  );
};

export default FavoritesContext; 