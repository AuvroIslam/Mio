import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  ActivityIndicator,
  Alert,
  Modal
} from 'react-native';
import { useAuth } from '../config/AuthContext';
import { useDramas } from '../config/DramaContext';
import { useSubscription } from '../config/SubscriptionContext';
import LoadingModal from '../components/LoadingModal';
import Icon from '../components/Icon';
import useTimer from '../hooks/useTimer';

const { width } = Dimensions.get('window');
const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/';
const TMDB_API_KEY = 'b2b68cd65cf02c8da091b2857084bd4d';

const DramaDetails = ({ route, navigation }) => {
  const { drama } = route.params;
  const [loading, setLoading] = useState(false);
  const [dramaDetails, setDramaDetails] = useState(null);
  const [countdown, setCountdown] = useState('');
  const [countdownInitialized, setCountdownInitialized] = useState(false);
  const { currentUser } = useAuth();
  const { isInDramas, addToDramas, removeFromDramas, processingDrama, dramas } = useDramas();
  const { canMakeChange, getFormattedTimeRemaining, isInCooldown, usageStats, canAddDrama, canRemoveFavorite, loading: subscriptionLoading } = useSubscription();
  
  // Determine if drama is in favorites
  const isFavorite = isInDramas(drama.id);
  
  // Use our custom timer hook
  const timer = useTimer();
  
  // Countdown timer effect
  useEffect(() => {
    let timerKey;
    
    if (subscriptionLoading) {
      // Don't initialize the countdown yet if subscription is still loading
      return;
    }
    
    if (usageStats.counterStartedAt) {
      // Mark as initialized first to prevent flicker
      setCountdownInitialized(true);
      
      // Initialize countdown immediately 
      setCountdown(getFormattedTimeRemaining());
      
      // Start the countdown timer to update every second
      timerKey = timer.setInterval(() => {
        setCountdown(getFormattedTimeRemaining());
      }, 1000, 'drama_countdown');
    } else {
      // No countdown needed, but we're still initialized
      setCountdown('');
      setCountdownInitialized(true);
    }
    
    return () => {
      if (timerKey) timer.clearTimer(timerKey);
    };
  }, [usageStats.counterStartedAt, getFormattedTimeRemaining, subscriptionLoading, timer]);

  // Fetch additional drama details if needed
  useEffect(() => {
    // Don't fetch until countdown is initialized
    if (!countdownInitialized) {
      return;
    }
    
    // If drama data is complete, use it directly
    if (drama.overview && drama.genres) {
      setDramaDetails(drama);
      return;
    }
    
    // Otherwise fetch more details from TMDb API
    const fetchDramaDetails = async () => {
      try {
        setLoading(true);
        const response = await fetch(`https://api.themoviedb.org/3/tv/${drama.id}?api_key=${TMDB_API_KEY}&language=en-US`);
        const data = await response.json();
        
        if (data) {
          setDramaDetails(data);
        } else {
          // If API failed, use existing data
          setDramaDetails(drama);
        }
      } catch (error) {
        console.error('Error fetching drama details:', error);
        // Fallback to existing data
        setDramaDetails(drama);
      } finally {
        setLoading(false);
      }
    };
    
    fetchDramaDetails();
  }, [drama, countdownInitialized]);

  // Main render function - show loading screen until initialized
  if (subscriptionLoading || !countdownInitialized) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007bff" />
        <Text style={styles.loadingText}>
          Loading...
        </Text>
      </View>
    );
  }

  const toggleFavorite = async () => {
    try {
      if (isInDramas(drama.id)) {
        // Check if we can remove using the helper function
        const canRemove = canRemoveFavorite();
        if (!canRemove.allowed) {
          // Don't show error here - it's already handled by the context
          Alert.alert(
            canRemove.reason === 'COOLDOWN' ? 'Cooldown Active' : 'Weekly Limit Reached',
            canRemove.message + ' Upgrade to premium for unlimited changes.',
            [
              {
                text: 'OK',
                style: 'cancel'
              },
              {
                text: 'Upgrade to Premium',
                onPress: () => navigation.navigate('Subscription')
              }
            ]
          );
          return;
        }
        
        console.log(`Attempting to remove drama ${drama.id} from favorites`);
        const result = await removeFromDramas(drama.id);
        console.log('Remove drama result:', result);
        
        if (result.success === true) {
          console.log(`Successfully removed drama ${drama.id}`);
          // Show success toast or message if desired
        }
        // Don't show error alert - already handled by the context
      } else {
        // Check if we can add more dramas using the helper function 
        const canAdd = canAddDrama();
        if (!canAdd.allowed) {
          console.log(`Cannot add drama: ${canAdd.reason}, ${canAdd.message}`);
          const MAX_FREE_DRAMAS = 5;
          console.log(`Drama count check: dramas.length=${dramas.length}, usageStats.dramasCount=${usageStats.dramasCount}, max=${MAX_FREE_DRAMAS}`);
          Alert.alert(
            'Drama Favorites Limit Reached',
            canAdd.message + ' Please remove some or upgrade to premium for unlimited favorites.',
            [
              { text: 'OK' },
              { 
                text: 'Upgrade to Premium', 
                onPress: () => navigation.navigate('Subscription') 
              }
            ]
          );
          return;
        }
        
        // Add drama to favorites
        console.log(`Attempting to add drama ${drama.id} to favorites`);
        const result = await addToDramas(drama);
        console.log('Add drama result:', result);
        
        if (result.success === true) {
          console.log(`Successfully added drama ${drama.id}`);
          // Show success toast or message if desired
        }
        // Don't show error alert - already handled by the context
      }
    } catch (error) {
      console.error('Error toggling drama favorite:', error);
      Alert.alert('Error', 'An unexpected error occurred. Please try again.');
    }
  };

  const renderGenres = () => {
    const genres = dramaDetails?.genres || [];
    if (genres.length === 0) return null;
    
    return (
      <View style={styles.genreContainer}>
        {genres.map((genre) => (
          <View key={genre.id} style={styles.genreTag}>
            <Text style={styles.genreText}>{genre.name}</Text>
          </View>
        ))}
      </View>
    );
  };

  if (!dramaDetails) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007bff" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <LoadingModal 
        visible={processingDrama}
        message={isInDramas(drama?.id) ? 'Removing from favorites...' : 'Adding to favorites...'}
      />
      <View style={styles.header}>
        <Image 
          source={{ 
            uri: dramaDetails.backdrop_path 
              ? `${TMDB_IMAGE_BASE_URL}w780${dramaDetails.backdrop_path}` 
              : `${TMDB_IMAGE_BASE_URL}w500${dramaDetails.poster_path}` || 'https://via.placeholder.com/780x440'
          }} 
          style={styles.coverImage}
          resizeMode="cover"
        />
        <View style={styles.headerOverlay}>
          <TouchableOpacity 
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Icon type="ionicons" name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[
              styles.favoriteButton,
              processingDrama && styles.disabledButton
            ]}
            onPress={toggleFavorite}
            disabled={processingDrama}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Icon 
                type="ionicons"
                name={isFavorite ? "heart" : "heart-outline"} 
                size={24} 
                color={isFavorite ? "#ff375f" : "#fff"} 
              />
            )}
          </TouchableOpacity>
        </View>
      </View>
      
      <View style={styles.detailsContainer}>
        <Text style={styles.title}>{dramaDetails.name}</Text>
        {dramaDetails.original_name && dramaDetails.original_name !== dramaDetails.name && (
          <Text style={styles.originalTitle}>{dramaDetails.original_name}</Text>
        )}
        
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Icon type="ionicons" name="star" size={16} color="#FFD700" />
            <Text style={styles.statText}>{dramaDetails.vote_average.toFixed(1) || 'N/A'}</Text>
          </View>
          
          <View style={styles.statItem}>
            <Icon type="ionicons" name="tv-outline" size={16} color="#666" />
            <Text style={styles.statText}>
              {dramaDetails.number_of_seasons || '?'} Seasons, {dramaDetails.number_of_episodes || '?'} Episodes
            </Text>
          </View>
          
          <View style={styles.statItem}>
            <Icon type="ionicons" name="calendar-outline" size={16} color="#666" />
            <Text style={styles.statText}>{dramaDetails.first_air_date?.substring(0, 4) || 'N/A'}</Text>
          </View>
          
          <View style={styles.statItem}>
            <Icon type="ionicons" name="globe-outline" size={16} color="#666" />
            <Text style={styles.statText}>{dramaDetails.origin_country?.join(', ') || 'N/A'}</Text>
          </View>
        </View>
        
        {renderGenres()}
        
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Overview</Text>
          <Text style={styles.synopsis}>{dramaDetails.overview || 'No overview available.'}</Text>
        </View>
        
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Information</Text>
          
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Status:</Text>
            <Text style={styles.infoValue}>{dramaDetails.status || 'Unknown'}</Text>
          </View>
          
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>First Aired:</Text>
            <Text style={styles.infoValue}>{dramaDetails.first_air_date || 'Unknown'}</Text>
          </View>
          
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Last Aired:</Text>
            <Text style={styles.infoValue}>{dramaDetails.last_air_date || 'Unknown'}</Text>
          </View>
          
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Networks:</Text>
            <Text style={styles.infoValue}>
              {dramaDetails.networks && dramaDetails.networks.length > 0 
                ? dramaDetails.networks.map(n => n.name).join(', ') 
                : 'Unknown'}
            </Text>
          </View>
          
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Language:</Text>
            <Text style={styles.infoValue}>{dramaDetails.original_language || 'Unknown'}</Text>
          </View>
          
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Popularity:</Text>
            <Text style={styles.infoValue}>{dramaDetails.popularity?.toFixed(1) || 'Unknown'}</Text>
          </View>
        </View>
        
        <TouchableOpacity 
          style={[
            styles.actionButton, 
            isFavorite ? styles.removeButton : styles.addButton,
            processingDrama && styles.disabledButton
          ]}
          onPress={toggleFavorite}
          disabled={processingDrama}
        >
          {processingDrama ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Icon 
                type="ionicons"
                name={isFavorite ? "heart-dislike" : "heart"} 
                size={20} 
                color="#fff" 
              />
              <Text style={styles.actionButtonText}>
                {isFavorite ? 'Remove from Favorites' : 'Add to Favorites'}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
  },
  header: {
    position: 'relative',
    height: 300,
  },
  coverImage: {
    width: '100%',
    height: 300,
  },
  headerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 300,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'space-between',
    flexDirection: 'row',
    padding: 15,
    paddingTop: 40,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  favoriteButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  disabledButton: {
    opacity: 0.6,
  },
  detailsContainer: {
    padding: 20,
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    marginTop: -20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 5,
  },
  originalTitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 15,
  },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 15,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 15,
    marginBottom: 5,
  },
  statText: {
    fontSize: 14,
    color: '#666',
    marginLeft: 5,
  },
  genreContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 20,
  },
  genreTag: {
    backgroundColor: '#e0f2ff',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 15,
    marginRight: 8,
    marginBottom: 8,
  },
  genreText: {
    color: '#007bff',
    fontSize: 12,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
  },
  synopsis: {
    fontSize: 15,
    lineHeight: 22,
    color: '#444',
  },
  infoRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  infoLabel: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#555',
    width: 80,
  },
  infoValue: {
    fontSize: 15,
    color: '#333',
    flex: 1,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 15,
    borderRadius: 8,
    marginTop: 10,
    marginBottom: 30,
  },
  addButton: {
    backgroundColor: '#007bff',
  },
  removeButton: {
    backgroundColor: '#dc3545',
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 10,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 20,
    alignItems: 'center',
    elevation: 5,
    width: '80%',
  },
  modalText: {
    marginTop: 15,
    fontSize: 16,
    textAlign: 'center',
    color: '#333',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
  }
});

export default DramaDetails; 