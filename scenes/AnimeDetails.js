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
import { useFavorites } from '../config/FavoritesContext';
import { useSubscription } from '../config/SubscriptionContext';
import LoadingModal from '../components/LoadingModal';
import Icon from '../components/Icon';
import useTimer from '../hooks/useTimer';

const { width } = Dimensions.get('window');

const AnimeDetails = ({ route, navigation }) => {
  const { anime } = route.params;
  const [loading, setLoading] = useState(false);
  const [animeDetails, setAnimeDetails] = useState(null);
  const [countdown, setCountdown] = useState('');
  const [countdownInitialized, setCountdownInitialized] = useState(false);
  const { currentUser } = useAuth();
  const { isInFavorites, addToFavorites, removeFromFavorites, processingFavorite } = useFavorites();
  const { 
    canMakeChange, 
    getFormattedTimeRemaining, 
    isInCooldown, 
    usageStats, 
    getRemainingCounts, 
    navigateToPremiumUpgrade,
    loading: subscriptionLoading 
  } = useSubscription();
  
  // Use our custom timer hook
  const { setInterval, clearTimer } = useTimer();
  
  // Determine if anime is in favorites
  const isFavorite = isInFavorites(anime.mal_id);
  
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
      timerKey = setInterval(() => {
        setCountdown(getFormattedTimeRemaining());
      }, 1000, 'anime_countdown');
    } else {
      // No countdown needed, but we're still initialized
      setCountdown('');
      setCountdownInitialized(true);
    }
    
    return () => {
      if (timerKey) clearTimer(timerKey);
    };
  }, [usageStats.counterStartedAt, getFormattedTimeRemaining, setInterval, clearTimer, subscriptionLoading]);

  // Fetch additional anime details if needed
  useEffect(() => {
    // Don't fetch until countdown is initialized
    if (!countdownInitialized) {
      return;
    }
    
    // If anime data is complete, use it directly
    if (anime.synopsis && anime.genres) {
      setAnimeDetails(anime);
      return;
    }
    
    // Otherwise fetch more details from API
    const fetchAnimeDetails = async () => {
      try {
        setLoading(true);
        const response = await fetch(`https://api.jikan.moe/v4/anime/${anime.mal_id}`);
        const data = await response.json();
        
        if (data.data) {
          setAnimeDetails(data.data);
        } else {
          // If API failed, use existing data
          setAnimeDetails(anime);
        }
      } catch (error) {
        console.error('Error fetching anime details:', error);
        // Fallback to existing data
        setAnimeDetails(anime);
      } finally {
        setLoading(false);
      }
    };
    
    fetchAnimeDetails();
  }, [anime, countdownInitialized]);

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
      let success = false;
      
      if (isInFavorites(anime.mal_id)) {
        // Check if we can remove
        if (!canMakeChange()) {
          // Don't show error here - it's already handled by the context
          Alert.alert(
            'Cooldown Active',
            'You are currently in a cooldown period. Upgrade to premium to remove favorites without waiting.',
            [
              {
                text: 'OK',
                style: 'cancel'
              },
              {
                text: 'Upgrade to Premium',
                onPress: () => navigateToPremiumUpgrade()
              }
            ]
          );
          return;
        }
        
        // Remove from favorites
        success = await removeFromFavorites(anime.mal_id);
        if (success === true) {
          Alert.alert('Success', `${anime.title} removed from favorites`);
        }
        // Don't show error if false - already handled by context
      } else {
        // Check if we can add more
        const remaining = getRemainingCounts();
        if (remaining.anime <= 0) {
          Alert.alert(
            'Anime Favorites Limit Reached',
            `You've reached your limit of ${usageStats.isPremium ? 10 : 5} anime favorites. Please remove some or upgrade to premium for unlimited favorites.`,
            [
              { text: 'OK' },
              { 
                text: 'Upgrade to Premium', 
                onPress: navigateToPremiumUpgrade
              }
            ]
          );
          return;
        }
        
        // Add to favorites
        success = await addToFavorites(anime);
        if (success === true) {
          Alert.alert('Success', `${anime.title} added to favorites`);
        }
        // Don't show error if false - already handled by context
      }
    } catch (error) {
      console.error('Error toggling favorite:', error);
      Alert.alert('Error', 'An unexpected error occurred. Please try again.');
    }
  };

  const renderGenres = () => {
    const genres = animeDetails?.genres || [];
    if (genres.length === 0) return null;
    
    return (
      <View style={styles.genreContainer}>
        {genres.map((genre) => (
          <View key={genre.mal_id} style={styles.genreTag}>
            <Text style={styles.genreText}>{genre.name}</Text>
          </View>
        ))}
      </View>
    );
  };

  if (!animeDetails) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007bff" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <LoadingModal 
        visible={processingFavorite}
        message={isInFavorites(anime?.mal_id) ? 'Removing from favorites...' : 'Adding to favorites...'}
      />
      <View style={styles.header}>
        <Image 
          source={{ uri: animeDetails.images?.jpg?.large_image_url || animeDetails.images?.jpg?.image_url || 'https://via.placeholder.com/300x450' }} 
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
              processingFavorite && styles.disabledButton
            ]}
            onPress={toggleFavorite}
            disabled={processingFavorite}
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
        <Text style={styles.title}>{animeDetails.title}</Text>
        {animeDetails.title_english && animeDetails.title_english !== animeDetails.title && (
          <Text style={styles.englishTitle}>{animeDetails.title_english}</Text>
        )}
        
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Icon type="ionicons" name="star" size={16} color="#FFD700" />
            <Text style={styles.statText}>{animeDetails.score || 'N/A'}</Text>
          </View>
          
          <View style={styles.statItem}>
            <Icon type="ionicons" name="film-outline" size={16} color="#666" />
            <Text style={styles.statText}>
              {animeDetails.type || 'N/A'} ({animeDetails.episodes || '?'} eps)
            </Text>
          </View>
          
          <View style={styles.statItem}>
            <Icon type="ionicons" name="calendar-outline" size={16} color="#666" />
            <Text style={styles.statText}>{animeDetails.year || 'N/A'}</Text>
          </View>
          
          <View style={styles.statItem}>
            <Icon type="ionicons" name="people-outline" size={16} color="#666" />
            <Text style={styles.statText}>{animeDetails.members?.toLocaleString() || 'N/A'}</Text>
          </View>
        </View>
        
        {renderGenres()}
        
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Synopsis</Text>
          <Text style={styles.synopsis}>{animeDetails.synopsis || 'No synopsis available.'}</Text>
        </View>
        
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Information</Text>
          
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Status:</Text>
            <Text style={styles.infoValue}>{animeDetails.status || 'Unknown'}</Text>
          </View>
          
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Aired:</Text>
            <Text style={styles.infoValue}>{animeDetails.aired?.string || 'Unknown'}</Text>
          </View>
          
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Rating:</Text>
            <Text style={styles.infoValue}>{animeDetails.rating || 'Unknown'}</Text>
          </View>
          
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Studio:</Text>
            <Text style={styles.infoValue}>
              {animeDetails.studios && animeDetails.studios.length > 0 
                ? animeDetails.studios.map(s => s.name).join(', ') 
                : 'Unknown'}
            </Text>
          </View>
          
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Source:</Text>
            <Text style={styles.infoValue}>{animeDetails.source || 'Unknown'}</Text>
          </View>
          
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Duration:</Text>
            <Text style={styles.infoValue}>{animeDetails.duration || 'Unknown'}</Text>
          </View>
        </View>
        
        <TouchableOpacity 
          style={[
            styles.actionButton, 
            isFavorite ? styles.removeButton : styles.addButton,
            processingFavorite && styles.disabledButton
          ]}
          onPress={toggleFavorite}
          disabled={processingFavorite}
        >
          {processingFavorite ? (
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
  englishTitle: {
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

export default AnimeDetails; 