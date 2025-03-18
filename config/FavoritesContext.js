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
  // Track weekly changes directly in this context
  const [weeklyChangesCount, setWeeklyChangesCount] = useState(0);
  // Track if any favorite operation is in progress
  const [processingFavorite, setProcessingFavorite] = useState(false);
  const { currentUser } = useAuth();
  
  // Use the subscription context for limits and premium status
  const { isPremium, LIMITS, resetFavoritesCount } = useSubscription();

  // Max counts based on subscription
  const maxFavorites = isPremium ? LIMITS.PREMIUM.MAX_FAVORITES : LIMITS.FREE.MAX_FAVORITES;
  const maxWeeklyChanges = isPremium ? Infinity : LIMITS.FREE.MAX_CHANGES_PER_WEEK;

  // Load favorites and change count when user changes
  useEffect(() => {
    loadFavoritesAndCounts();
  }, [currentUser]);

  // Keep subscription context updated with our local state
  useEffect(() => {
    if (currentUser) {
      resetFavoritesCount(favorites.length);
    }
  }, [favorites, currentUser]);

  // Function to load favorites and weekly change counts from Firestore
  const loadFavoritesAndCounts = async () => {
    if (!currentUser) {
      setFavorites([]);
      setWeeklyChangesCount(0);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      
      // Load favorites
      const userFavorites = await firestoreService.getUserFavorites(currentUser.uid);
      
      // Load subscription data to get weekly changes
      const subscriptionData = await firestoreService.getUserSubscription(currentUser.uid);
      
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
      
      // Set weekly changes count
      let changesThisWeek = 0;
      if (subscriptionData && subscriptionData.success && subscriptionData.data) {
        changesThisWeek = subscriptionData.data.changesThisWeek || 0;
        setWeeklyChangesCount(changesThisWeek);
      } else {
        setWeeklyChangesCount(0);
      }
      
      console.log(`Loaded data: ${userFavorites?.length || 0} favorites, ${changesThisWeek}/${maxWeeklyChanges} weekly changes used`);
    } catch (error) {
      console.error('Error loading favorites and counts:', error);
      setFavorites([]);
      setWeeklyChangesCount(0);
    } finally {
      setLoading(false);
    }
  };
  
  // Function to update weekly changes count in both local state and Firestore
  const updateWeeklyChangesCount = async (newCount) => {
    setWeeklyChangesCount(newCount);
    if (currentUser) {
      try {
        await firestoreService.updateUserSubscription(currentUser.uid, {
          changesThisWeek: newCount
        });
      } catch (error) {
        console.error('Error updating weekly changes count:', error);
      }
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
    if (!currentUser) {
      Alert.alert('Login Required', 'Please login to manage favorites');
      return false;
    }

    // Check if already in favorites
    if (!isInFavorites(animeId)) {
      Alert.alert('Not in Favorites', 'This anime is not in your favorites');
      return false;
    }

    // Check weekly changes limit for free users - strict check against the limit
    // Free users can make exactly maxWeeklyChanges removals per week
    if (!isPremium && weeklyChangesCount >= maxWeeklyChanges) {
      Alert.alert(
        'Weekly Changes Limit Reached',
        `Free users can only remove ${maxWeeklyChanges} anime from their favorites per week. Upgrade to premium for unlimited changes!`
      );
      return false;
    }

    // If already processing, don't allow another operation
    if (processingFavorite) {
      return false;
    }

    try {
      setProcessingFavorite(true);
      
      // First update the state optimistically
      const updatedFavorites = favorites.filter(favorite => favorite.mal_id !== animeId);
      setFavorites(updatedFavorites);
      
      // Then remove from Firestore
      await firestoreService.removeAnimeFromFavorites(currentUser.uid, animeId);
      
      // Update weekly changes count
      const newWeeklyCount = weeklyChangesCount + 1;
      await updateWeeklyChangesCount(newWeeklyCount);
      
      // Log to console for debugging
      console.log(`Removed anime. Weekly changes count: ${newWeeklyCount}/${maxWeeklyChanges}`);
      
      return true;
    } catch (error) {
      console.error('Error removing from favorites:', error);
      
      // Rollback the state change if the operation failed
      setFavorites(favorites);
      
      Alert.alert('Error', 'Failed to remove from favorites');
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