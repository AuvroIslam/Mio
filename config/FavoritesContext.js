import React, { createContext, useState, useContext, useEffect } from 'react';
import { Alert } from 'react-native';
import { useAuth } from './AuthContext';
import firestoreService from '../services/firestoreService';

// Create a context for favorites management
const FavoritesContext = createContext();

// Custom hook to access the favorites context
export const useFavorites = () => useContext(FavoritesContext);

// Provider component that wraps the app and provides favorites functionality
export const FavoritesProvider = ({ children }) => {
  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading] = useState(false);
  const { currentUser } = useAuth();

  // Load favorites when the user changes
  useEffect(() => {
    if (currentUser) {
      loadFavorites();
    } else {
      setFavorites([]);
    }
  }, [currentUser]);

  // Function to ensure an anime has a clientKey
  const ensureClientKey = (anime) => {
    if (!anime) return null;
    if (anime.clientKey) return anime;
    
    return {
      ...anime,
      clientKey: `anime_${anime.mal_id}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
    };
  };

  // Function to load favorites from Firestore
  const loadFavorites = async () => {
    if (!currentUser) return;
    
    try {
      setLoading(true);
      const userFavorites = await firestoreService.getUserFavorites(currentUser.uid);
      
      // Create a map of anime by ID to ensure unique entries
      const uniqueFavorites = userFavorites.reduce((acc, anime) => {
        // Add a unique clientKey for React rendering
        const animeWithClientKey = ensureClientKey(anime);
        acc.set(anime.mal_id.toString(), animeWithClientKey);
        return acc;
      }, new Map());
      
      // Convert back to array
      setFavorites(Array.from(uniqueFavorites.values()));
    } catch (error) {
      console.error('Error loading favorites:', error);
    } finally {
      setLoading(false);
    }
  };

  // Function to check if an anime is in favorites
  const isInFavorites = (animeId) => {
    if (!animeId) return false;
    const animeIdStr = animeId.toString();
    return favorites.some(fav => 
      fav.mal_id.toString() === animeIdStr
    );
  };

  // Function to add an anime to favorites
  const addToFavorites = async (anime) => {
    if (!currentUser) {
      Alert.alert('Login Required', 'Please login to add favorites');
      return { success: false };
    }
    
    try {
      setLoading(true);
      
      // Check if already in favorites to prevent duplicates
      if (isInFavorites(anime.mal_id)) {
        return { success: true, message: 'Already in favorites' };
      }
      
      const result = await firestoreService.addFavorite(currentUser.uid, anime);
      
      if (result.success) {
        // Add a unique clientKey for React rendering
        const animeWithClientKey = ensureClientKey(anime);
        
        // Update local state with the new favorite
        setFavorites(prevFavorites => {
          // Filter out any existing entries with the same mal_id (just to be sure)
          const filteredFavorites = prevFavorites.filter(
            fav => fav.mal_id.toString() !== anime.mal_id.toString()
          );
          
          // Add the new anime with its unique clientKey
          return [...filteredFavorites, animeWithClientKey];
        });
        
        return { success: true, message: 'Added to favorites' };
      } else {
        throw new Error(result.error || 'Failed to add to favorites');
      }
    } catch (error) {
      console.error('Error adding to favorites:', error);
      return { success: false, error: error.message };
    } finally {
      setLoading(false);
    }
  };

  // Function to remove an anime from favorites
  const removeFromFavorites = async (animeId) => {
    if (!currentUser) {
      Alert.alert('Login Required', 'Please login to manage favorites');
      return { success: false };
    }
    
    try {
      setLoading(true);
      
      // First update the local state for immediate UI feedback
      setFavorites(prevFavorites => 
        prevFavorites.filter(fav => fav.mal_id.toString() !== animeId.toString())
      );
      
      // Then update the database
      await firestoreService.removeAnimeFromFavorites(currentUser.uid, animeId);
      
      return { success: true, message: 'Removed from favorites' };
    } catch (error) {
      console.error('Error removing from favorites:', error);
      
      // If there was an error, reload favorites to ensure UI is in sync
      loadFavorites();
      
      return { success: false, error: error.message };
    } finally {
      setLoading(false);
    }
  };

  // Check if an anime is in favorites (for UI indicators)
  const checkFavoriteStatus = (animeId) => {
    return isInFavorites(animeId);
  };

  // Context value with all the favorites functionality
  const value = {
    favorites,
    loading,
    loadFavorites,
    addToFavorites,
    removeFromFavorites,
    checkFavoriteStatus,
    isInFavorites
  };

  return (
    <FavoritesContext.Provider value={value}>
      {children}
    </FavoritesContext.Provider>
  );
};

export default FavoritesContext; 