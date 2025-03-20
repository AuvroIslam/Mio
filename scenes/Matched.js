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
  const [matchStats, setMatchStats] = useState({
    matchCount: 0,
    matchThreshold: 2,
    matchCooldownStartedAt: null,
    availableForMatching: true
  });
  const [matchCooldownActive, setMatchCooldownActive] = useState(false);
  const [matchCooldownTime, setMatchCooldownTime] = useState('00:00');
  const [searchingMatch, setSearchingMatch] = useState(false);

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
          
          // Fetch match stats
          await fetchMatchStats();
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

  // Format match cooldown time remaining
  const formatMatchCooldownTime = (cooldownStartTime) => {
    if (!cooldownStartTime) return '00:00';
    
    const startTime = new Date(cooldownStartTime.seconds * 1000);
    const now = new Date();
    const threeMinutesMs = 3 * 60 * 1000; // 3 minutes in milliseconds
    const elapsedMs = now.getTime() - startTime.getTime();
    
    if (elapsedMs >= threeMinutesMs) {
      console.log('✅ Match cooldown has expired');
      return 'Ready!';
    }
    
    const remainingMs = threeMinutesMs - elapsedMs;
    const remainingMinutes = Math.floor(remainingMs / 60000);
    const remainingSeconds = Math.floor((remainingMs % 60000) / 1000);
    
    const formattedTime = `${remainingMinutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    console.log(`⏳ Match cooldown remaining: ${formattedTime}`);
    return formattedTime;
  };
  
  // Update cooldown status and start timer if needed
  const updateCooldownStatus = (cooldownStartedAt) => {
    if (!cooldownStartedAt) {
      setMatchCooldownActive(false);
      setMatchCooldownTime('00:00');
      return;
    }
    
    setMatchCooldownActive(true);
    setMatchCooldownTime(formatMatchCooldownTime(cooldownStartedAt));
    
    // Set up a timer to update the cooldown time
    const timerId = setInterval(() => {
      const timeRemaining = formatMatchCooldownTime(cooldownStartedAt);
      setMatchCooldownTime(timeRemaining);
      
      // If cooldown ended, reset and refresh
      if (timeRemaining === 'Ready!') {
        clearInterval(timerId);
        checkAndResetCooldown();
      }
    }, 1000);
    
    // Clear timer on cleanup
    return () => clearInterval(timerId);
  };
  
  // Check and reset cooldown if expired
  const checkAndResetCooldown = async () => {
    try {
      const resetResult = await firestoreService.checkAndResetCooldown(currentUser.uid);
      if (resetResult.cooldownEnded) {
        console.log('✅ Cooldown ended, updating UI with new match count: 0');
        
        // Update local state immediately for UI
        setMatchStats(prevStats => ({
          ...prevStats,
          matchCount: 0,
          matchCooldownStartedAt: null,
          availableForMatching: true
        }));
        
        setMatchCooldownActive(false);
        setMatchCooldownTime('00:00');
        
        // Then refresh the data from Firestore
        await fetchMatchStats();
      }
    } catch (error) {
      console.error('❌ Error resetting cooldown:', error);
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

  // Render match status component
  const renderMatchStatus = () => (
    <View style={styles.matchStatsContainer}>
      <View style={styles.matchIndicator}>
        <Text style={styles.sectionTitle}>Match Statistics</Text>
        
        <View style={styles.matchStatRow}>
          <Ionicons name="people" size={20} color="#0056b3" style={styles.matchIcon} />
          <Text style={styles.matchStatText}>
            Weekly Matches: {matchStats.matchCount}/{matchStats.matchThreshold}
          </Text>
        </View>
        
        {/* Match cooldown status */}
        {matchCooldownActive ? (
          <View style={styles.matchCooldownContainer}>
            <Ionicons name="time" size={18} color="#dc3545" style={styles.matchIcon} />
            <Text style={[styles.matchStatText, styles.lockedText]}>
              Cooldown: {matchCooldownTime}
            </Text>
          </View>
        ) : (
          <View style={styles.matchReadyContainer}>
            <Ionicons name="checkmark-circle" size={18} color="#28a745" style={styles.matchIcon} />
            <Text style={[styles.matchStatText, styles.readyText]}>Ready to match!</Text>
          </View>
        )}
      </View>
      
      {/* Search match button */}
      <TouchableOpacity 
        style={[
          styles.searchMatchButton, 
          (matchStats.matchCount >= matchStats.matchThreshold || matchCooldownActive) && styles.disabledButton
        ]}
        disabled={matchStats.matchCount >= matchStats.matchThreshold || matchCooldownActive || searchingMatch}
        onPress={handleMatchSearch}
      >
        {searchingMatch ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <>
            <Ionicons name="search" size={18} color="#fff" style={styles.buttonIcon} />
            <Text style={styles.searchMatchButtonText}>Search New Matches</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
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

  // Handle match search button click
  const handleMatchSearch = async () => {
    if (!currentUser) {
      Alert.alert('Login Required', 'Please login to search for matches.');
      return;
    }
    
    // Check if user has reached match limit
    if (matchStats.matchCount >= matchStats.matchThreshold || matchCooldownActive) {
      Alert.alert('Weekly Limit Reached', 
        'You\'ve used all your weekly matches. Please wait for the cooldown to end.');
      return;
    }
    
    setSearchingMatch(true);
    
    try {
      // Trigger bidirectional match update and pass true to process matches
      const result = await firestoreService.updateBidirectionalMatches(currentUser.uid, true);
      
      if (result.success) {
        // No need to process each match individually as it's now handled in updateBidirectionalMatches
        
        // Refresh matches and match stats
        const matches = await firestoreService.getMatches(currentUser.uid);
        setMatchedUsers(matches);
        await fetchMatchStats();
        
        Alert.alert('Success', `Found ${result.newMatches?.length || 0} potential matches!`);
      } else {
        Alert.alert('Error', result.error || 'Failed to search for matches.');
      }
    } catch (error) {
      console.error('Error searching for matches:', error);
      Alert.alert('Error', 'Failed to search for matches.');
    } finally {
      setSearchingMatch(false);
    }
  };

  const fetchMatchStats = async () => {
    if (!currentUser) return;
    
    try {
      const matchResponse = await firestoreService.getUserSubscription(currentUser.uid);
      if (matchResponse.success && matchResponse.data) {
        console.log('⚡ Match stats fetched:', {
          matchCount: matchResponse.data.matchCount || 0,
          threshold: matchResponse.data.matchThreshold || 2,
          cooldown: matchResponse.data.matchCooldownStartedAt ? 'Active' : 'Inactive',
          available: matchResponse.data.availableForMatching !== false
        });
        
        setMatchStats({
          matchCount: matchResponse.data.matchCount || 0,
          matchThreshold: matchResponse.data.matchThreshold || 2,
          matchCooldownStartedAt: matchResponse.data.matchCooldownStartedAt,
          availableForMatching: matchResponse.data.availableForMatching !== false
        });
        
        // Update cooldown status
        updateCooldownStatus(matchResponse.data.matchCooldownStartedAt);
      }
    } catch (error) {
      console.error('❌ Error fetching match stats:', error);
    }
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
      
      {/* Match status and search button */}
      {renderMatchStatus()}
      
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
  // Styles for match status component
  matchStatsContainer: {
    backgroundColor: '#f8f9fa',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#dee2e6',
    padding: 15,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  matchIndicator: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 15,
    width: '100%',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#0056b3',
    textAlign: 'center',
  },
  matchStatRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 8,
    width: '100%',
  },
  matchIcon: {
    marginRight: 8,
  },
  matchStatText: {
    fontSize: 14,
    color: '#0056b3',
    fontWeight: '500',
  },
  matchCooldownContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#f8d7da',
    borderWidth: 1,
    borderColor: '#f5c6cb',
    marginTop: 4,
    width: '80%',
  },
  matchReadyContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#d4edda',
    borderWidth: 1,
    borderColor: '#c3e6cb',
    marginTop: 4,
    width: '80%',
  },
  readyText: {
    color: '#28a745',
    fontWeight: 'bold',
  },
  lockedText: {
    color: '#dc3545',
    fontWeight: 'bold',
  },
  searchMatchButton: {
    backgroundColor: '#007bff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 25,
    marginTop: 10,
    width: '100%',
  },
  buttonIcon: {
    marginRight: 8,
  },
  searchMatchButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  disabledButton: {
    backgroundColor: '#6c757d',
    opacity: 0.7,
  },
});

export default Matched;