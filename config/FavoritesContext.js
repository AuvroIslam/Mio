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
    usageStats // Access the usageStats directly from SubscriptionContext
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
    if (currentUser) {
      resetFavoritesCount(favorites.length);
    }
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
      } else {
        setFavorites([]);
      }
      
      console.log(`Loaded data: ${userFavorites?.length || 0} favorites, weekly changes: ${weeklyChangesCount}/${maxWeeklyChanges}`);
    } catch (error) {
      console.error('Error loading favorites:', error);
      setFavorites([]);
    } finally {
      setLoading(false);
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

    // Check if we've reached the favorites limit
    if (favorites.length >= maxFavorites) {
      Alert.alert(
        'Favorites Limit Reached', 
        `You can have up to ${maxFavorites} favorites with your current plan.${!isPremium ? ' Upgrade to premium for more!' : ''}`
      );
      return false;
    }

    // If already processing, don't allow another operation
    if (processingFavorite) {
      return false;
    }

    // Adding anime is always free, we don't count it against the weekly changes
    try {
      setProcessingFavorite(true);
      
      // Add a unique clientKey for React
      const animeWithClientKey = {
        ...anime,
        clientKey: `${anime.mal_id}_${Date.now()}_${Math.random().toString(36).substring(2,11)}`
      };
      
      // First update the state optimistically
      const updatedFavorites = [...favorites, animeWithClientKey];
      setFavorites(updatedFavorites);
      
      // Then save to Firestore
      await firestoreService.addFavorite(currentUser.uid, anime);
      
      return true;
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
    console.log('==========================================');
    console.log('REMOVE FROM FAVORITES CALLED FOR ANIME:', animeId);
    
    if (!currentUser) {
      console.log('NO USER LOGGED IN - CANCELLING');
      console.log('==========================================');
      Alert.alert('Login Required', 'Please login to manage favorites');
      return false;
    }

    // Check if already in favorites
    if (!isInFavorites(animeId)) {
      console.log('ANIME NOT IN FAVORITES - CANCELLING');
      console.log('==========================================');
      Alert.alert('Not in Favorites', 'This anime is not in your favorites');
      return false;
    }

    // Check if user can make changes (using the subscription context's logic)
    if (!canMakeChange()) {
      console.log('USER CANNOT MAKE CHANGES - COOLDOWN IS ACTIVE');
      console.log('USAGE STATS:', usageStats);
      console.log('==========================================');
      // The actual error message will be handled by the UI component
      return false;
    }

    // If already processing, don't allow another operation
    if (processingFavorite) {
      console.log('ALREADY PROCESSING A FAVORITE - CANCELLING');
      console.log('==========================================');
      return false;
    }

    try {
      console.log('STARTING REMOVAL PROCESS');
      setProcessingFavorite(true);
      
      // First update the state optimistically (remove the anime from favorites)
      const updatedFavorites = favorites.filter(favorite => favorite.mal_id !== animeId);
      setFavorites(updatedFavorites);
      console.log('LOCAL STATE UPDATED - FAVORITES COUNT:', updatedFavorites.length);
      
      // Then remove from Firestore
      console.log('REMOVING FROM FIRESTORE');
      await firestoreService.removeAnimeFromFavorites(currentUser.uid, animeId);
      console.log('REMOVED FROM FIRESTORE SUCCESSFULLY');
      
      // Record the change in subscription context
      console.log('RECORDING FAVORITE CHANGE FOR COOLDOWN');
      await recordFavoriteChange();
      
      // Log to console for debugging
      console.log(`REMOVAL COMPLETE - Weekly changes now: ${usageStats.changesThisWeek}/${maxWeeklyChanges}`);
      console.log('==========================================');
      
      return true;
    } catch (error) {
      console.error('Error removing from favorites:', error);
      
      // Rollback the state change if the operation failed
      setFavorites(favorites);
      
      Alert.alert('Error', 'Failed to remove from favorites');
      console.log('ERROR REMOVING FROM FAVORITES:', error.message);
      console.log('==========================================');
      return false;
    } finally {
      setProcessingFavorite(false);
    }
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