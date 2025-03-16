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
import { db } from '../config/firebaseConfig';
import { collection, query, where, getDocs, addDoc, deleteDoc, doc } from 'firebase/firestore';
import { useAuth } from '../config/AuthContext';

const Home = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [animeResults, setAnimeResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [favorites, setFavorites] = useState([]);
  const { currentUser } = useAuth();

  // Load favorites when component mounts or when currentUser changes
  useEffect(() => {
    if (currentUser) {
      loadFavorites();
    }
  }, [currentUser]);

  // Load seasonal anime when searchQuery is empty (default state)
  useEffect(() => {
    if (!searchQuery.trim()) {
      loadSeasonalAnime();
    }
  }, [searchQuery]);

  const loadFavorites = async () => {
    if (!currentUser) return;
    
    try {
      setLoading(true);
      const favoritesRef = collection(db, "favorites");
      const q = query(favoritesRef, where("userId", "==", currentUser.uid));
      const querySnapshot = await getDocs(q);
      
      const userFavorites = [];
      querySnapshot.forEach((doc) => {
        userFavorites.push({
          firebaseId: doc.id,
          ...doc.data().animeData
        });
      });
      
      setFavorites(userFavorites);
    } catch (error) {
      console.error('Failed to load favorites:', error);
      Alert.alert('Error', 'Failed to load favorites');
    } finally {
      setLoading(false);
    }
  };

  // Fetch seasonal anime from the Jikan API
  const loadSeasonalAnime = async () => {
    setLoading(true);
    try {
      const response = await fetch(`https://api.jikan.moe/v4/seasons/now?limit=20`);
      const data = await response.json();
      
      if (data.data) {
        setAnimeResults(data.data);
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
      const response = await fetch(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(searchQuery)}&limit=20`);
      const data = await response.json();
      
      if (data.data) {
        setAnimeResults(data.data);
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

  // Add an anime to favorites in Firestore
  const addToFavorites = async (anime) => {
    if (!currentUser) {
      Alert.alert('Error', 'You must be logged in to add favorites');
      return;
    }
    
    try {
      // Check if anime is already in favorites
      const isAlreadyFavorite = favorites.some(fav => fav.mal_id === anime.mal_id);
      
      if (isAlreadyFavorite) {
        Alert.alert('Already Added', 'This anime is already in your favorites');
        return;
      }
      
      // Add to Firestore
      const docRef = await addDoc(collection(db, "favorites"), {
        userId: currentUser.uid,
        animeData: anime,
        createdAt: new Date()
      });
      
      // Update local state with the new favorite including the Firestore document ID
      setFavorites([...favorites, { ...anime, firebaseId: docRef.id }]);
      
      Alert.alert('Success', `${anime.title} added to favorites!`);
    } catch (error) {
      console.error('Error adding to favorites:', error);
      Alert.alert('Error', 'Failed to add to favorites');
    }
  };
  
  const renderAnimeItem = ({ item }) => (
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
          style={styles.favoriteButton}
          onPress={() => addToFavorites(item)}
        >
          <Ionicons name="heart-outline" size={18} color="#fff" />
          <Text style={styles.favoriteButtonText}>Add to Favorites</Text>
        </TouchableOpacity>
      </View>
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
          returnKeyType="search"
          onSubmitEditing={searchAnime}
        />
        <TouchableOpacity style={styles.searchButton} onPress={searchAnime}>
          <Ionicons name="search" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#007bff" style={styles.loader} />
      ) : (
        <FlatList
          data={animeResults}
          keyExtractor={(item) => item.mal_id.toString()}
          renderItem={renderAnimeItem}
          contentContainerStyle={styles.resultsList}
          ListEmptyComponent={
            <Text style={styles.emptyText}>
              {searchQuery ? 'No results found' : 'No seasonal anime found'}
            </Text>
          }
        />
      )}
    </View>
  );
};

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
