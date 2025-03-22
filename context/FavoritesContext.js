import React, { createContext, useState, useContext, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import alertService from '../services/alertService';

// Create context
const FavoritesContext = createContext();

// Custom hook to use the favorites context
export const useFavorites = () => useContext(FavoritesContext);

// Provider component
export const FavoritesProvider = ({ children }) => {
  const [favorites, setFavorites] = useState([]);
  const [processingFavorite, setProcessingFavorite] = useState(false);
  const [processingItem, setProcessingItem] = useState(null);
  const [isAddingToFavorites, setIsAddingToFavorites] = useState(false);

  // Load favorites from storage on mount
  useEffect(() => {
    const loadFavorites = async () => {
      try {
        const storedFavorites = await AsyncStorage.getItem('favorites');
        if (storedFavorites) {
          setFavorites(JSON.parse(storedFavorites));
        }
      } catch (error) {
        alertService.showError('Failed to load favorites', error);
      }
    };

    loadFavorites();
  }, []);

  // Save favorites to storage whenever they change
  useEffect(() => {
    const saveFavorites = async () => {
      try {
        await AsyncStorage.setItem('favorites', JSON.stringify(favorites));
      } catch (error) {
        alertService.showError('Failed to save favorites', error);
      }
    };

    if (favorites.length > 0) {
      saveFavorites();
    }
  }, [favorites]);

  // Check if an item is in favorites
  const isFavorite = (itemId, type) => {
    return favorites.some(item => item.id === itemId && item.type === type);
  };

  // Add or remove an item from favorites
  const toggleFavorite = async (item, type) => {
    try {
      setProcessingFavorite(true);
      setProcessingItem(item.id);
      setIsAddingToFavorites(!isFavorite(item.id, type));

      // Simulate network delay for demonstration
      await new Promise(resolve => setTimeout(resolve, 1000));

      const itemWithType = { ...item, type };
      
      if (isFavorite(item.id, type)) {
        // Remove from favorites
        const updatedFavorites = favorites.filter(
          fav => !(fav.id === item.id && fav.type === type)
        );
        setFavorites(updatedFavorites);
        alertService.showSuccess(`Removed from favorites`);
      } else {
        // Add to favorites
        const updatedFavorites = [...favorites, itemWithType];
        setFavorites(updatedFavorites);
        alertService.showSuccess(`Added to favorites`);
      }
    } catch (error) {
      alertService.showError('Error updating favorites', error);
    } finally {
      setProcessingFavorite(false);
      setProcessingItem(null);
    }
  };

  // Value provided to consumers
  const value = {
    favorites,
    processingFavorite,
    processingItem,
    isAddingToFavorites,
    isFavorite,
    toggleFavorite
  };

  return (
    <FavoritesContext.Provider value={value}>
      {children}
    </FavoritesContext.Provider>
  );
};

export default FavoritesContext; 