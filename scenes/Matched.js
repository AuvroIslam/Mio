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
import { useAuth } from '../config/AuthContext';
import firestoreService from '../services/firestoreService';

const Matched = ({ navigation }) => {
  const [matchedUsers, setMatchedUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [userData, setUserData] = useState(null);
  const { currentUser } = useAuth();

  useEffect(() => {
    const loadData = async () => {
      if (currentUser) {
        setLoading(true);
        try {
          // Get user profile data
          const userProfile = await firestoreService.getUserProfile(currentUser.uid);
          if (userProfile.success) {
            setUserData(userProfile.data);
          }
          
          // Get matches from Firestore
          const matches = await firestoreService.getMatches(currentUser.uid);
          console.log("Fetched matches:", matches);
          setMatchedUsers(matches);
        } catch (error) {
          console.error("Error loading matches:", error);
          Alert.alert('Error', 'Failed to load matches');
        } finally {
          setLoading(false);
        }
      }
    };
    
    loadData();
    
    // Refresh data when the screen comes into focus
    const unsubscribe = navigation.addListener('focus', () => {
      if (currentUser) loadData();
    });
    
    return unsubscribe;
  }, [navigation, currentUser]);

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
        {item.gender && (
          <View style={styles.matchBadge}>
            <Ionicons name="person" size={12} color="#fff" />
            <Text style={styles.matchBadgeText}>{item.gender}</Text>
          </View>
        )}
        {item.location && userData && userData.matchLocation === 'local' && (
          <View style={styles.matchBadge}>
            <Ionicons name="location" size={12} color="#fff" />
            <Text style={styles.matchBadgeText}>{item.location}</Text>
          </View>
        )}
      </View>
      <TouchableOpacity 
        style={styles.viewButton}
        onPress={() => navigateToUserProfile(item)}
      >
        <Text style={styles.viewButtonText}>View Profile</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );

  // Helper function to generate matching preferences text
  const getMatchingPrefsText = () => {
    if (!userData) return '';
    
    let genderText = '';
    if (userData.matchGender === 'male') {
      genderText = 'men';
    } else if (userData.matchGender === 'female') {
      genderText = 'women';
    } else {
      genderText = 'all genders';
    }
    
    let locationText = userData.matchLocation === 'local' ? 'in your location' : 'worldwide';
    
    return `Showing matches with ${genderText} ${locationText}`;
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Fans with Similar Taste</Text>
      <Text style={styles.subtitle}>Connect with fans who like the same anime</Text>
      
      {userData && (
        <View style={styles.preferencesContainer}>
          <Text style={styles.preferencesText}>{getMatchingPrefsText()}</Text>
        </View>
      )}
      
      {loading ? (
        <ActivityIndicator size="large" color="#007bff" style={styles.loader} />
      ) : (
        <FlatList
          data={matchedUsers}
          keyExtractor={(item) => `matched_user_${item.userId}_${Math.random().toString(36).substring(2,11)}`}
          renderItem={renderUserItem}
          contentContainerStyle={styles.usersList}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="people" size={80} color="#ccc" />
              <Text style={styles.emptyText}>
                No matches found yet
              </Text>
              <Text style={styles.emptySubtext}>
                {userData && userData.favorites && userData.favorites.length < 3 ? 
                  'Add at least 3 favorites to find matches' :
                  'Try adjusting your match preferences in your profile'}
              </Text>
            </View>
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
    marginBottom: 10,
  },
  preferencesContainer: {
    backgroundColor: '#e3f2fd',
    padding: 10,
    borderRadius: 5,
    marginBottom: 15,
  },
  preferencesText: {
    fontSize: 14,
    color: '#0d47a1',
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
    marginBottom: 8,
  },
  matchCount: {
    fontWeight: 'bold',
    color: '#007bff',
  },
  matchBadge: {
    backgroundColor: '#007bff',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 12,
    marginRight: 5,
    marginBottom: 5,
    alignSelf: 'flex-start',
  },
  matchBadgeText: {
    color: '#fff',
    fontSize: 12,
    marginLeft: 4,
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