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
import { firestoreService } from '../services/firestoreService';

const Matched = ({ navigation }) => {
  const [matchedUsers, setMatchedUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const { currentUser } = useAuth();

  useEffect(() => {
    const loadData = async () => {
      if (currentUser) {
        setLoading(true);
        try {
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