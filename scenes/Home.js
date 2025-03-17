import React, { useState, useEffect } from 'react';
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
import { useFavorites } from '../config/FavoritesContext';

const Home = ({ navigation }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [animeResults, setAnimeResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const { currentUser } = useAuth();
  const { favorites, isInFavorites, addToFavorites, removeFromFavorites } = useFavorites();

  // Load seasonal anime on component mount
  useEffect(() => {
    loadSeasonalAnime();
  }, []);

  // Update anime results with current favorite status when favorites change
  useEffect(() => {
    if (animeResults.length > 0) {
      // Update the isFavorite flag for each anime
      setAnimeResults(prev => 
        prev.map(anime => ({
          ...anime,
          isFavorite: isInFavorites(anime.mal_id)
        }))
      );
    }
  }, [favorites]);

  const loadSeasonalAnime = async () => {
    try {
      setLoading(true);
      setAnimeResults([]);
      
      // Get current season and year
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1; // JavaScript months are 0-indexed
      
      // Determine season based on month
      let season;
      if (month >= 1 && month <= 3) season = 'winter';
      else if (month >= 4 && month <= 6) season = 'spring';
      else if (month >= 7 && month <= 9) season = 'summer';
      else season = 'fall';
      
      // Fetch seasonal anime
      const response = await fetch(`https://api.jikan.moe/v4/seasons/${year}/${season}`);
      const data = await response.json();
      
      if (data.data) {
        // Mark favorites in results for UI indication
        const results = data.data.map(anime => ({
          ...anime,
          isFavorite: isInFavorites(anime.mal_id)
        }));
        
        setAnimeResults(results);
      } else {
        // If API fails, show a message
        setAnimeResults([]);
        Alert.alert('Error', 'Failed to load seasonal anime');
      }
    } catch (error) {
      console.error('Error loading seasonal anime:', error);
      Alert.alert('Error', 'Failed to load seasonal anime. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const searchAnime = async () => {
    if (!searchQuery.trim()) {
      // If search is empty, load seasonal anime
      loadSeasonalAnime();
      return;
    }
    
    try {
      setLoading(true);
      setAnimeResults([]);
      
      const response = await fetch(`https://api.jikan.moe/v4/anime?q=${searchQuery}&limit=20`);
      const data = await response.json();
      
      if (data.data) {
        // Mark favorites in search results for UI consistency
        const results = data.data.map(anime => ({
          ...anime,
          isFavorite: isInFavorites(anime.mal_id)
        }));
        
        setAnimeResults(results);
      }
    } catch (error) {
      console.error('Error searching anime:', error);
      Alert.alert('Search Error', 'Failed to search for anime. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    if (searchQuery.trim()) {
      searchAnime();
    } else {
      loadSeasonalAnime();
    }
  };

  const toggleFavorite = async (anime) => {
    if (!currentUser) {
      Alert.alert('Login Required', 'Please login to add favorites.');
      return;
    }
    
    try {
      const isFavorite = isInFavorites(anime.mal_id);
      
      if (isFavorite) {
        await removeFromFavorites(anime.mal_id);
        Alert.alert('Success', 'Removed from favorites');
      } else {
        await addToFavorites(anime);
        Alert.alert('Success', 'Added to favorites');
      }
      
      // Update UI immediately
      setAnimeResults(prev => 
        prev.map(item => 
          item.mal_id === anime.mal_id 
            ? { ...item, isFavorite: !isFavorite } 
            : item
        )
      );
    } catch (error) {
      console.error('Error toggling favorite:', error);
      Alert.alert('Error', 'Failed to update favorites');
    }
  };

  const renderAnimeItem = ({ item }) => {
    // Check if anime is in favorites using the context
    const isFavorite = item.isFavorite || isInFavorites(item.mal_id);
    
    return (
      <TouchableOpacity 
        style={styles.animeCard}
        onPress={() => navigation.navigate('AnimeDetails', { anime: item })}
      >
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
          
          <View style={styles.actionRow}>
            {isFavorite ? (
              <TouchableOpacity 
                style={[styles.favoriteButton, styles.favoriteButtonActive]}
                onPress={(e) => {
                  e.stopPropagation();
                  toggleFavorite(item);
                }}
              >
                <Ionicons name="heart-dislike" size={16} color="#fff" />
                <Text style={styles.favoriteButtonText}>Remove</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity 
                style={styles.favoriteButton}
                onPress={(e) => {
                  e.stopPropagation();
                  toggleFavorite(item);
                }}
              >
                <Ionicons name="heart" size={16} color="#fff" />
                <Text style={styles.favoriteButtonText}>Add</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="search" size={50} color="#ccc" />
      <Text style={styles.emptyTitle}>No Results Found</Text>
      <Text style={styles.emptyText}>
        Try a different search term or check out the seasonal anime.
      </Text>
      <TouchableOpacity 
        style={styles.reloadButton} 
        onPress={loadSeasonalAnime}
      >
        <Text style={styles.reloadButtonText}>View Seasonal Anime</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search anime..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          onSubmitEditing={handleSearch}
          returnKeyType="search"
        />
        <TouchableOpacity style={styles.searchButton} onPress={handleSearch}>
          <Ionicons name="search" size={24} color="#fff" />
        </TouchableOpacity>
      </View>
      
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007bff" />
          <Text style={styles.loadingText}>
            {searchQuery ? 'Searching...' : 'Loading Seasonal Anime...'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={animeResults}
          keyExtractor={(item) => item.clientKey || `anime_${item.mal_id}_${Math.random().toString(36).substring(2,11)}`}
          renderItem={renderAnimeItem}
          contentContainerStyle={styles.animeList}
          ListEmptyComponent={renderEmptyState}
        />
      )}
    </View>
  );
};

// Styles
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
  favoriteBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#28a745',
    alignSelf: 'flex-start',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
    marginTop: 8,
  },
  favoriteBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
    marginLeft: 4,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 20,
    marginBottom: 10,
  },
  emptyText: {
    textAlign: 'center',
    fontSize: 16,
    color: '#666',
    marginBottom: 20,
  },
  reloadButton: {
    backgroundColor: '#007bff',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  reloadButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 10,
  },
  animeList: {
    paddingBottom: 20,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    marginTop: 8,
  },
  favoriteButton: {
    backgroundColor: '#007bff',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 20,
  },
  favoriteButtonActive: {
    backgroundColor: '#dc3545',
  },
  favoriteButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
    marginLeft: 4,
  },
});

export default Home;