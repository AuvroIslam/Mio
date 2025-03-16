import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { db } from '../config/firebaseConfig';
import { 
  collection, 
  query, 
  where, 
  getDocs
} from 'firebase/firestore';
import { useAuth } from '../config/AuthContext';

const Matched = ({ navigation }) => {
  const [matchedUsers, setMatchedUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [favorites, setFavorites] = useState([]);
  const { currentUser } = useAuth();

  useEffect(() => {
    const loadData = async () => {
      if (currentUser) {
        // Important: we load favorites first, then find matches
        setLoading(true);
        try {
          const favs = await loadFavorites();
          if (favs.length > 0) {
            await findMatchedUsers(favs);
          } else {
            setMatchedUsers([]);
          }
        } catch (error) {
          console.error("Error loading data:", error);
          Alert.alert('Error', 'Failed to load matches');
        } finally {
          setLoading(false);
        }
      }
    };
    
    loadData();
    
    const unsubscribe = navigation.addListener('focus', () => {
      if (currentUser) loadData();
    });
    
    return unsubscribe;
  }, [navigation, currentUser]);

  const loadFavorites = async () => {
    try {
      const favsQuery = query(
        collection(db, "favorites"),
        where("userId", "==", currentUser.uid)
      );
      const favsSnapshot = await getDocs(favsQuery);
      
      // Log the first document to check structure
      
      
      // Access mal_id from animeData field
      const favs = favsSnapshot.docs.map(doc => {
        const data = doc.data();
        return data.animeData ? data.animeData.mal_id : null;
      }).filter(id => id !== null);
      
     
      setFavorites(favs);
      return favs; // Return the favorites array for immediate use
    } catch (error) {
      console.error("Failed to load favorites:", error);
      Alert.alert('Error', 'Failed to load favorites');
      return []; // Return empty array in case of error
    }
  };

  const findMatchedUsers = async (myFavorites) => {
    try {
      // Exit early if user has no favorites
      if (!myFavorites || myFavorites.length === 0) {
        setMatchedUsers([]);
        return;
      }
      
      const usersRef = collection(db, "users");
      const usersSnapshot = await getDocs(usersRef);
      const potentialMatches = [];

      for (const userDoc of usersSnapshot.docs) {
        const userData = userDoc.data();
        
        // Skip if this is the current user or if user data is missing
        if (!userData || userData.uid === currentUser.uid) continue;

        const theirFavsQuery = query(
          collection(db, "favorites"),
          where("userId", "==", userData.uid)
        );
        const theirFavsSnapshot = await getDocs(theirFavsQuery);
        
        // Access mal_id from animeData field
        const theirFavorites = theirFavsSnapshot.docs.map(doc => {
          const data = doc.data();
          return data.animeData ? data.animeData.mal_id : null;
        }).filter(id => id !== null);
        
        // Find common favorites
        const common = myFavorites.filter(id => theirFavorites.includes(id));
        
        console.log(`Common with ${userData.displayName || 'User'}:`, common.length);
        
        // Only include users with 3 or more matches
        if (common.length >= 3) { // Changed from 3 to 1 for testing - change back to 3 for production
          potentialMatches.push({
            userId: userData.uid,
            userName: userData.displayName || 'Anime Fan',
            matches: common.length,
            photoURL: userData.photoURL || null,
            email: userData.email || ''
          });
        }
      }

      // Sort matches by number of common favorites (highest first)
      setMatchedUsers(potentialMatches.sort((a, b) => b.matches - a.matches));
      console.log("Found matches:", potentialMatches.length);
    } catch (error) {
      console.error('Failed to find matches:', error);
      Alert.alert('Error', 'Failed to find matched users');
      setMatchedUsers([]);
    }
  };

  const navigateToUserProfile = (user) => {
    navigation.navigate('UserProfile', { 
      userId: user.userId,
      userName: user.userName,
      matchCount: user.matches
    });
  };

  const renderUserItem = ({ item }) => (
    <TouchableOpacity 
      style={styles.userCard}
      onPress={() => navigateToUserProfile(item)}
    >
      <View style={styles.userImageContainer}>
        {item.photoURL ? (
          <Image source={{ uri: item.photoURL }} style={styles.userImage} />
        ) : (
          <Ionicons name="person-circle" size={60} color="#007bff" />
        )}
      </View>
      <View style={styles.userInfo}>
        <Text style={styles.userName}>{item.userName}</Text>
        <Text style={styles.matchInfo}>
          <Text style={styles.matchCount}>{item.matches}</Text> anime in common
        </Text>
      </View>
      <TouchableOpacity 
        style={styles.viewButton}
        onPress={() => navigateToUserProfile(item)}
      >
        <Text style={styles.viewButtonText}>View Profile</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Fans with Similar Taste</Text>
      <Text style={styles.subtitle}>Connect with fans who like the same anime</Text>
      
      {loading ? (
        <ActivityIndicator size="large" color="#007bff" style={styles.loader} />
      ) : (
        <FlatList
          data={matchedUsers}
          keyExtractor={(item) => item.userId}
          renderItem={renderUserItem}
          contentContainerStyle={styles.usersList}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="people" size={80} color="#ccc" />
              <Text style={styles.emptyText}>
                No matches found yet
              </Text>
              <Text style={styles.emptySubtext}>
                Add at least 3 favorites to find matches
              </Text>
            </View>
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
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 20,
  },
  usersList: {
    paddingBottom: 20,
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 15,
    marginBottom: 15,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.5,
  },
  userImageContainer: {
    marginRight: 15,
  },
  userImage: {
    width: 60,
    height: 60,
    borderRadius: 30,
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  matchInfo: {
    fontSize: 14,
    color: '#666',
  },
  matchCount: {
    fontWeight: 'bold',
    color: '#007bff',
  },
  viewButton: {
    backgroundColor: '#007bff',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 5,
  },
  viewButtonText: {
    color: '#fff',
    fontWeight: '500',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 50,
    padding: 20,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#666',
    marginTop: 15,
    marginBottom: 5,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
  },
  loader: {
    marginTop: 50,
  },
});

export default Matched;