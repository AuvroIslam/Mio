import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Dimensions,
  ScrollView
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../config/AuthContext';
import firestoreService from '../services/firestoreService';
import { db } from '../config/firebaseConfig';

const UserProfile = ({ route, navigation }) => {
  const { userId } = route.params;
  const [user, setUser] = useState(null);
  const [userFavorites, setUserFavorites] = useState([]);
  const [mutualFavorites, setMutualFavorites] = useState([]);
  const [loading, setLoading] = useState(true);
  const { currentUser } = useAuth();

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        // Fetch viewed user's profile
        const userProfile = await firestoreService.fetchUserProfile(userId);
        if (!userProfile.success) {
          throw new Error(userProfile.error || "Couldn't fetch user profile");
        }
        const userData = userProfile.data;
        setUser(userData);

        // Handle different data structures for favorites
        let favorites = [];
        if (userData.favorites && userData.favoritesData) {
          // New format: use both the favorites array and favoritesData object
          const favoriteIds = userData.favorites || [];
          console.log(`User has ${favoriteIds.length} favorites in IDs array`);
          for (const animeId of favoriteIds) {
            const data = userData.favoritesData[animeId] || {};
            favorites.push({
              mal_id: parseInt(animeId),
              title: data.title || 'Unknown Anime',
              images: { jpg: { image_url: data.image || 'https://via.placeholder.com/150' } },
              score: data.score || 'N/A',
              type: data.type || 'N/A',
              episodes: data.episodes || 'N/A'
            });
          }
          console.log(`Converted ${favorites.length} favorites from new format`);
        } else if (userData.favourite_animes && userData.favourite_animes.length > 0) {
          // Old format: direct array of anime objects
          favorites = userData.favourite_animes;
          console.log(`Using old format: found ${favorites.length} favorites`);
        }

        // Filter valid anime objects
        favorites = favorites.filter(anime =>
          anime && anime.mal_id && typeof anime.mal_id === 'number'
        );
        console.log(`Final filtered favorites count: ${favorites.length}`);
        setUserFavorites(favorites);

        // Get mutual favorites with current user's favorites
        if (currentUser?.uid) {
          const currentUserFavs = await firestoreService.getUserFavorites(currentUser.uid);
          if (currentUserFavs.length > 0) {
            const currentUserFavsMap = new Map();
            currentUserFavs.forEach(fav => {
              if (fav && fav.mal_id) {
                currentUserFavsMap.set(fav.mal_id, true);
              }
            });
            const mutual = favorites.filter(anime =>
              anime && anime.mal_id && currentUserFavsMap.has(anime.mal_id)
            );
            console.log(`Found ${mutual.length} mutual favorites`);
            setMutualFavorites(mutual);
          }
        }
      } catch (error) {
        console.error('Error loading profile:', error);
        Alert.alert('Error', 'Failed to load user profile: ' + error.message);
      } finally {
        setLoading(false);
      }
    };

    if (userId) {
      loadData();
    }
  }, [userId, currentUser]);

  const handleChatPress = async () => {
    try {
      if (!currentUser || !userId) {
        Alert.alert('Error', 'User information is missing');
        return;
      }
      setLoading(true);
      const result = await firestoreService.createChat(currentUser.uid, userId);
      if (result.success) {
        navigation.navigate('Chat', {
          screen: 'ChatRoom',
          params: {
            chatId: result.chatId,
            userName: user?.userName || 'User',
            otherUserId: userId
          }
        });
      } else {
        throw new Error(result.error || 'Failed to create chat');
      }
    } catch (error) {
      console.error('Chat error:', error);
      Alert.alert('Error', 'Failed to start chat: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const renderAnimeItem = ({ item }) => {
    if (!item) return null;
    // Check if the anime is a mutual favorite
    const isMutual = mutualFavorites.some(fav => fav.mal_id === item.mal_id);
    return (
      <TouchableOpacity 
        style={styles.animeCard}
        onPress={() => navigation.navigate('AnimeDetails', { anime: item })}
      >
        <Image
          source={{
            uri: item.images?.jpg?.image_url || item.image || 'https://via.placeholder.com/150'
          }}
          style={styles.animeImage}
          resizeMode="cover"
        />
        <View style={styles.animeInfo}>
          <Text style={styles.animeTitle} numberOfLines={2}>
            {item.title || "Unknown Anime"}
          </Text>
          <Text style={styles.animeDetail}>Rating: {item.score || 'N/A'}</Text>
          <Text style={styles.animeDetail}>Type: {item.type || 'N/A'}</Text>
          <Text style={styles.animeDetail}>Episodes: {item.episodes || 'N/A'}</Text>
          {isMutual && (
            <View style={styles.mutualBadge}>
              <Ionicons name="heart" size={12} color="#fff" />
              <Text style={styles.mutualText}>Mutual Favorite</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const renderMutualItem = ({ item }) => {
    if (!item) return null;
    return (
      <View style={styles.mutualItem}>
        <Image
          source={{
            uri: item.images?.jpg?.image_url || item.image || 'https://via.placeholder.com/150'
          }}
          style={styles.mutualImage}
          resizeMode="cover"
        />
        <Text style={styles.mutualTitle} numberOfLines={2}>
          {item.title || "Unknown Anime"}
        </Text>
      </View>
    );
  };

  const renderProfileDetails = () => {
    if (!user) return null;
    return (
      <View style={styles.profileDetails}>
        <View style={styles.infoRow}>
          <Ionicons name="person" size={20} color="#007bff" style={styles.infoIcon} />
          <Text style={styles.infoLabel}>Name:</Text>
          <Text style={styles.infoValue}>{user.userName || 'User'}</Text>
        </View>

        {user.gender && (
          <View style={styles.infoRow}>
            <Ionicons name="transgender" size={20} color="#007bff" style={styles.infoIcon} />
            <Text style={styles.infoLabel}>Gender:</Text>
            <Text style={styles.infoValue}>{user.gender}</Text>
          </View>
        )}

        {user.age && (
          <View style={styles.infoRow}>
            <Ionicons name="calendar" size={20} color="#007bff" style={styles.infoIcon} />
            <Text style={styles.infoLabel}>Age:</Text>
            <Text style={styles.infoValue}>{user.age}</Text>
          </View>
        )}

        {user.education && (
          <View style={styles.infoRow}>
            <Ionicons name="school" size={20} color="#007bff" style={styles.infoIcon} />
            <Text style={styles.infoLabel}>Education:</Text>
            <Text style={styles.infoValue}>{user.education}</Text>
          </View>
        )}

        {user.location && (
          <View style={styles.infoRow}>
            <Ionicons name="location" size={20} color="#007bff" style={styles.infoIcon} />
            <Text style={styles.infoLabel}>Location:</Text>
            <Text style={styles.infoValue}>{user.location}</Text>
          </View>
        )}

        {user.animeHotTake && (
          <View style={styles.infoRow}>
            <Text style={styles.questionLabel}>Hot Take:</Text>
            <Text style={styles.infoValue}>{user.animeHotTake}</Text>
          </View>
        )}

        {user.underratedAnime && (
          <View style={styles.infoRow}>
            <Text style={styles.questionLabel}>Underrated Anime:</Text>
            <Text style={styles.infoValue}>{user.underratedAnime}</Text>
          </View>
        )}

        {user.favoriteBand && (
          <View style={styles.infoRow}>
            <Text style={styles.questionLabel}>Favorite Band:</Text>
            <Text style={styles.infoValue}>{user.favoriteBand}</Text>
          </View>
        )}

        {user.bio && (
          <View style={styles.infoRow}>
            <Ionicons name="book" size={20} color="#007bff" style={styles.infoIcon} />
            <Text style={styles.infoLabel}>Bio:</Text>
            <Text style={styles.infoValue}>{user.bio}</Text>
          </View>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007bff" />
      </View>
    );
  }

  return (
    <FlatList
      data={userFavorites}
      keyExtractor={(item, index) => `user_favorite_${item?.mal_id || index}_${Math.random().toString(36).substring(2,11)}`}
      renderItem={renderAnimeItem}
      contentContainerStyle={styles.flatListContent}
      ListHeaderComponent={
        <>
          <View style={styles.profileHeader}>
            <View style={styles.userInfo}>
              <Ionicons name="person-circle" size={80} color="#007bff" />
              <Text style={styles.username}>{user?.userName || 'User'}</Text>
              <Text style={styles.favoriteCount}>
                {userFavorites.length} Favorite{userFavorites.length !== 1 && 's'}
              </Text>
            </View>
            {currentUser?.uid !== userId && (
              <TouchableOpacity style={styles.chatButton} onPress={handleChatPress}>
                <Ionicons name="chatbubble-outline" size={20} color="#fff" />
                <Text style={styles.chatButtonText}>Message</Text>
              </TouchableOpacity>
            )}
            {mutualFavorites.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>
                  Mutual Favorites ({mutualFavorites.length})
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.mutualList}
                >
                  {mutualFavorites.map((item, index) => (
                    <View key={`mutual_${item?.mal_id || index}_${Math.random().toString(36).substring(2,7)}`} style={styles.mutualItem}>
                      <Image
                        source={{
                          uri: item.images?.jpg?.image_url || item.image || 'https://via.placeholder.com/150'
                        }}
                        style={styles.mutualImage}
                        resizeMode="cover"
                      />
                      <Text style={styles.mutualTitle} numberOfLines={2}>
                        {item.title || "Unknown Anime"}
                      </Text>
                    </View>
                  ))}
                </ScrollView>
              </View>
            )}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Favorites</Text>
            </View>
          </View>
          <View style={styles.profileCard}>
            <Text style={styles.sectionTitle}>Profile Information</Text>
            {renderProfileDetails()}
          </View>
        </>
      }
      ListFooterComponent={<View style={styles.listFooter} />}
      ListEmptyComponent={<Text style={styles.emptyText}>No favorites added</Text>}
    />
  );
};

const { width } = Dimensions.get('window');

const styles = StyleSheet.create({
  flatListContent: {
    padding: 15,
    backgroundColor: '#f5f5f5',
  },
  listFooter: {
    height: 100,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileHeader: {
    alignItems: 'center',
    marginBottom: 20,
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 15,
    elevation: 2,
  },
  userInfo: {
    alignItems: 'center',
    marginBottom: 15,
  },
  username: {
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 10,
  },
  favoriteCount: {
    color: '#666',
  },
  chatButton: {
    backgroundColor: '#007bff',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 5,
    flexDirection: 'row',
    alignItems: 'center',
  },
  chatButtonText: {
    color: '#fff',
    marginLeft: 5,
    fontWeight: '500',
  },
  section: {
    marginBottom: 20,
    width: '100%',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
    alignSelf: 'flex-start',
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
    backgroundColor: '#f0f0f0',
  },
  animeInfo: {
    flex: 1,
    padding: 15,
  },
  animeTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 6,
  },
  animeDetail: {
    color: '#666',
    marginTop: 3,
  },
  mutualBadge: {
    backgroundColor: '#ff6b6b',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
    marginTop: 10,
    alignSelf: 'flex-start',
  },
  mutualText: {
    color: '#fff',
    marginLeft: 5,
    fontSize: 12,
  },
  mutualList: {
    paddingHorizontal: 5,
    paddingBottom: 10,
  },
  mutualItem: {
    marginHorizontal: 8,
    width: 120,
  },
  mutualImage: {
    width: 120,
    height: 180,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
  },
  mutualTitle: {
    textAlign: 'center',
    marginTop: 5,
    fontSize: 14,
    fontWeight: '500',
    width: 120,
  },
  emptyText: {
    textAlign: 'center',
    color: '#999',
    marginTop: 20,
    marginBottom: 20,
  },
  profileDetails: {
    padding: 15,
    backgroundColor: '#fff',
    borderRadius: 8,
    elevation: 2,
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
    color: '#007bff',
    width: 150,
  },
  infoValue: {
    color: '#666',
  },
  questionLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#007bff',
    marginRight: 5,
    width: 150,
  },
  profileCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 15,
    elevation: 2,
    marginBottom: 20,
  },
});

export default UserProfile;
