import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  TouchableOpacity,
  Alert,
  ActivityIndicator
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { db } from '../config/firebaseConfig';
import { doc, getDoc } from 'firebase/firestore';
import { useAuth } from '../config/AuthContext';
import { firestoreService } from '../services/firestoreService';

const Profile = ({ navigation }) => {
  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading] = useState(true);
  const { currentUser, logout } = useAuth();

  // Load favorites when screen is focused or current user changes
  useEffect(() => {
    if (currentUser) {
      loadFavorites();
    }
    
    const unsubscribe = navigation.addListener('focus', () => {
      if (currentUser) loadFavorites();
    });
    
    return unsubscribe;
  }, [navigation, currentUser]);

  // Check and run data migration if needed
  useEffect(() => {
    const checkAndRunMigration = async () => {
      if (!currentUser) return;
      
      try {
        const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
        if (!userDoc.exists()) return;
        
        const userData = userDoc.data();
        // Only run migration if the user has old structure
        if (!userData.favorites && userData.favourite_animes) {
          runMigration();
        }
      } catch (error) {
        console.error("Error checking migration status:", error);
      }
    };
    
    checkAndRunMigration();
  }, [currentUser]);

  const loadFavorites = async () => {
    if (!currentUser) {
      setLoading(false);
      return;
    }
    
    try {
      setLoading(true);
      const favorites = await firestoreService.getUserFavorites(currentUser.uid);
      setFavorites(favorites);
    } catch (error) {
      console.error('Failed to load favorites:', error);
      Alert.alert('Error', 'Failed to load favorites');
    } finally {
      setLoading(false);
    }
  };

  const runMigration = async () => {
    if (!currentUser) return;
    
    try {
      setLoading(true);
      Alert.alert('Maintenance', 'Optimizing your data, please wait...');
      
      // Run the migration
      const result = await firestoreService.migrateToNewStructure();
      
      if (result.success) {
        // Force reload favorites
        await loadFavorites();
        console.log('Migration completed successfully');
      } else {
        console.error('Migration failed:', result.error);
      }
    } catch (error) {
      console.error('Migration error:', error);
    } finally {
      setLoading(false);
    }
  };

  const removeFromFavorites = async (anime) => {
    if (!anime?.mal_id) {
      Alert.alert('Error', 'Invalid anime data');
      return;
    }
    
    try {
      // Update UI first for better user experience
      setFavorites(prev => prev.filter(fav => fav.mal_id !== anime.mal_id));
      
      // Then remove from backend
      await firestoreService.removeAnimeFromFavorites(currentUser.uid, anime.mal_id);
      
      // Set navigation parameter to signal Home screen that favorites changed
      // This is the key part to notify Home.js about the change
      navigation.navigate('Home', { favoritesChanged: true });
      
      Alert.alert('Success', `${anime.title} removed from favorites`);
    } catch (error) {
      console.error('Error removing from favorites:', error);
      
      // If there was an error, reload favorites to ensure UI is in sync
      loadFavorites();
      
      Alert.alert('Error', 'Failed to remove from favorites. Please try again.');
    }
  };

  // Update the handleLogout function to not navigate to Login
  const handleLogout = async () => {
    try {
      // Just logout - the AuthContext will handle the navigation
      await logout();
      // No need to navigate manually - App.js will switch to AuthStack
    } catch (error) {
      Alert.alert('Logout Error', error.message);
    }
  };

  const renderFavoriteItem = ({ item }) => (
    <View style={styles.animeCard}>
      <Image 
        source={{ uri: item.images?.jpg?.image_url || 'https://via.placeholder.com/150' }} 
        style={styles.animeImage}
        resizeMode="cover"
      />
      <View style={styles.animeInfo}>
        <Text style={styles.animeTitle} numberOfLines={2}>{item.title}</Text>
        <Text style={styles.animeDetail}>Rating: {item.score || 'N/A'}</Text>
        <Text style={styles.animeDetail} numberOfLines={1}>Type: {item.type || 'N/A'}</Text>
        <Text style={styles.animeDetail} numberOfLines={1}>Episodes: {item.episodes || 'N/A'}</Text>
        
        <TouchableOpacity 
          style={styles.removeButton}
          onPress={() => removeFromFavorites(item)}
        >
          <Ionicons name="trash-outline" size={18} color="#fff" />
          <Text style={styles.removeButtonText}>Remove</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.profileHeader}>
        <View style={styles.profileInfo}>
          <Ionicons name="person-circle" size={80} color="#007bff" />
          <View style={styles.userInfo}>
            <Text style={styles.username}>{currentUser?.displayName || 'User'}</Text>
            <Text style={styles.email}>{currentUser?.email}</Text>
            <Text style={styles.favoriteCount}>
              {favorites.length} {favorites.length === 1 ? 'Favorite' : 'Favorites'}
            </Text>
          </View>
        </View>
        
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={20} color="#fff" />
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionTitle}>My Favorite Anime</Text>
      
      {loading ? (
        <ActivityIndicator size="large" color="#007bff" style={styles.loader} />
      ) : (
        <FlatList
          data={favorites}
          keyExtractor={(item) => item.mal_id.toString()}
          renderItem={renderFavoriteItem}
          contentContainerStyle={styles.favoritesList}
          ListEmptyComponent={
            <Text style={styles.emptyText}>
              You haven't added any favorites yet.
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
    padding: 15,
  },
  profileHeader: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 15,
    marginBottom: 20,
    elevation: 2,
  },
  profileInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  userInfo: {
    marginLeft: 15,
    flex: 1,
  },
  username: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  email: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  favoriteCount: {
    fontSize: 14,
    color: '#666',
    marginTop: 5,
  },
  logoutButton: {
    backgroundColor: '#dc3545',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
    borderRadius: 5,
  },
  logoutText: {
    color: '#fff',
    marginLeft: 5,
    fontWeight: '500',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 15,
  },
  favoritesList: {
    paddingBottom: 20,
  },
  animeCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 8,
    marginBottom: 15,
    overflow: 'hidden',
    elevation: 2,
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
  removeButton: {
    backgroundColor: '#dc3545',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
    borderRadius: 5,
    marginTop: 8,
  },
  removeButtonText: {
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
  loader: {
    marginTop: 50,
  },
});

export default Profile;