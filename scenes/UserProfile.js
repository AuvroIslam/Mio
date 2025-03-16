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
  ScrollView
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { db } from '../config/firebaseConfig';
import { 
  collection, 
  query, 
  where, 
  getDocs,
  addDoc
} from 'firebase/firestore';
import { useAuth } from '../config/AuthContext';

const UserProfile = ({ route, navigation }) => {
  const { userId, userName, matchCount } = route.params;
  const [userFavorites, setUserFavorites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mutualFavorites, setMutualFavorites] = useState([]);
  const { currentUser } = useAuth();

  useEffect(() => {
    if (userId) {
      loadUserFavorites();
    }
  }, [userId]);

  const loadUserFavorites = async () => {
    try {
      setLoading(true);
      
      // Get user's favorites
      const favoritesRef = collection(db, "favorites");
      const userFavQuery = query(favoritesRef, where("userId", "==", userId));
      const userFavSnapshot = await getDocs(userFavQuery);
      
      const favorites = [];
      userFavSnapshot.forEach((doc) => {
        favorites.push({
          id: doc.id,
          ...doc.data().animeData
        });
      });
      
      setUserFavorites(favorites);
      
      // Get current user's favorites to find mutual ones
      if (currentUser) {
        const myFavoritesRef = collection(db, "favorites");
        const myFavQuery = query(myFavoritesRef, where("userId", "==", currentUser.uid));
        const myFavSnapshot = await getDocs(myFavQuery);
        
        const myFavoritesIds = [];
        myFavSnapshot.forEach((doc) => {
          myFavoritesIds.push(doc.data().animeData.mal_id);
        });
        
        // Find mutual favorites
        const mutual = favorites.filter(fav => myFavoritesIds.includes(fav.mal_id));
        setMutualFavorites(mutual);
      }
      
    } catch (error) {
      console.error('Failed to load user favorites:', error);
      Alert.alert('Error', 'Failed to load user favorites');
    } finally {
      setLoading(false);
    }
  };

  const startChat = async () => {
    try {
      const chatsRef = collection(db, "chats");
      const q = query(
        chatsRef,
        where("participants", "array-contains", currentUser.uid)
      );
      
      const snapshot = await getDocs(q);
      let existingChat = null;
  
      snapshot.forEach(doc => {
        const participants = doc.data().participants;
        if (participants.includes(userId)) {
          existingChat = doc;
        }
      });
  
      if (existingChat) {
        navigation.navigate('Chat', {
          screen: 'ChatRoom',
          params: { chatId: existingChat.id, userName: userName }
        });
      } else {
        const newChatRef = await addDoc(chatsRef, {
          participants: [currentUser.uid, userId],
          createdAt: new Date(),
          lastMessage: "Chat started",
          lastMessageTime: new Date()
        });
    
        navigation.navigate('Chat', {
          screen: 'ChatRoom',
          params: { chatId: newChatRef.id, userName: userName }
        });
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to start chat');
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
        
        {mutualFavorites.some(fav => fav.mal_id === item.mal_id) && (
          <View style={styles.mutualBadge}>
            <Ionicons name="heart" size={12} color="#fff" />
            <Text style={styles.mutualText}>Both Like</Text>
          </View>
        )}
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <ScrollView>
        <View style={styles.profileHeader}>
          <View style={styles.profileInfo}>
            <Ionicons name="person-circle" size={80} color="#007bff" />
            <View style={styles.userInfo}>
              <Text style={styles.username}>{userName}</Text>
              <Text style={styles.matchInfo}>
                <Ionicons name="heart" size={16} color="#ff6b6b" /> 
                <Text style={styles.matchCount}> {matchCount}</Text> anime in common
              </Text>
            </View>
          </View>
          
          <TouchableOpacity 
            style={styles.chatButton} 
            onPress={startChat}
          >
            <Ionicons name="chatbubble-outline" size={20} color="#fff" />
            <Text style={styles.chatButtonText}>Start Chat</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.mutualSection}>
          <Text style={styles.sectionTitle}>Mutual Favorites ({mutualFavorites.length})</Text>
          {mutualFavorites.length > 0 ? (
            <ScrollView horizontal={true} showsHorizontalScrollIndicator={false}>
              {mutualFavorites.map(anime => (
                <View key={anime.mal_id} style={styles.mutualItem}>
                  <Image 
                    source={{ uri: anime.images.jpg.image_url || 'https://via.placeholder.com/150' }} 
                    style={styles.mutualImage}
                    resizeMode="cover"
                  />
                  <Text style={styles.mutualTitle} numberOfLines={1}>{anime.title}</Text>
                </View>
              ))}
            </ScrollView>
          ) : (
            <Text style={styles.noMutualText}>No mutual favorites found</Text>
          )}
        </View>

        <Text style={styles.sectionTitle}>{userName}'s Favorites</Text>
        
        {loading ? (
          <ActivityIndicator size="large" color="#007bff" style={styles.loader} />
        ) : (
          <FlatList
            data={userFavorites}
            keyExtractor={(item) => item.mal_id.toString()}
            renderItem={renderAnimeItem}
            scrollEnabled={false}
            contentContainerStyle={styles.favoritesList}
            ListEmptyComponent={
              <Text style={styles.emptyText}>
                This user hasn't added any favorites yet.
              </Text>
            }
          />
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  profileHeader: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 15,
    margin: 15,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.5,
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
    fontSize: 22,
    fontWeight: 'bold',
  },
  matchInfo: {
    fontSize: 16,
    color: '#666',
    marginTop: 5,
    flexDirection: 'row',
    alignItems: 'center',
  },
  matchCount: {
    fontWeight: 'bold',
    color: '#ff6b6b',
  },
  chatButton: {
    backgroundColor: '#007bff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: 5,
  },
  chatButtonText: {
    color: '#fff',
    marginLeft: 8,
    fontWeight: '500',
    fontSize: 16,
  },
  mutualSection: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 15,
    marginHorizontal: 15,
    marginBottom: 15,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
    marginTop: 5,
    marginHorizontal: 15,
  },
  mutualItem: {
    width: 120,
    marginRight: 15,
  },
  mutualImage: {
    width: 120,
    height: 180,
    borderRadius: 8,
    marginBottom: 5,
  },
  mutualTitle: {
    fontSize: 14,
    textAlign: 'center',
  },
  noMutualText: {
    fontSize: 14,
    color: '#666',
    fontStyle: 'italic',
  },
  favoritesList: {
    paddingHorizontal: 15,
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
  mutualBadge: {
    backgroundColor: '#ff6b6b',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
    alignSelf: 'flex-start',
    marginTop: 5,
  },
  mutualText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '500',
    marginLeft: 4,
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 20,
    fontSize: 16,
    color: '#666',
  },
  loader: {
    marginTop: 20,
  },
});

export default UserProfile;