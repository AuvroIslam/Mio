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
import { useDramas } from '../config/DramaContext';
import { useSubscription } from '../config/SubscriptionContext';
import firestoreService from '../services/firestoreService';
import LoadingModal from '../components/LoadingModal';

const Profile = ({ navigation }) => {
  const [loading, setLoading] = useState(true);
  const [userData, setUserData] = useState(null);
  const [activeTab, setActiveTab] = useState('anime'); // 'anime' or 'drama'
  
  const { currentUser, logout } = useAuth();
  const { favorites } = useFavorites();
  const { dramas } = useDramas();
  const { isPremium, upgradeToPremium, getSubscriptionTier, LIMITS } = useSubscription();

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

  const handleUpgradeToPremium = async () => {
    if (isPremium) {
      Alert.alert('Already Premium', 'You are already a premium user!');
      return;
    }
    
    Alert.alert(
      'Upgrade to Premium',
      'Upgrade to premium for unlimited favorites, changes, and matches!',
      [
        {
          text: 'Cancel',
          style: 'cancel'
        },
        {
          text: 'Upgrade Now',
          onPress: async () => {
            const success = await upgradeToPremium();
            if (success) {
              // Refresh user profile after upgrade
              loadUserProfile();
            }
          }
        }
      ]
    );
  };

  const renderAnimeItem = ({ item }) => (
    <TouchableOpacity 
      style={styles.contentCard}
      onPress={() => navigation.navigate('AnimeDetails', { anime: item })}
    >
      <Image 
        source={{ uri: item.images?.jpg?.image_url || 'https://via.placeholder.com/150' }} 
        style={styles.contentImage}
        resizeMode="cover"
      />
      <View style={styles.contentInfo}>
        <Text style={styles.contentTitle} numberOfLines={2}>{item.title}</Text>
        <Text style={styles.contentDetail}>Rating: {item.score || 'N/A'}</Text>
        <Text style={styles.contentDetail} numberOfLines={1}>Type: {item.type || 'N/A'}</Text>
        <Text style={styles.contentDetail} numberOfLines={1}>Episodes: {item.episodes || 'N/A'}</Text>
      </View>
    </TouchableOpacity>
  );

  const renderDramaItem = ({ item }) => (
    <TouchableOpacity 
      style={styles.contentCard}
      onPress={() => navigation.navigate('DramaDetails', { drama: item })}
    >
      <Image 
        source={{ 
          uri: item.poster_path
            ? `https://image.tmdb.org/t/p/w500${item.poster_path}`
            : 'https://via.placeholder.com/150'
        }} 
        style={styles.contentImage}
        resizeMode="cover"
      />
      <View style={styles.contentInfo}>
        <Text style={styles.contentTitle} numberOfLines={2}>{item.name}</Text>
        <Text style={styles.contentDetail}>Rating: {item.vote_average?.toFixed(1) || 'N/A'}</Text>
        <Text style={styles.contentDetail} numberOfLines={1}>
          Origin: {item.origin_country?.join(', ') || 'N/A'}
        </Text>
        <Text style={styles.contentDetail} numberOfLines={1}>
          First aired: {item.first_air_date?.split('-')[0] || 'N/A'}
        </Text>
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

  const renderPremiumStatus = () => {
    const tier = getSubscriptionTier();
    const tierColor = tier === 'PREMIUM' ? '#FFD700' : '#6c757d';
    
    const limits = tier === 'PREMIUM' ? LIMITS.PREMIUM : LIMITS.FREE;
    
    return (
      <View style={styles.premiumStatusContainer}>
        <View style={[styles.tierBadge, tier === 'PREMIUM' ? styles.premiumBadge : styles.freeBadge]}>
          <Ionicons 
            name={tier === 'PREMIUM' ? "star" : "star-outline"} 
            size={24} 
            color={tier === 'PREMIUM' ? "#FFD700" : "#6c757d"} 
          />
          <Text style={[styles.tierText, {color: tierColor}]}>
            {tier === 'PREMIUM' ? 'PREMIUM' : 'FREE'}
          </Text>
        </View>
        
        <View style={styles.limitsContainer}>
          <View style={styles.limitRow}>
            <Ionicons name="heart" size={18} color="#007bff" style={styles.limitIcon} />
            <Text style={styles.limitLabel}>Max Favorites: </Text>
            <Text style={styles.limitValue}>
              {limits.MAX_FAVORITES === Infinity ? 'Unlimited' : limits.MAX_FAVORITES}
            </Text>
          </View>
          
          <View style={styles.limitRow}>
            <Ionicons name="swap-horizontal" size={18} color="#007bff" style={styles.limitIcon} />
            <Text style={styles.limitLabel}>Weekly Changes: </Text>
            <Text style={styles.limitValue}>
              {limits.MAX_CHANGES_PER_WEEK === Infinity ? 'Unlimited' : limits.MAX_CHANGES_PER_WEEK}
            </Text>
          </View>
          
          <View style={styles.limitRow}>
            <Ionicons name="people" size={18} color="#007bff" style={styles.limitIcon} />
            <Text style={styles.limitLabel}>Weekly Matches: </Text>
            <Text style={styles.limitValue}>
              {limits.MAX_MATCHES_PER_WEEK === Infinity ? 'Unlimited' : limits.MAX_MATCHES_PER_WEEK}
            </Text>
          </View>
        </View>
        
        {!isPremium && (
          <TouchableOpacity 
            style={styles.upgradeButton}
            onPress={handleUpgradeToPremium}
          >
            <Ionicons name="star" size={18} color="#fff" />
            <Text style={styles.upgradeButtonText}>Upgrade to Premium</Text>
          </TouchableOpacity>
        )}
      </View>
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
          <Ionicons name="tv" size={20} color="#007bff" style={styles.infoIcon} />
          <Text style={styles.infoLabel}>Anime:</Text>
          <Text style={styles.infoValue}>{favorites.length}</Text>
        </View>

        <View style={styles.infoRow}>
          <Ionicons name="film" size={20} color="#007bff" style={styles.infoIcon} />
          <Text style={styles.infoLabel}>Dramas:</Text>
          <Text style={styles.infoValue}>{dramas.length}</Text>
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
  
  // Tab selector for favorites
  const renderFavoritesTabs = () => (
    <View style={styles.tabContainer}>
      <TouchableOpacity 
        style={[styles.tabButton, activeTab === 'anime' && styles.activeTabButton]}
        onPress={() => setActiveTab('anime')}
      >
        <Ionicons 
          name="tv" 
          size={20} 
          color={activeTab === 'anime' ? '#fff' : '#007bff'} 
        />
        <Text 
          style={[styles.tabText, activeTab === 'anime' && styles.activeTabText]}
        >
          Anime ({favorites.length})
        </Text>
      </TouchableOpacity>
      
      <TouchableOpacity 
        style={[styles.tabButton, activeTab === 'drama' && styles.activeTabButton]}
        onPress={() => setActiveTab('drama')}
      >
        <Ionicons 
          name="film" 
          size={20} 
          color={activeTab === 'drama' ? '#fff' : '#007bff'} 
        />
        <Text 
          style={[styles.tabText, activeTab === 'drama' && styles.activeTabText]}
        >
          Dramas ({dramas.length})
        </Text>
      </TouchableOpacity>
    </View>
  );
  
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
        
        {/* Premium Status Card */}
        <View style={styles.profileCard}>
          <Text style={styles.sectionTitle}>Subscription Status</Text>
          {renderPremiumStatus()}
        </View>
        
        <View style={styles.profileCard}>
          <Text style={styles.sectionTitle}>Profile Information</Text>
          {renderProfileDetails()}
        </View>
        
        <View style={styles.favoritesContainer}>
          <Text style={styles.sectionTitle}>My Favorites</Text>
          {renderFavoritesTabs()}
          
          {activeTab === 'anime' && favorites.length === 0 && (
            <Text style={styles.emptyMessage}>
              No anime favorites yet. Discover anime and add them to your favorites!
            </Text>
          )}
          
          {activeTab === 'drama' && dramas.length === 0 && (
            <Text style={styles.emptyMessage}>
              No drama favorites yet. Discover dramas and add them to your favorites!
            </Text>
          )}
        </View>
      </>
    );
  };

  // Render the profile screen content
  if (loading && !userData) {
    return (
      <LoadingModal
        visible={true}
        message="Loading profile..."
      />
    );
  }

  return (
    <View style={styles.container}>
      {activeTab === 'anime' ? (
        <FlatList
          data={favorites}
          keyExtractor={(item) => item.clientKey || `favorite_${item.mal_id}_${Math.random().toString(36).substring(2,11)}`}
          renderItem={renderAnimeItem}
          ListHeaderComponent={renderHeader}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={null}
        />
      ) : (
        <FlatList
          data={dramas}
          keyExtractor={(item) => item.clientKey || `drama_${item.id}_${Math.random().toString(36).substring(2,11)}`}
          renderItem={renderDramaItem}
          ListHeaderComponent={renderHeader}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={null}
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
  contentCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 8,
    marginBottom: 15,
    overflow: 'hidden',
    elevation: 2,
  },
  contentImage: {
    width: 100,
    height: 150,
  },
  contentInfo: {
    flex: 1,
    padding: 12,
    justifyContent: 'space-between',
  },
  contentTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  contentDetail: {
    fontSize: 14,
    color: '#555',
    marginBottom: 3,
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
    marginTop: 20,
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
  premiumStatusContainer: {
    marginVertical: 10,
  },
  tierBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderWidth: 2,
    borderRadius: 20,
    alignSelf: 'center',
    marginBottom: 15,
    backgroundColor: '#f8f9fa',
  },
  premiumBadge: {
    borderColor: '#FFD700',
    backgroundColor: '#FFF8E1',
  },
  freeBadge: {
    borderColor: '#6c757d',
    backgroundColor: '#f8f9fa',
  },
  tierText: {
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  limitsContainer: {
    marginBottom: 15,
  },
  limitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    backgroundColor: '#f8f9fa',
    padding: 10,
    borderRadius: 8,
  },
  limitIcon: {
    marginRight: 10,
  },
  limitLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#444',
    flex: 1,
  },
  limitValue: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#007bff',
  },
  upgradeButton: {
    backgroundColor: '#007bff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 25,
    alignSelf: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
  },
  upgradeButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
    marginLeft: 8,
  },
  tabContainer: {
    flexDirection: 'row',
    borderRadius: 8,
    marginBottom: 10,
    marginTop: 5,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#007bff',
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    backgroundColor: '#fff',
  },
  activeTabButton: {
    backgroundColor: '#007bff',
  },
  tabText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#007bff',
    marginLeft: 8,
  },
  activeTabText: {
    color: '#fff',
  },
});

export default Profile;