import React, { useState, useEffect, useCallback, memo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  Image,
  ActivityIndicator,
  Alert,
  Modal,
  RefreshControl
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../config/AuthContext';
import { useFavorites } from '../config/FavoritesContext';
import { useDramas } from '../config/DramaContext';
import { useSubscription } from '../config/SubscriptionContext';
import firestoreService from '../services/firestoreService';
import LoadingModal from '../components/LoadingModal';
import useTimer from '../hooks/useTimer';

const TMDB_API_KEY = 'b2b68cd65cf02c8da091b2857084bd4d';

// Create a memoized anime item component
const AnimeItem = memo(({ item, navigation, toggleFavorite }) => {
  const handlePress = () => {
    navigation.navigate('AnimeDetails', { anime: item });
  };

  const handleFavoritePress = () => {
    toggleFavorite(item);
  };

  return (
    <TouchableOpacity style={styles.animeContainer} onPress={handlePress}>
      <Image
        source={{ uri: item.images?.jpg?.image_url || 'https://via.placeholder.com/150' }}
        style={styles.animeImage}
        resizeMode="cover"
      />
      <View style={styles.animeInfo}>
        <Text style={styles.animeTitle} numberOfLines={2}>
          {item.title}
        </Text>
        <Text style={styles.animeGenre} numberOfLines={1}>
          {item.genres?.map(genre => genre.name).join(', ') || 'N/A'}
        </Text>
        <TouchableOpacity 
          style={[styles.favoriteButton, item.isFavorite ? styles.favoriteActive : null]} 
          onPress={handleFavoritePress}
        >
          <Ionicons name={item.isFavorite ? 'heart' : 'heart-outline'} size={24} color={item.isFavorite ? '#ff4081' : '#666'} />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
});

// Create a memoized drama item component
const DramaItem = memo(({ item, navigation, toggleDramaFavorite }) => {
  const handlePress = () => {
    navigation.navigate('DramaDetails', { drama: item });
  };

  const handleFavoritePress = () => {
    toggleDramaFavorite(item);
  };

  return (
    <TouchableOpacity style={styles.animeContainer} onPress={handlePress}>
      <Image
        source={{ 
          uri: item.poster_path 
            ? `https://image.tmdb.org/t/p/w500${item.poster_path}` 
            : 'https://via.placeholder.com/150' 
        }}
        style={styles.animeImage}
        resizeMode="cover"
      />
      <View style={styles.animeInfo}>
        <Text style={styles.animeTitle} numberOfLines={2}>
          {item.name}
        </Text>
        <Text style={styles.animeGenre} numberOfLines={1}>
          {item.origin_country?.join(', ') || 'N/A'}
        </Text>
        <TouchableOpacity 
          style={[styles.favoriteButton, item.isFavorite ? styles.favoriteActive : null]} 
          onPress={handleFavoritePress}
        >
          <Ionicons name={item.isFavorite ? 'heart' : 'heart-outline'} size={24} color={item.isFavorite ? '#ff4081' : '#666'} />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
});

const Home = ({ navigation }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [animeResults, setAnimeResults] = useState([]);
  const [dramaResults, setDramaResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState('');
  const [countdownInitialized, setCountdownInitialized] = useState(false);
  const [activeTab, setActiveTab] = useState('anime'); // 'anime' or 'drama'
  
  const { currentUser } = useAuth();
  const { 
    favorites, 
    isInFavorites, 
    addToFavorites, 
    removeFromFavorites,
    maxFavorites,
    processingFavorite
  } = useFavorites();
  const { 
    dramas,
    isInDramas,
    addToDramas,
    removeFromDramas,
    processingDrama
  } = useDramas();
  const { 
    canMakeChange, 
    getFormattedTimeRemaining,
    usageStats,
    getRemainingCounts,
    isInCooldown,
    getWeeklyChangesCount,
    LIMITS,
    loading: subscriptionLoading
  } = useSubscription();

  // Get maxWeeklyChanges from LIMITS
  const maxWeeklyChanges = usageStats.isPremium ? Infinity : LIMITS.FREE.MAX_CHANGES_PER_WEEK;
  
  // Get weekly changes count from context method
  const weeklyChangesCount = getWeeklyChangesCount();

  // Use our custom timer hook
  const { setInterval, clearTimer } = useTimer();
  
  // Countdown timer
  useEffect(() => {
    let timerKey;
    
    // Once subscription data is loaded, we can initialize the countdown
    if (usageStats.counterStartedAt) {
      // Mark as initialized first to prevent flicker
      setCountdownInitialized(true);
      
      // Initialize countdown immediately
      setCountdown(getFormattedTimeRemaining());
      
      // Start the countdown timer to update every second
      timerKey = setInterval(() => {
        setCountdown(getFormattedTimeRemaining());
      }, 1000, 'countdown');
    } else {
      // No countdown needed, but we're still initialized
      setCountdown('');
      setCountdownInitialized(true);
    }
    
    // Our custom hook will handle cleanup automatically, 
    // but we can explicitly clear if needed
    return () => {
      if (timerKey) clearTimer(timerKey);
    };
  }, [usageStats.counterStartedAt, getFormattedTimeRemaining, setInterval, clearTimer]);

  // State to track which anime is being processed
  const [processingAnime, setProcessingAnime] = useState(null);
  // State to track which drama is being processed
  const [processingDramaItem, setProcessingDramaItem] = useState(null);

  // Load seasonal anime and trending dramas on component mount
  useEffect(() => {
    if (countdownInitialized) {
      if (activeTab === 'anime') {
        loadSeasonalAnime();
      } else {
        loadTrendingDramas();
      }
    }
  }, [countdownInitialized, activeTab]);

  // Update anime results with current favorite status when favorites change
  useEffect(() => {
    if (animeResults.length > 0) {
      // Update the isFavorite flag for each anime
      setAnimeResults(prev => 
        prev.map(anime => ({
          ...anime,
          isFavorite: isInFavorites(anime.mal_id)
        }))
      );
    }
  }, [favorites]);

  // Update drama results with current favorite status when dramas change
  useEffect(() => {
    if (dramaResults.length > 0) {
      // Update the isFavorite flag for each drama
      setDramaResults(prev => 
        prev.map(drama => ({
          ...drama,
          isFavorite: isInDramas(drama.id)
        }))
      );
    }
  }, [dramas]);

  // Add a useEffect to refresh UI when usageStats changes
  useEffect(() => {
    // This ensures the component re-renders when usageStats changes
    // (especially after cooldown resets changesThisWeek to 0)
  }, [usageStats]);

  // Render a small usage indicator 
  const renderUsageIndicator = () => {
    const cooldownActive = isInCooldown();
    const { isPremium } = usageStats;
    const maxFavoritesDisplay = isPremium ? LIMITS.PREMIUM.MAX_FAVORITES : LIMITS.FREE.MAX_FAVORITES;
    const currentFavorites = activeTab === 'anime' ? favorites.length : dramas.length;
    
    return (
      <View style={styles.usageIndicator}>
        <View style={styles.usageRow}>
          <Text style={styles.usageText}>
            {activeTab === 'anime' ? 'Anime' : 'Drama'} Favorites: {currentFavorites}/{maxFavoritesDisplay === Infinity ? (
              <Text style={styles.premiumText}>Unlimited</Text>
            ) : maxFavoritesDisplay}
          </Text>
          {cooldownActive ? (
            <Text style={[styles.usageText, styles.lockedText]}>
              Changes: Locked ({countdown} remaining)
            </Text>
          ) : (
            <Text style={styles.usageText}>
              Weekly Removals: {isPremium ? (
                <Text style={styles.premiumText}>Unlimited</Text>
              ) : (
                `${weeklyChangesCount}/${maxWeeklyChanges}`
              )}
            </Text>
          )}
          
          {/* Premium badge indicator */}
          {isPremium && (
            <View style={styles.premiumIndicator}>
              <Ionicons name="star" size={14} color="#FFD700" />
              <Text style={styles.premiumIndicatorText}>PREMIUM</Text>
            </View>
          )}
        </View>
      </View>
    );
  };

  const loadSeasonalAnime = async () => {
    try {
      setLoading(true);
      setAnimeResults([]);
      
      // Get current season and year
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1; // JavaScript months are 0-indexed
      
      // Determine season based on month
      let season;
      if (month >= 1 && month <= 3) season = 'winter';
      else if (month >= 4 && month <= 6) season = 'spring';
      else if (month >= 7 && month <= 9) season = 'summer';
      else season = 'fall';
      
      // Fetch seasonal anime
      const response = await fetch(`https://api.jikan.moe/v4/seasons/${year}/${season}`);
      const data = await response.json();
      
      if (data.data) {
        // Mark favorites in results for UI indication
        const results = data.data.map(anime => ({
          ...anime,
          isFavorite: isInFavorites(anime.mal_id)
        }));
        
        setAnimeResults(results);
      } else {
        // If API fails, show a message
        setAnimeResults([]);
        Alert.alert('Error', 'Failed to load seasonal anime');
      }
    } catch (error) {
      console.error('Error loading seasonal anime:', error);
      Alert.alert('Error', 'Failed to load seasonal anime. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const loadTrendingDramas = async () => {
    try {
      setLoading(true);
      setDramaResults([]);
      
      // Define Asian regions as array
      const regions = ['KR', 'CN', 'JP', 'TW', 'HK', 'TH']; // Korea, China, Japan, Taiwan, Hong Kong, Thailand
      
      let allDramas = [];
      
      // First try trending TV shows - usually more reliable
      console.log('Fetching trending TV shows...');
      const trendingResponse = await fetch(
        `https://api.themoviedb.org/3/trending/tv/week?api_key=${TMDB_API_KEY}`
      );
      
      if (trendingResponse.ok) {
        const trendingData = await trendingResponse.json();
        console.log(`Trending TV shows response: ${trendingData.results?.length} shows found`);
        
        // Filter trending shows by Asian regions
        if (trendingData.results && trendingData.results.length > 0) {
          const filteredDramas = trendingData.results.filter(show => 
            show.origin_country && 
            show.origin_country.some(country => regions.includes(country))
          );
          
          console.log(`Filtered Asian dramas from trending: ${filteredDramas.length}`);
          allDramas = [...allDramas, ...filteredDramas];
        }
      }
      
      // If we don't have enough dramas, fetch region-specific content
      if (allDramas.length < 10) {
        console.log('Not enough trending dramas, fetching by region...');
        
        // Create separate requests for each region
        const requests = regions.map(region => {
          console.log(`Fetching TV shows for region: ${region}`);
          return fetch(`https://api.themoviedb.org/3/discover/tv?api_key=${TMDB_API_KEY}&with_origin_country=${region}&sort_by=popularity.desc`)
            .then(res => res.json())
            .then(data => {
              console.log(`Region ${region} results: ${data.results?.length || 0} shows`);
              return data;
            });
        });
        
        // Wait for all requests to complete
        const responses = await Promise.all(requests);
        
        // Merge all results into a single array
        responses.forEach(data => {
          if (data.results && data.results.length > 0) {
            allDramas = [...allDramas, ...data.results];
          }
        });
      }
      
      // Remove duplicates (in case a show is from multiple countries)
      const uniqueDramas = Array.from(new Map(allDramas.map(item => [item.id, item])).values());
      console.log(`Total unique dramas found: ${uniqueDramas.length}`);
      
      if (uniqueDramas.length > 0) {
        // Mark favorites in results for UI indication
        const results = uniqueDramas.map(drama => ({
          ...drama,
          isFavorite: isInDramas(drama.id)
        }));
        
        // Sort by popularity (descending)
        results.sort((a, b) => b.popularity - a.popularity);
        
        // Limit to reasonable number to display
        setDramaResults(results.slice(0, 20));
      } else {
        // If no results, show a message
        setDramaResults([]);
        Alert.alert('Error', 'Failed to load trending dramas');
      }
    } catch (error) {
      console.error('Error loading trending dramas:', error);
      Alert.alert('Error', 'Failed to load trending dramas. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const searchAnime = async () => {
    if (!searchQuery.trim()) {
      // If search is empty, load seasonal anime
      loadSeasonalAnime();
      return;
    }
    
    try {
      setLoading(true);
      setAnimeResults([]);
      
      const response = await fetch(`https://api.jikan.moe/v4/anime?q=${searchQuery}&limit=20`);
      const data = await response.json();
      
      if (data.data) {
        // Mark favorites in search results for UI consistency
        const results = data.data.map(anime => ({
          ...anime,
          isFavorite: isInFavorites(anime.mal_id)
        }));
        
        setAnimeResults(results);
      }
    } catch (error) {
      console.error('Error searching anime:', error);
      Alert.alert('Search Error', 'Failed to search for anime. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const searchDramas = async () => {
    if (!searchQuery.trim()) {
      // If search is empty, load trending dramas
      loadTrendingDramas();
      return;
    }
    
    try {
      setLoading(true);
      setDramaResults([]);
      
      // Define Asian regions
      const regions = ['KR', 'CN', 'JP', 'TW', 'HK', 'TH'];
      console.log(`Searching dramas with query: "${searchQuery}"`);
      
      let searchResults = [];
      
      // First try the generic search
      const response = await fetch(
        `https://api.themoviedb.org/3/search/tv?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(searchQuery)}&page=1`
      );
      
      if (response.ok) {
        const data = await response.json();
        console.log(`Generic search returned ${data.results?.length || 0} results`);
        
        if (data.results && data.results.length > 0) {
          // Filter to only include Asian dramas based on origin_country
          const asianResults = data.results.filter(show => 
            show.origin_country && 
            show.origin_country.some(country => regions.includes(country))
          );
          console.log(`Filtered Asian results: ${asianResults.length}`);
          searchResults = [...searchResults, ...asianResults];
        }
      }
      
      // Try separate region searches with the query
      const regionRequests = regions.map(region => {
        console.log(`Searching region ${region} with query: "${searchQuery}"`);
        return fetch(`https://api.themoviedb.org/3/discover/tv?api_key=${TMDB_API_KEY}&with_origin_country=${region}&with_keywords=${encodeURIComponent(searchQuery)}&sort_by=popularity.desc`)
          .then(res => res.json())
          .then(data => {
            
            return data;
          });
      });
      
      const regionResponses = await Promise.all(regionRequests);
      
      // Add results from region-specific searches
      regionResponses.forEach(data => {
        if (data.results && data.results.length > 0) {
          searchResults = [...searchResults, ...data.results];
        }
      });
      
      // Remove duplicates
      searchResults = Array.from(new Map(searchResults.map(item => [item.id, item])).values());
      
      
      if (searchResults.length > 0) {
        // Mark favorites in search results for UI consistency
        const results = searchResults.map(drama => ({
          ...drama,
          isFavorite: isInDramas(drama.id)
        }));
        
        // Sort by popularity (descending)
        results.sort((a, b) => b.popularity - a.popularity);
        
        // Limit to reasonable number
        setDramaResults(results.slice(0, 20));
      } else {
        setDramaResults([]);
        console.log('No drama search results found');
      }
    } catch (error) {
      console.error('Error searching dramas:', error);
      Alert.alert('Search Error', 'Failed to search for dramas. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    if (activeTab === 'anime') {
      searchAnime();
    } else {
      searchDramas();
    }
  };

  const toggleFavorite = async (anime) => {
    if (processingAnime) {
      console.log('Already processing an anime');
      return;
    }
    
    setProcessingAnime(anime.mal_id);
    
    try {
      if (isInFavorites(anime.mal_id)) {
        // Remove from favorites
        const result = await removeFromFavorites(anime.mal_id);
        
        if (result === true) {
          // Update the local state to reflect the change
          setAnimeResults(prevResults => 
            prevResults.map(item => 
              item.mal_id === anime.mal_id ? { ...item, isFavorite: false } : item
            )
          );
          
          // Show success message
          console.log('Successfully removed from favorites');
        } else {
          // Don't show error message as it's already handled in the context
          console.log('Could not remove from favorites - handled by context');
        }
      } else {
        // Add to favorites
        const result = await addToFavorites(anime);
        
        if (result === true) {
          // Update the local state to reflect the change
          setAnimeResults(prevResults => 
            prevResults.map(item => 
              item.mal_id === anime.mal_id ? { ...item, isFavorite: true } : item
            )
          );
          
          // Show success message if needed
          console.log('Successfully added to favorites');
        } else {
          // Don't show error message as it's already handled in the context
          console.log('Could not add to favorites - handled by context');
        }
      }
    } catch (error) {
      console.error('Error toggling favorite:', error);
      Alert.alert('Error', 'An unexpected error occurred. Please try again.');
    } finally {
      setProcessingAnime(null);
    }
  };

  const toggleDramaFavorite = async (drama) => {
    if (processingDramaItem || processingDrama) {
      console.log('Already processing a drama');
      return;
    }
    
    setProcessingDramaItem(drama);
    
    try {
      if (isInDramas(drama.id)) {
        // Remove from favorites
        const result = await removeFromDramas(drama.id);
        
        if (result.success === true) {
          // Update the local state to reflect the change
          setDramaResults(prevResults => 
            prevResults.map(item => 
              item.id === drama.id ? { ...item, isFavorite: false } : item
            )
          );
          
          // Show success message
          console.log('Successfully removed from drama favorites');
        } else {
          // Don't show error message as it's already handled in the context
          console.log(`Could not remove from drama favorites - ${result.error || 'handled by context'}`);
        }
      } else {
        // Add to favorites
        const result = await addToDramas(drama);
        
        if (result.success === true) {
          // Update the local state to reflect the change
          setDramaResults(prevResults => 
            prevResults.map(item => 
              item.id === drama.id ? { ...item, isFavorite: true } : item
            )
          );
          
          // Show success message if needed
          console.log('Successfully added to drama favorites');
        } else {
          // Don't show error message as it's already handled in the context
          console.log(`Could not add to drama favorites - ${result.error || 'handled by context'}`);
        }
      }
    } catch (error) {
      console.error('Error toggling drama favorite:', error);
      Alert.alert('Error', 'An unexpected error occurred. Please try again.');
    } finally {
      setProcessingDramaItem(null);
    }
  };

  // Memoize these functions to prevent unnecessary re-renders
  const renderAnimeItem = useCallback(({ item }) => {
    return (
      <AnimeItem 
        item={item} 
        navigation={navigation} 
        toggleFavorite={toggleFavorite} 
      />
    );
  }, [navigation, toggleFavorite]);

  const renderDramaItem = useCallback(({ item }) => {
    return (
      <DramaItem 
        item={item} 
        navigation={navigation} 
        toggleDramaFavorite={toggleDramaFavorite} 
      />
    );
  }, [navigation, toggleDramaFavorite]);

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Ionicons 
        name={activeTab === 'anime' ? "tv-outline" : "film-outline"} 
        size={80} 
        color="#ccc" 
      />
      <Text style={styles.emptyText}>
        {loading 
          ? `Loading ${activeTab === 'anime' ? 'anime' : 'dramas'}...` 
          : `No ${activeTab === 'anime' ? 'anime' : 'dramas'} found`
        }
      </Text>
      <Text style={styles.emptySubText}>
        {!loading && `Try a different search term or check back later for more ${activeTab === 'anime' ? 'anime' : 'dramas'}.`}
      </Text>
    </View>
  );

  // Render tabs
  const renderTabs = () => (
    <View style={styles.tabContainer}>
      <TouchableOpacity
        style={[styles.tabButton, activeTab === 'anime' && styles.activeTab]}
        onPress={() => setActiveTab('anime')}
      >
        <Ionicons 
          name="tv-outline" 
          size={20} 
          color={activeTab === 'anime' ? "#FFFFFF" : "#007bff"} 
        />
        <Text style={[styles.tabText, activeTab === 'anime' && styles.activeTabText]}>
          Anime
        </Text>
      </TouchableOpacity>
      
      <TouchableOpacity
        style={[styles.tabButton, activeTab === 'drama' && styles.activeTab]}
        onPress={() => setActiveTab('drama')}
      >
        <Ionicons 
          name="film-outline" 
          size={20} 
          color={activeTab === 'drama' ? "#FFFFFF" : "#007bff"} 
        />
        <Text style={[styles.tabText, activeTab === 'drama' && styles.activeTabText]}>
          Asian Drama
        </Text>
      </TouchableOpacity>
    </View>
  );

  // Main render
  if (subscriptionLoading || !countdownInitialized) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#007bff" />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Use the shared loading modal component */}
      <LoadingModal 
        visible={processingFavorite || processingDrama}
        message={processingFavorite ? 'Updating favorites...' : 'Updating drama favorites...'}
      />
      
      {/* Subscription usage indicator */}
      {renderUsageIndicator()}
      
      {/* Content type tabs */}
      {renderTabs()}
      
      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder={`Search for ${activeTab === 'anime' ? 'anime' : 'Asian dramas'}...`}
          value={searchQuery}
          onChangeText={setSearchQuery}
          onSubmitEditing={handleSearch}
        />
        <TouchableOpacity 
          style={styles.searchButton}
          onPress={handleSearch}
        >
          <Ionicons name="search" size={24} color="#fff" />
        </TouchableOpacity>
      </View>
      
      {/* Results list */}
      {activeTab === 'anime' ? (
        <FlatList
          data={animeResults}
          renderItem={renderAnimeItem}
          keyExtractor={(item, index) => `anime_${item.mal_id}_${index}`}
          contentContainerStyle={styles.listContainer}
          ListEmptyComponent={renderEmptyState}
          numColumns={1}
          onRefresh={loadSeasonalAnime}
          refreshing={loading}
        />
      ) : (
        <FlatList
          data={dramaResults}
          renderItem={renderDramaItem}
          keyExtractor={(item, index) => `drama_${item.id}_${index}`}
          contentContainerStyle={styles.listContainer}
          ListEmptyComponent={renderEmptyState}
          numColumns={1}
          onRefresh={loadTrendingDramas}
          refreshing={loading}
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
  usageIndicator: {
    backgroundColor: '#fff',
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 8,
    marginBottom: 10,
    elevation: 2,
  },
  usageRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  usageText: {
    fontSize: 14,
    color: '#444',
  },
  premiumText: {
    color: '#FFD700',
    fontWeight: 'bold',
  },
  lockedText: {
    color: '#dc3545',
    fontWeight: 'bold',
  },
  premiumIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF8E1',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FFD700',
  },
  premiumIndicatorText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#DAA520',
    marginLeft: 3,
  },
  searchContainer: {
    flexDirection: 'row',
    marginBottom: 15,
  },
  searchInput: {
    flex: 1,
    height: 50,
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 15,
    fontSize: 16,
    elevation: 2,
  },
  searchButton: {
    width: 50,
    height: 50,
    backgroundColor: '#007bff',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    marginLeft: 10,
    elevation: 2,
  },
  listContainer: {
    paddingBottom: 20,
  },
  animeContainer: {
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
  animeGenre: {
    fontSize: 14,
    color: '#555',
    marginBottom: 3,
  },
  favoriteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
    borderRadius: 5,
    backgroundColor: '#e6f2ff',
    marginTop: 5,
  },
  favoriteActive: {
    backgroundColor: '#ff4081',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 50,
  },
  emptyText: {
    fontSize: 18,
    color: '#666',
    textAlign: 'center',
    marginTop: 10,
  },
  emptySubText: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    marginTop: 5,
    paddingHorizontal: 30,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingModal: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 20,
    alignItems: 'center',
    elevation: 5,
    minWidth: 200,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#333',
  },
  tabContainer: {
    flexDirection: 'row',
    marginBottom: 15,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#007bff',
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    backgroundColor: '#fff',
  },
  activeTab: {
    backgroundColor: '#007bff',
  },
  tabText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#007bff',
    marginLeft: 8,
  },
  activeTabText: {
    color: '#fff',
  },
});

export default Home;