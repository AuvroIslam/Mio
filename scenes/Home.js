import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  Image,
  ActivityIndicator,
  Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../config/AuthContext';
import { firestoreService } from '../services/firestoreService';
import { useFocusEffect } from '@react-navigation/native';

const Home = ({ navigation, route }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [animeResults, setAnimeResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [favorites, setFavorites] = useState([]);
  const [pendingAdds, setPendingAdds] = useState([]);
  const { currentUser } = useAuth();
  
  // Use useFocusEffect to reload favorites every time the screen comes into focus
  // Also respond to route.params changes from Profile screen
  useFocusEffect(
    React.useCallback(() => {
      if (currentUser) {
        // Check if favoritesChanged flag was set by Profile screen
        const favoritesChanged = route.params?.favoritesChanged;
        
        // Clear the flag to prevent repeated reloads
        if (favoritesChanged) {
          navigation.setParams({ favoritesChanged: undefined });
        }
        
        // Always reload favorites when screen comes into focus or after changes
        console.log('Home screen in focus, reloading favorites');
        loadFavorites(true); // Pass true to force a fresh reload from Firestore
      }
      return () => {}; 
    }, [currentUser, route.params?.favoritesChanged])
  );

  // Load seasonal anime when component mounts
  useEffect(() => {
    if (!searchQuery.trim()) {
      loadSeasonalAnime();
    }
  }, []);

  const loadFavorites = useCallback(async (forceRefresh = false) => {
    if (!currentUser) return;
    
    try {
      // Only show loading if it's a forced refresh
      if (forceRefresh) {
        setLoading(true);
      }
      
      const userFavorites = await firestoreService.getUserFavorites(currentUser.uid);
      setFavorites(userFavorites);
      
      // Clear any pending adds that are now in favorites
      setPendingAdds(prev => 
        prev.filter(id => !userFavorites.some(fav => fav.mal_id === id))
      );
      
      // Update anime results to reflect current favorite status
      setAnimeResults(prevResults => {
        if (!prevResults.length) return prevResults;
        
        // Create a map of favorite IDs for quick lookup
        const favoriteIds = new Set(userFavorites.map(fav => fav.mal_id));
        
        // Return updated results with correct favorite status
        // Only create a new array if there are changes
        const needsUpdate = prevResults.some(anime => 
          (favoriteIds.has(anime.mal_id) && !anime.isFavorite) || 
          (!favoriteIds.has(anime.mal_id) && anime.isFavorite)
        );
        
        if (needsUpdate) {
          return prevResults.map(anime => ({
            ...anime,
            isFavorite: favoriteIds.has(anime.mal_id)
          }));
        }
        
        return prevResults;
      });
    } catch (error) {
      console.error('Failed to load favorites:', error);
      // Don't show alert for background loads
      if (forceRefresh) {
        Alert.alert('Error', 'Failed to refresh favorites. Please try again.');
      }
    } finally {
      if (forceRefresh) {
        setLoading(false);
      }
    }
  }, [currentUser]);

  // Fetch seasonal anime from the Jikan API
  const loadSeasonalAnime = async () => {
    setLoading(true);
    try {
      // Add delay for Jikan API rate limiting
      await new Promise(resolve => setTimeout(resolve, 400));
      
      const response = await fetch(`https://api.jikan.moe/v4/seasons/now?limit=20`);
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.data) {
        // Get favorite IDs for marking anime
        const favoriteIds = new Set(favorites.map(fav => fav.mal_id));
        
        // Mark favorites in results
        const markedResults = data.data.map(anime => ({
          ...anime,
          isFavorite: favoriteIds.has(anime.mal_id)
        }));
        
        setAnimeResults(markedResults);
      } else {
        setAnimeResults([]);
        Alert.alert('No Results', 'No seasonal anime found.');
      }
    } catch (error) {
      console.error('Error loading seasonal anime:', error);
      Alert.alert('Error', 'Failed to load seasonal anime. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Search anime based on the user's query
  const searchAnime = async () => {
    if (!searchQuery.trim()) {
      Alert.alert('Error', 'Please enter a search term');
      return;
    }

    setLoading(true);
    try {
      // Add delay for Jikan API rate limiting
      await new Promise(resolve => setTimeout(resolve, 400));
      
      const response = await fetch(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(searchQuery)}&limit=20`);
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.data) {
        // Get favorite IDs for marking anime
        const favoriteIds = new Set(favorites.map(fav => fav.mal_id));
        
        // Mark favorites in results
        const markedResults = data.data.map(anime => ({
          ...anime,
          isFavorite: favoriteIds.has(anime.mal_id)
        }));
        
        setAnimeResults(markedResults);
      } else {
        setAnimeResults([]);
        Alert.alert('No Results', 'No anime found matching your search');
      }
    } catch (error) {
      console.error('Error searching anime:', error);
      Alert.alert('Error', 'Failed to search anime. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const addToFavorites = async (anime) => {
    if (!currentUser) {
      Alert.alert('Sign In Required', 'Please sign in to add favorites');
      return;
    }
    
    try {
      // Optimistically update UI
      setPendingAdds(prev => [...prev, anime.mal_id]);
      
      // Mark as favorite in anime results
      setAnimeResults(prev => 
        prev.map(item => 
          item.mal_id === anime.mal_id 
            ? { ...item, isFavorite: true } 
            : item
        )
      );
      
      // Add to Firestore
      const result = await firestoreService.addFavorite(currentUser.uid, anime);
      
      if (result.success) {
        // Success! Update local favorites list for immediate UI feedback
        setFavorites(prev => {
          // Only add if not already in list
          if (!prev.some(fav => fav.mal_id === anime.mal_id)) {
            return [...prev, anime];
          }
          return prev;
        });
        
        Alert.alert('Success', 'Added to your favorites!');
      } else {
        // Revert optimistic update
        setPendingAdds(prev => prev.filter(id => id !== anime.mal_id));
        setAnimeResults(prev => 
          prev.map(item => 
            item.mal_id === anime.mal_id 
              ? { ...item, isFavorite: false } 
              : item
          )
        );
        throw new Error(result.error || 'Failed to add to favorites');
      }
    } catch (error) {
      console.error('Failed to add favorite:', error);
      setPendingAdds(prev => prev.filter(id => id !== anime.mal_id));
      Alert.alert('Error', 'Failed to add to favorites. Please try again.');
    }
  };

  const renderAnimeItem = ({ item }) => {
    // Check if anime is already in favorites or pending add
    const isFavorite = 
      item.isFavorite || 
      favorites.some(fav => fav.mal_id === item.mal_id) || 
      pendingAdds.includes(item.mal_id);
    
    return (
      <View style={styles.animeCard}>
        <Image 
          source={{ uri: item.images.jpg.image_url || 'https://via.placeholder.com/150' }} 
          style={styles.animeImage}
          resizeMode="cover"
        />
        <View style={styles.animeInfo}>
          <Text style={styles.animeTitle} numberOfLines={2}>{item.title}</Text>
          <Text style={styles.animeDetail}>Rating: {item.score || 'N/A'}</Text>
          <Text style={styles.animeDetail} numberOfLines={1}>Type: {item.type || 'N/A'}</Text>
          <Text style={styles.animeDetail} numberOfLines={1}>Episodes: {item.episodes || 'N/A'}</Text>
          
          <TouchableOpacity 
            style={[styles.favoriteButton, isFavorite && styles.disabledButton]}
            onPress={() => addToFavorites(item)}
            disabled={isFavorite}
          >
            <Ionicons 
              name={isFavorite ? "heart" : "heart-outline"} 
              size={18} 
              color="#fff" 
            />
            <Text style={styles.favoriteButtonText}>
              {isFavorite ? 'Added to Favorites' : 'Add to Favorites'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };
  
  return (
    <View style={styles.container}>
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search for anime..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          onSubmitEditing={searchAnime}
        />
        <TouchableOpacity
          style={styles.searchButton}
          onPress={searchAnime}
        >
          <Ionicons name="search" size={20} color="#fff" />
        </TouchableOpacity>
      </View>
      
      {loading ? (
        <ActivityIndicator size="large" color="#007bff" style={styles.loader} />
      ) : (
        <FlatList
          data={animeResults}
          renderItem={renderAnimeItem}
          keyExtractor={item => item.mal_id.toString()}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <Text style={styles.emptyText}>
              {searchQuery ? 'No results found. Try a different search term.' : 'Loading anime...'}
            </Text>
          }
        />
      )}
    </View>
  );
};

// Styles remain unchanged
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    padding: 10,
  },
  searchContainer: {
    flexDirection: 'row',
    marginBottom: 15,
  },
  searchInput: {
    flex: 1,
    height: 50,
    borderColor: '#ddd',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 15,
    backgroundColor: '#fff',
  },
  searchButton: {
    width: 50,
    height: 50,
    backgroundColor: '#007bff',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    marginLeft: 10,
  },
  loader: {
    marginTop: 50,
  },
  resultsList: {
    paddingBottom: 20,
  },
  animeCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 8,
    marginBottom: 15,
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.5,
  },
  animeImage: {
    width: 100,
    height: 150,
  },
  animeInfo: {
    flex: 1,
    padding: 12,
    justifyContent: 'space-between',
  },
  animeTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  animeDetail: {
    fontSize: 14,
    color: '#555',
    marginBottom: 3,
  },
  favoriteButton: {
    backgroundColor: '#ff6b6b',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
    borderRadius: 5,
    marginTop: 8,
  },
  disabledButton: {
    backgroundColor: '#28a745',
  },
  favoriteButtonText: {
    color: '#fff',
    marginLeft: 5,
    fontWeight: '500',
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 50,
    fontSize: 16,
    color: '#666',
  },
});

export default Home;