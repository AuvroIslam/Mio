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
import { useAuth } from '../config/AuthContext';
import { useFavorites } from '../config/FavoritesContext';
import firestoreService from '../services/firestoreService';

const Profile = ({ navigation }) => {
  const [loading, setLoading] = useState(true);
  const [userData, setUserData] = useState(null);
  const { currentUser, logout } = useAuth();
  const { favorites, addToFavorites, removeFromFavorites, isInFavorites } = useFavorites();

  // Load user profile when screen is focused or current user changes
  useEffect(() => {
    if (currentUser) {
      loadUserProfile();
    }
    
    const unsubscribe = navigation.addListener('focus', () => {
      if (currentUser) {
        loadUserProfile();
      }
    });
    
    return unsubscribe;
  }, [navigation, currentUser]);

  const loadUserProfile = async () => {
    if (!currentUser) {
      setLoading(false);
      return;
    }
    
    try {
      setLoading(true);
      const result = await firestoreService.getUserProfile(currentUser.uid);
      
      if (result.success) {
        setUserData(result.data);
      } else {
        console.error('Failed to load user profile:', result.error);
      }
    } catch (error) {
      console.error('Error loading user profile:', error);
      Alert.alert('Error', 'Failed to load user profile');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      // Just logout - the AuthContext will handle the navigation
      await logout();
      // No need to navigate manually - App.js will switch to AuthStack
    } catch (error) {
      Alert.alert('Logout Error', error.message);
    }
  };

  const toggleFavorite = async (anime) => {
    try {
      const isFavorite = isInFavorites(anime.mal_id);
      
      if (isFavorite) {
        await removeFromFavorites(anime.mal_id);
        Alert.alert('Success', 'Removed from favorites');
      } else {
        await addToFavorites(anime);
        Alert.alert('Success', 'Added to favorites');
      }
    } catch (error) {
      console.error('Error toggling favorite:', error);
      Alert.alert('Error', 'Failed to update favorites');
    }
  };

  const renderFavoriteItem = ({ item }) => (
    <TouchableOpacity 
      style={styles.animeCard}
      onPress={() => navigation.navigate('AnimeDetails', { anime: item })}
    >
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
          style={[styles.favoriteButton, styles.favoriteButtonActive]}
          onPress={(e) => {
            e.stopPropagation();
            toggleFavorite(item);
          }}
        >
          <Ionicons name="heart-dislike" size={16} color="#fff" />
          <Text style={styles.favoriteButtonText}>Remove</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );

  const renderPhotoGallery = () => {
    const photos = userData?.photos || [];
    const hasPhotos = photos.length > 0 && photos.some(photo => photo !== null);
    
    if (!hasPhotos) {
      return (
        <View style={styles.photoPlaceholder}>
          <Ionicons name="person-circle" size={80} color="#007bff" />
          <Text style={styles.photoPlaceholderText}>No photos added yet</Text>
        </View>
      );
    }
    
    return (
      <FlatList
        horizontal
        data={photos.filter(photo => photo !== null)}
        keyExtractor={(_, index) => `photo_${index}`}
        showsHorizontalScrollIndicator={false}
        renderItem={({item, index}) => (
          <Image 
            source={{ uri: item.url }} 
            style={[
              styles.galleryPhoto, 
              index === 0 ? styles.profilePhoto : styles.additionalPhoto
            ]}
            resizeMode="cover"
          />
        )}
        style={styles.photoGallery}
      />
    );
  };

  const renderProfileDetails = () => {
    if (!userData) return null;
    
    return (
      <View style={styles.profileDetails}>
        <View style={styles.infoRow}>
          <Ionicons name="person" size={20} color="#007bff" style={styles.infoIcon} />
          <Text style={styles.infoLabel}>Name:</Text>
          <Text style={styles.infoValue}>{currentUser?.displayName || 'User'}</Text>
        </View>
        
        {userData.gender && (
          <View style={styles.infoRow}>
            <Ionicons name="transgender" size={20} color="#007bff" style={styles.infoIcon} />
            <Text style={styles.infoLabel}>Gender:</Text>
            <Text style={styles.infoValue}>{userData.gender}</Text>
          </View>
        )}
        
        {userData.age && (
          <View style={styles.infoRow}>
            <Ionicons name="calendar" size={20} color="#007bff" style={styles.infoIcon} />
            <Text style={styles.infoLabel}>Age:</Text>
            <Text style={styles.infoValue}>{userData.age}</Text>
          </View>
        )}
        
        {userData.education && (
          <View style={styles.infoRow}>
            <Ionicons name="school" size={20} color="#007bff" style={styles.infoIcon} />
            <Text style={styles.infoLabel}>Education:</Text>
            <Text style={styles.infoValue}>{userData.education}</Text>
          </View>
        )}
        
        {userData.location && (
          <View style={styles.infoRow}>
            <Ionicons name="location" size={20} color="#007bff" style={styles.infoIcon} />
            <Text style={styles.infoLabel}>Location:</Text>
            <Text style={styles.infoValue}>{userData.location}</Text>
          </View>
        )}
        
        {userData.bio && (
          <View style={styles.infoRow}>
            <Ionicons name="book" size={20} color="#007bff" style={styles.infoIcon} />
            <Text style={styles.infoLabel}>Bio:</Text>
            <Text style={styles.infoValue}>{userData.bio}</Text>
          </View>
        )}
        
        <View style={styles.infoRow}>
          <Ionicons name="heart" size={20} color="#007bff" style={styles.infoIcon} />
          <Text style={styles.infoLabel}>Favorites:</Text>
          <Text style={styles.infoValue}>{favorites.length}</Text>
        </View>

        <View style={styles.infoRow}>
          <Ionicons name="people" size={20} color="#007bff" style={styles.infoIcon} />
          <Text style={styles.infoLabel}>Match with:</Text>
          <Text style={styles.infoValue}>
            {userData.matchGender === 'male' ? 'Men' : 
             userData.matchGender === 'female' ? 'Women' : 'Everyone'}
          </Text>
        </View>

        <View style={styles.infoRow}>
          <Ionicons name="globe" size={20} color="#007bff" style={styles.infoIcon} />
          <Text style={styles.infoLabel}>Match location:</Text>
          <Text style={styles.infoValue}>
            {userData.matchLocation === 'local' ? 'Local only' : 'Worldwide'}
          </Text>
        </View>

        {userData.animeHotTake && (
          <View style={styles.infoRow}>
            <Text style={styles.questionLabel}>Hot Take:</Text>
            <Text style={styles.infoValue}>{userData.animeHotTake}</Text>
          </View>
        )}

        {userData.underratedAnime && (
          <View style={styles.infoRow}>
            <Text style={styles.questionLabel}>Underrated Anime:</Text>
            <Text style={styles.infoValue}>{userData.underratedAnime}</Text>
          </View>
        )}

        {userData.favoriteBand && (
          <View style={styles.infoRow}>
            <Text style={styles.questionLabel}>Favorite Band:</Text>
            <Text style={styles.infoValue}>{userData.favoriteBand}</Text>
          </View>
        )}
      </View>
    );
  };
  
  const renderHeader = () => {
    return (
      <>
        <View style={styles.profileHeader}>
          {renderPhotoGallery()}
          
          <View style={styles.headerContent}>
            <Text style={styles.username}>{currentUser?.displayName || 'User'}</Text>
            
            <View style={styles.buttonContainer}>
              <TouchableOpacity 
                style={styles.editProfileButton} 
                onPress={() => navigation.navigate('EditProfile')}
              >
                <Ionicons name="create-outline" size={20} color="#fff" />
                <Text style={styles.editProfileText}>Edit Profile</Text>
              </TouchableOpacity>
              
              <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
                <Ionicons name="log-out-outline" size={20} color="#fff" />
                <Text style={styles.logoutText}>Logout</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
        
        <View style={styles.profileCard}>
          <Text style={styles.sectionTitle}>Profile Information</Text>
          {renderProfileDetails()}
        </View>
        
        <View style={styles.favoritesContainer}>
          <Text style={styles.sectionTitle}>Favorite Anime</Text>
          {favorites.length === 0 && (
            <Text style={styles.emptyMessage}>
              No favorites yet. Discover anime and add them to your favorites!
            </Text>
          )}
        </View>
      </>
    );
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#007bff" style={styles.loader} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {favorites.length > 0 ? (
        <FlatList
          data={favorites}
          keyExtractor={(item) => item.clientKey || `favorite_${item.mal_id}_${Math.random().toString(36).substring(2,11)}`}
          renderItem={renderFavoriteItem}
          ListHeaderComponent={renderHeader}
          contentContainerStyle={styles.listContent}
        />
      ) : (
        <FlatList
          data={[]}
          keyExtractor={() => "empty"}
          renderItem={() => null}
          ListHeaderComponent={renderHeader}
          contentContainerStyle={styles.listContent}
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
  listContent: {
    paddingBottom: 20,
  },
  profileHeader: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 15,
    marginBottom: 20,
    elevation: 2,
  },
  photoGallery: {
    marginBottom: 15,
  },
  galleryPhoto: {
    marginRight: 10,
    borderRadius: 10,
  },
  profilePhoto: {
    width: 120,
    height: 120,
    borderRadius: 60,
  },
  additionalPhoto: {
    width: 80,
    height: 80,
    borderRadius: 10,
  },
  photoPlaceholder: {
    alignItems: 'center',
    marginBottom: 15,
  },
  photoPlaceholderText: {
    marginTop: 5,
    color: '#666',
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  username: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
  },
  buttonContainer: {
    flexDirection: 'row',
  },
  editProfileButton: {
    backgroundColor: '#007bff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
    borderRadius: 5,
    marginRight: 10,
  },
  editProfileText: {
    color: '#fff',
    marginLeft: 5,
    fontWeight: '500',
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
  profileCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 15,
    marginBottom: 20,
    elevation: 2,
  },
  profileDetails: {
    marginTop: 10,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  infoIcon: {
    marginRight: 10,
  },
  infoLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#555',
    marginRight: 5,
    width: 80,
  },
  infoValue: {
    fontSize: 16,
    color: '#333',
    flex: 1,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 15,
    color: '#333',
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
  favoriteButton: {
    backgroundColor: '#007bff',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 20,
    marginTop: 8,
    alignSelf: 'flex-start',
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
  favoritesContainer: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 15,
    marginBottom: 20,
    elevation: 2,
  },
  emptyMessage: {
    textAlign: 'center',
    fontSize: 16,
    color: '#666',
  },
  loader: {
    marginTop: 50,
  },
  questionLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#007bff',
    marginRight: 5,
    width: 150,
  },
});

export default Profile;