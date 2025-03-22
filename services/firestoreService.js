import { 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  collection, 
  query, 
  where, 
  getDocs, 
  arrayUnion, 
  arrayRemove,
  deleteField,
  deleteDoc,
  writeBatch,
  addDoc,
  serverTimestamp,
  increment,
  Timestamp,
  orderBy,
  limit,
  runTransaction
} from 'firebase/firestore';
import { db } from '../config/firebaseConfig';
import cloudinaryService from './cloudinaryService';
import { getStorage, ref, deleteObject } from 'firebase/storage';

// Match threshold - users need this many common anime to be considered a match
const MATCH_THRESHOLD = 3;

const firestoreService = {
  /**
   * Creates a new user profile in Firestore
   * @param {string} userId - The user ID
   * @param {string} displayName - User's display name
   * @param {string} email - User's email
   * @returns {Promise<Object>} Result object
   */
  createUserProfile: async (userId, displayName, email) => {
    try {
      // Create user document in Firestore
      await setDoc(doc(db, 'users', userId), {
        userId,
        userName: displayName,
        email,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        photos: [], // Array of photo objects with url and publicId
        photoURL: null, // Profile photo URL (first photo)
        gender: '',
        birthdate: null,
        age: null,
        education: '',
        bio: '',
        location: '',
        matchGender: 'everyone', // Default value
        matchLocation: 'worldwide', // Default value
        favoriteAnimeIds: [], // For quick matching
        favorites: [], // Array of anime IDs as strings
        favoritesData: {}, // Object containing detailed anime data
      });
      
      return { success: true };
    } catch (error) {
      console.error('Error creating user profile in Firestore:', error);
      return { success: false, error: error.message };
    }
  },

  // Add a new favorite anime to user profile and update anime-user mapping
  addFavorite: async (userId, anime) => {
    try {
      console.log(`Adding anime ${anime.mal_id} to favorites for user ${userId}`);
      
      // Check if user document exists
      const userDocRef = doc(db, 'users', userId);
      const userDoc = await getDoc(userDocRef);
      
      if (!userDoc.exists()) {
        console.error(`User document not found for user ${userId}`);
        return { success: false, error: 'User document not found' };
      }
      
      // Check if anime is already in favorites to prevent duplicates
      const userData = userDoc.data();
      const favorites = userData.favorites || [];
      const favoritesData = userData.favoritesData || {};
      
      const isAlreadyFavorite = favorites.includes(anime.mal_id) || favoritesData[anime.mal_id];
      
      if (isAlreadyFavorite) {
        console.log(`Anime ${anime.mal_id} is already in favorites for user ${userId}`);
        return { success: true, message: 'Already in favorites' };
      }
      
      // Create a batch operation
      const batch = writeBatch(db);
      
      // Add anime to global animeUsers collection to track popularity
      const animeUsersRef = doc(db, 'animeUsers', anime.mal_id.toString());
      const animeUsersDoc = await getDoc(animeUsersRef);
      
      if (animeUsersDoc.exists()) {
        // Anime document exists, add user to the users array
        batch.update(animeUsersRef, {
          users: arrayUnion(userId)
        });
      } else {
        // Create new anime document with this user
        batch.set(animeUsersRef, {
          animeId: anime.mal_id,
          title: anime.title,
          image: anime.images?.jpg?.image_url,
          users: [userId]
        });
      }
      
      // Prepare anime data for storage
      const animeData = {
        mal_id: anime.mal_id,
        title: anime.title,
        synopsis: anime.synopsis,
        episodes: anime.episodes,
        score: anime.score,
        year: anime.year,
        images: anime.images,
        genres: anime.genres,
        studios: anime.studios,
        addedAt: serverTimestamp()
      };
      
      // Add anime to user's favorites list
      batch.update(userDocRef, {
        favorites: arrayUnion(anime.mal_id),
        [`favoritesData.${anime.mal_id}`]: animeData
      });
      
      // Commit the batch
      await batch.commit();
      console.log(`Successfully added anime ${anime.mal_id} to favorites for user ${userId}`);
      
      return { success: true };
    } catch (error) {
      console.error('Error adding anime to favorites:', error);
      return { success: false, error: error.message };
    }
  },

  // Directly update the favorites count in Firestore to ensure consistency
  updateFavoriteCount: async (userId, count) => {
    try {
      console.log(`Directly updating favorite count for user ${userId} to ${count}`);
      
      const userRef = doc(db, 'users', userId);
      
      // Update the subscription stats with the correct count
      await updateDoc(userRef, {
        'subscription.favoritesCount': count
      });
      
      return { success: true };
    } catch (error) {
      console.error('Error updating favorite count:', error);
      return { success: false, error: error.message };
    }
  },

  // Directly update the drama count in Firestore to ensure consistency
  updateDramaCount: async (userId, count) => {
    try {
      console.log(`Directly updating drama count for user ${userId} to ${count}`);
      
      const userRef = doc(db, 'users', userId);
      
      // Update the subscription stats with the correct count
      await updateDoc(userRef, {
        'subscription.dramasCount': count
      });
      
      return { success: true };
    } catch (error) {
      console.error('Error updating drama count:', error);
      return { success: false, error: error.message };
    }
  },

  // Function to remove an anime from user's favorites
  removeAnimeFromFavorites: async (userId, animeId) => {
    console.log(`[firestoreService] removeAnimeFromFavorites called with userId: ${userId}, animeId: ${animeId}`);
    
    try {
      // Ensure animeId is a number for consistent comparison
      const normalizedAnimeId = typeof animeId === 'string' ? parseInt(animeId, 10) : animeId;
      console.log(`[firestoreService] Using normalized animeId: ${normalizedAnimeId} (${typeof normalizedAnimeId})`);
      
      const userRef = doc(db, 'users', userId);
      const userSnap = await getDoc(userRef);
      
      if (!userSnap.exists()) {
        console.error(`[firestoreService] User document not found for userId: ${userId}`);
        return { success: false, error: 'User document not found' };
      }
      
      const userData = userSnap.data();
      
      // Check if anime exists in either favorites array or favoritesData
      const favoritesArray = userData.favorites || [];
      const favoritesData = userData.favoritesData || {};
      
      console.log(`[firestoreService] Checking if anime ${normalizedAnimeId} exists in favorites`);
      console.log(`[firestoreService] Favorites array length: ${favoritesArray.length}`);
      console.log(`[firestoreService] FavoritesData keys: ${Object.keys(favoritesData).join(', ')}`);

      // For older data structure, favorites might be just IDs or objects with mal_id
      const existsInFavoritesArray = favoritesArray.some(fav => 
        // Check if it's a primitive (number/string) or an object with mal_id
        (typeof fav === 'object' ? fav.mal_id === normalizedAnimeId : Number(fav) === normalizedAnimeId)
      );
      
      // For newer structure, check if it exists in favoritesData
      const existsInFavoritesData = favoritesData.hasOwnProperty(normalizedAnimeId.toString());
      
      if (!existsInFavoritesArray && !existsInFavoritesData) {
        console.log(`[firestoreService] Anime ${normalizedAnimeId} not found in favorites, nothing to remove`);
        return { success: true, message: 'Not in favorites' };
      }
      
      console.log(`[firestoreService] Found anime ${normalizedAnimeId} in favorites, removing it now`);
      
      // Prepare batch operations for atomic update
      const batch = writeBatch(db);
      
      // Update the favorites array - remove the ID or object with this mal_id
      if (existsInFavoritesArray) {
        // First try removing it assuming it's a primitive value
        batch.update(userRef, { 
          favorites: arrayRemove(normalizedAnimeId) 
        });
        
        // Also try removing it as a string in case it's stored that way
        batch.update(userRef, { 
          favorites: arrayRemove(normalizedAnimeId.toString()) 
        });
        
        // For older structure where favorites might contain full objects
        batch.update(userRef, {
          favorites: userData.favorites.filter(fav => 
            typeof fav === 'object' ? fav.mal_id !== normalizedAnimeId : Number(fav) !== normalizedAnimeId
          )
        });
      }
      
      // Remove from favoritesData using deleteField
      if (existsInFavoritesData) {
        batch.update(userRef, {
          [`favoritesData.${normalizedAnimeId}`]: deleteField()
        });
      }
      
      // Remove from favoriteAnimeIds if it exists (legacy field)
      if (userData.favoriteAnimeIds) {
        batch.update(userRef, {
          favoriteAnimeIds: arrayRemove(normalizedAnimeId),
          favoriteAnimeIds: arrayRemove(normalizedAnimeId.toString())
        });
      }
      
      // Update the favorites count - get the new count after removals
      const updatedCount = Math.max(0, (userData.favorites?.length || 0) - 1);
      batch.update(userRef, { 
        'subscription.favoritesCount': updatedCount
      });
      
      // Commit the batch
      await batch.commit();
      
      // Verify the removal was successful
      const updatedUserSnap = await getDoc(userRef);
      if (updatedUserSnap.exists()) {
        const updatedUserData = updatedUserSnap.data();
        const updatedFavoritesArray = updatedUserData.favorites || [];
        const updatedFavoritesData = updatedUserData.favoritesData || {};
        
        const stillExistsInArray = updatedFavoritesArray.some(fav => 
          (typeof fav === 'object' ? fav.mal_id === normalizedAnimeId : Number(fav) === normalizedAnimeId)
        );
        
        const stillExistsInData = updatedFavoritesData.hasOwnProperty(normalizedAnimeId.toString());
        
        if (stillExistsInArray || stillExistsInData) {
          console.error(`[firestoreService] Verification failed - anime ${normalizedAnimeId} still exists in favorites after removal`);
          console.log(`[firestoreService] Still in array: ${stillExistsInArray}, Still in data: ${stillExistsInData}`);
          
          // Emergency final attempt using direct approach
          try {
            // Create a new cleaned array without this anime ID
            const cleanedArray = updatedFavoritesArray.filter(fav => 
              (typeof fav === 'object' ? fav.mal_id !== normalizedAnimeId : Number(fav) !== normalizedAnimeId)
            );
            
            // Create a new cleaned favoritesData without this anime
            const cleanedFavoritesData = {...updatedFavoritesData};
            delete cleanedFavoritesData[normalizedAnimeId];
            delete cleanedFavoritesData[normalizedAnimeId.toString()];
            
            // Update with clean data
            await updateDoc(userRef, {
              favorites: cleanedArray,
              favoritesData: cleanedFavoritesData,
              'subscription.favoritesCount': cleanedArray.length
            });
            
            console.log(`[firestoreService] Emergency cleanup completed. New favorites count: ${cleanedArray.length}`);
          } catch (emergencyError) {
            console.error(`[firestoreService] Emergency cleanup failed:`, emergencyError);
          }
          
          return { 
            success: false, 
            error: 'Verification failed - anime still exists after removal',
            needsSecondAttempt: true
          };
        }
      }
      
      console.log(`[firestoreService] Successfully removed anime ${normalizedAnimeId} from favorites`);
      return { success: true };
    } catch (error) {
      console.error(`[firestoreService] Error removing anime from favorites:`, error);
      return { success: false, error: error.message };
    }
  },

  // Get user favorites - simplified for new structure
  getUserFavorites: async (userId) => {
    try {
      const userRef = doc(db, 'users', userId);
      const userDoc = await getDoc(userRef);
      
      if (!userDoc.exists()) {
        return [];
      }
      
      const userData = userDoc.data();
      const favorites = [];
      
      // Convert the favoritesData object to array for UI display
      if (userData.favoritesData) {
        Object.entries(userData.favoritesData).forEach(([animeId, data]) => {
          favorites.push({
            mal_id: parseInt(animeId),
            title: data.title,
            images: { jpg: { image_url: data.image } },
            score: data.score,
            type: data.type,
            episodes: data.episodes
          });
        });
      }
      
      return favorites;
    } catch (error) {
      console.error('Error getting user favorites:', error);
      throw error;
    }
  },
  
  // Modified to maintain backward compatibility
  updateBidirectionalMatches: async (userId, shouldProcessMatches = false) => {
    try {
      console.log(`Starting to update matches for user ${userId}`);
      
      // Get current user's data
      const userRef = doc(db, 'users', userId);
      const userDoc = await getDoc(userRef);
      
      if (!userDoc.exists()) {
        return { success: false, error: 'User not found' };
      }
      
      const userData = userDoc.data() || {};
      const userFavorites = userData.favorites || [];
      
      // Get current matches to preserve them
      const currentMatches = Array.isArray(userData.matches) ? userData.matches : [];
      const currentMatchesData = userData.matchesData || {};
      
      console.log(`User ${userId} has ${userFavorites.length} favorites and ${currentMatches.length} existing matches`);
      
      // If user has no favorites and no existing matches, nothing to do
      if (userFavorites.length === 0 && currentMatches.length === 0) {
        return { success: true, matches: [] };
      }
      
      // Get user's gender preferences and location preferences
      const userGender = userData.gender || '';
      const userMatchGender = userData.matchGender || 'everyone';
      const userLocation = userData.location || '';
      const userMatchLocation = userData.matchLocation || 'worldwide';
      
      console.log(`User ${userId} preferences: gender=${userGender}, matchGender=${userMatchGender}, location=${userLocation}, matchLocation=${userMatchLocation}`);
      
      // Using a Map to count matches
      const potentialMatches = new Map();
      
      // Use batch processing for better performance
      const batchSize = 5;
      
      // Query the AnimeUsers collection for each anime this user likes
      for (let i = 0; i < userFavorites.length; i += batchSize) {
        const batch = userFavorites.slice(i, i + batchSize);
        
        for (const animeId of batch) {
          try {
            // Get users who have favorited this anime
            console.log(`Checking for users who favorited anime ID: ${animeId}`);
            
            // First, try to get the single document by animeId (original approach)
            const animeUserRef = doc(db, 'animeUsers', animeId.toString());
            const animeUserDoc = await getDoc(animeUserRef);
            
            if (animeUserDoc.exists()) {
              // This is the original approach with a single document per anime
              console.log(`Found anime document with ID ${animeId}`);
              const animeData = animeUserDoc.data();
              const users = animeData.users || [];
              
              // Add all users who favorited this anime to potential matches
              for (const animeUserId of users) {
                if (animeUserId !== userId) {
                  const currentCount = potentialMatches.get(animeUserId) || 0;
                  potentialMatches.set(animeUserId, currentCount + 1);
                }
              }
            } else {
              // Try the alternative approach with separate documents
              console.log(`No single document found, trying collection query for anime ${animeId}`);
              const animeUsersRef = collection(db, 'animeUsers');
              const q = query(animeUsersRef, where('animeId', '==', animeId));
              const animeUsersSnapshot = await getDocs(q);
              
              console.log(`Alternative query found ${animeUsersSnapshot.size} users for anime ${animeId}`);
              
              animeUsersSnapshot.forEach((userDoc) => {
                const animeUserData = userDoc.data();
                const animeUserId = animeUserData.userId;
                
                // Don't match with self
                if (animeUserId && animeUserId !== userId) {
                  const currentCount = potentialMatches.get(animeUserId) || 0;
                  potentialMatches.set(animeUserId, currentCount + 1);
                }
              });
            }
          } catch (animeError) {
            console.error(`Error processing anime ${animeId}:`, animeError);
            // Continue with other anime
          }
        }
      }
      
      console.log(`Found ${potentialMatches.size} potential matches before threshold filtering`);
      
      // Get a list of all potential match user IDs that meet the threshold
      const thresholdMatchIds = [];
      for (const [matchUserId, count] of potentialMatches.entries()) {
        console.log(`Potential match: ${matchUserId}, common anime: ${count}, threshold: ${MATCH_THRESHOLD}`);
        if (matchUserId && count >= MATCH_THRESHOLD && !currentMatches.includes(matchUserId)) {
          thresholdMatchIds.push(matchUserId);
        }
      }
      
      console.log(`${thresholdMatchIds.length} users meet the match threshold of ${MATCH_THRESHOLD}`);
      
      // Check which users are available for matching (not in cooldown)
      // and get their subscription data
      const availableMatches = [];
      const matchUserDataMap = {};
      
      // Process in batches to avoid hitting Firestore limits
      for (let i = 0; i < thresholdMatchIds.length; i += 10) {
        try {
          const batchIds = thresholdMatchIds.slice(i, i + 10);
          
          for (const matchId of batchIds) {
            try {
              // Skip undefined matchIds
              if (!matchId) {
                console.warn("Skipping undefined matchId");
                continue;
              }
              
              // First check if user is available for matching (not in cooldown)
              const subscriptionRef = doc(db, 'subscriptions', matchId);
              const subscriptionDoc = await getDoc(subscriptionRef);
              
              let isAvailable = true;
              if (subscriptionDoc.exists()) {
                const subData = subscriptionDoc.data() || {};
                isAvailable = subData.availableForMatching !== false;
              }
              
              if (isAvailable) {
                // Then get the user's profile data
                const matchUserRef = doc(db, 'users', matchId);
                const matchUserDoc = await getDoc(matchUserRef);
                
                if (matchUserDoc.exists()) {
                  const matchUserData = matchUserDoc.data() || {};
                  availableMatches.push(matchId);
                  matchUserDataMap[matchId] = matchUserData;
                }
              } else {
                console.log(`User ${matchId} is not available for matching (in cooldown)`);
              }
            } catch (userError) {
              console.error(`Error checking user ${matchId}:`, userError);
              // Continue with other users
            }
          }
        } catch (batchError) {
          console.error(`Error processing batch starting at index ${i}:`, batchError);
          // Continue with next batch
        }
      }
      
      console.log(`${availableMatches.length} users are available for matching (not in cooldown)`);
      
      // Filter to users who meet the match threshold
      const newMatches = [];
      const matchesData = {...currentMatchesData}; // Start with existing matches data
      
      // Process potential matches to check gender and location compatibility
      const compatibleMatches = [];
      
      for (const matchUserId of availableMatches) {
        try {
          const matchUserData = matchUserDataMap[matchUserId];
          if (!matchUserData) {
            continue; // Skip if we don't have the data
          }
          
          const count = potentialMatches.get(matchUserId) || 0;
          
            const matchUserGender = matchUserData.gender || '';
            const matchUserMatchGender = matchUserData.matchGender || 'everyone';
            const matchUserLocation = matchUserData.location || '';
            const matchUserMatchLocation = matchUserData.matchLocation || 'worldwide';
            
            console.log(`Checking compatibility with user ${matchUserId}:`);
            console.log(`  - Their prefs: gender=${matchUserGender}, matchGender=${matchUserMatchGender}, location=${matchUserLocation}, matchLocation=${matchUserMatchLocation}`);
            
            // Check gender compatibility
            let genderCompatible = false;
            
            // Special case: If either user doesn't have gender set, consider them compatible
            if (!userGender || !matchUserGender) {
              genderCompatible = true;
              console.log(`  - Gender compatibility: true (missing gender info)`);
            }
            // Special case: If either user wants to match with 'everyone', consider them potentially compatible
            else if (userMatchGender === 'everyone' || matchUserMatchGender === 'everyone') {
              // But the other person must still be willing to match with this gender
              if (userMatchGender === 'everyone') {
                // Current user wants to match with anyone, check other user's preference
                genderCompatible = matchUserMatchGender === 'everyone' || 
                                  (matchUserMatchGender === 'male' && userGender === 'male') ||
                                  (matchUserMatchGender === 'female' && userGender === 'female');
              }
              if (matchUserMatchGender === 'everyone') {
                // Match user wants to match with anyone, check current user's preference
                genderCompatible = userMatchGender === 'everyone' || 
                                  (userMatchGender === 'male' && matchUserGender === 'male') ||
                                  (userMatchGender === 'female' && matchUserGender === 'female');
              }
              console.log(`  - Gender compatibility: ${genderCompatible} (one user wants everyone)`);
            }
            // Both want specific genders
            else {
              // Male seeks female, female seeks male
              if (userGender === 'male' && userMatchGender === 'female' && 
                  matchUserGender === 'female' && matchUserMatchGender === 'male') {
                genderCompatible = true;
              }
              // Female seeks male, male seeks female
              else if (userGender === 'female' && userMatchGender === 'male' && 
                       matchUserGender === 'male' && matchUserMatchGender === 'female') {
                genderCompatible = true;
              }
              // Male seeks male, male seeks male
              else if (userGender === 'male' && userMatchGender === 'male' && 
                       matchUserGender === 'male' && matchUserMatchGender === 'male') {
                genderCompatible = true;
              }
              // Female seeks female, female seeks female
              else if (userGender === 'female' && userMatchGender === 'female' && 
                       matchUserGender === 'female' && matchUserMatchGender === 'female') {
                genderCompatible = true;
              }
              console.log(`  - Gender compatibility: ${genderCompatible} (specific gender preferences)`);
            }
            
            // Check location compatibility
            let locationCompatible = false;
            
            // Special case: If either user doesn't have location set or either prefers worldwide, they are compatible
            if (userMatchLocation === 'worldwide' || matchUserMatchLocation === 'worldwide') {
              locationCompatible = true;
              console.log(`  - Location compatibility: true (worldwide preference)`);
            }
            // Both want local matches, check if they're in the same location
            else if (userMatchLocation === 'local' && matchUserMatchLocation === 'local') {
              // Both users must have location set and it must be the same
              if (userLocation && matchUserLocation && userLocation === matchUserLocation) {
                locationCompatible = true;
                console.log(`  - Location compatibility: true (same local area: ${userLocation})`);
              } else {
                console.log(`  - Location compatibility: false (different locations: ${userLocation} vs ${matchUserLocation})`);
              }
            } else {
              console.log(`  - Location compatibility: false (incompatible location preferences)`);
            }
            
            console.log(`  - Compatibility: gender=${genderCompatible}, location=${locationCompatible}`);
            
            // If both gender and location are compatible, add to compatible matches array
            if (genderCompatible && locationCompatible) {
              compatibleMatches.push(matchUserId);
              console.log(`  - MATCH FOUND: Adding ${matchUserId} to compatible matches`);
            } else {
              console.log(`  - NO MATCH: Incompatible preferences with ${matchUserId}`);
            }
        } catch (matchError) {
          console.error(`Error processing potential match ${matchUserId}:`, matchError);
          // Continue with other potential matches
        }
      }
      
      // Get subscription data to check match counts and thresholds
      let currentMatchCount = 0;
      let matchThreshold = 2; // Default
      
      if (shouldProcessMatches) {
        try {
          // Fetch the latest subscription data to get current match count
          const subscriptionRef = doc(db, 'subscriptions', userId);
          const subscriptionDoc = await getDoc(subscriptionRef);
          
          if (subscriptionDoc.exists()) {
            const subscriptionData = subscriptionDoc.data();
            currentMatchCount = subscriptionData.matchCount || 0;
            matchThreshold = subscriptionData.matchThreshold || 2;
          }
        } catch (subError) {
          console.error('Error fetching subscription data:', subError);
          // Use defaults if we couldn't fetch subscription data
        }
      }
      
      const remainingMatches = Math.max(0, matchThreshold - currentMatchCount);
      
      console.log(`User has ${currentMatchCount}/${matchThreshold} matches used, can add ${remainingMatches} new matches`);
      
      // Take only the first N matches based on remaining limit
      const selectedMatches = shouldProcessMatches 
        ? compatibleMatches.slice(0, remainingMatches) 
        : compatibleMatches;
      
      console.log(`Selected ${selectedMatches.length} matches out of ${compatibleMatches.length} compatible matches`);
      
      // Convert selected matches to newMatches array and matchesData object
      for (const matchUserId of selectedMatches) {
        newMatches.push(matchUserId);
        matchesData[matchUserId] = {
          userName: matchUserDataMap[matchUserId].userName || 'User',
          photoURL: matchUserDataMap[matchUserId].photoURL || '',
          matchCount: potentialMatches.get(matchUserId) || 0
        };
      }
      
      console.log(`Found ${newMatches.length} new compatible matches after filtering and threshold limiting`);
      
      // Combine current matches with new matches (preserving all existing matches)
      const allMatches = [...new Set([...currentMatches, ...newMatches])];
      
      // Update current user's matches
      await updateDoc(doc(db, 'users', userId), { matches: allMatches, matchesData });
      
      // For each new match, ensure the relationship is bidirectional
      const batch = writeBatch(db);
      let batchCount = 0;
      
      for (const matchUserId of newMatches) {
        try {
          // Skip undefined matchIds
          if (!matchUserId) {
            console.warn("Skipping undefined matchUserId in newMatches");
            continue;
          }
          
          const matchUserRef = doc(db, 'users', matchUserId);
          const matchUserDoc = await getDoc(matchUserRef);
          
          if (matchUserDoc.exists()) {
            const matchUserData = matchUserDoc.data() || {};
            const matchUserMatches = Array.isArray(matchUserData.matches) ? matchUserData.matches : [];
            const matchUserMatchesData = matchUserData.matchesData || {};
            
            // Update the match data for the other user
            // Check if this user is already a match (shouldn't be, but double-check)
            if (!matchUserMatches.includes(userId)) {
              batch.update(matchUserRef, {
                [`matchesData.${userId}`]: {
                  userName: userData.userName || 'User',
                  photoURL: userData.photoURL || '',
                  matchCount: potentialMatches.get(matchUserId) || 0
                },
                matches: arrayUnion(userId)
              });
              
              batchCount++;
              
              // Commit in batches of 100 (below Firestore limit)
              if (batchCount >= 100) {
                await batch.commit();
                batchCount = 0;
              }
              
              // Only process match if requested (from search button)
              if (shouldProcessMatches) {
                try {
                  await firestoreService.processMatch(userId, matchUserId);
                  console.log(`Processed match with user ${matchUserId}`);
                } catch (processError) {
                  console.error(`Error processing match count for ${userId}-${matchUserId}:`, processError);
                }
              }
            } else if (matchUserMatchesData[userId]) {
              // Just update the match count for existing match
              batch.update(matchUserRef, {
                [`matchesData.${userId}.matchCount`]: potentialMatches.get(matchUserId) || 0
              });
              
              batchCount++;
              
              // Commit in batches of 100 (below Firestore limit)
              if (batchCount >= 100) {
                await batch.commit();
                batchCount = 0;
              }
            }
          }
        } catch (error) {
          console.error(`Error processing match with user ${matchUserId}:`, error);
          // Continue with other matches
        }
      }
      
      // Commit any remaining updates
      if (batchCount > 0) {
        try {
        await batch.commit();
        } catch (batchError) {
          console.error('Error committing final batch updates:', batchError);
        }
      }
      
      console.log(`Updated matches for user ${userId}: found ${allMatches.length} total matches (${newMatches.length} new)`);
      return { success: true, matches: allMatches, newMatches };
    } catch (error) {
      console.error('Error updating matches:', error);
      return { success: false, error: error.message };
    }
  },
  
  // Get matches for display in UI
  getMatches: async (userId) => {
    try {
      const userRef = doc(db, 'users', userId);
      const userDoc = await getDoc(userRef);
      
      if (!userDoc.exists()) {
        return [];
      }
      
      const userData = userDoc.data();
      const matches = [];
      
      if (userData.matches && userData.matchesData) {
        for (const matchId of userData.matches) {
          const matchData = userData.matchesData[matchId];
          if (matchData) {
            // Get additional user data for display
            const matchUserDoc = await getDoc(doc(db, 'users', matchId));
            let gender = '';
            let location = '';
            
            if (matchUserDoc.exists()) {
              const matchUserData = matchUserDoc.data();
              gender = matchUserData.gender || '';
              location = matchUserData.location || '';
            }
            
            matches.push({
              userId: matchId,
              userName: matchData.userName || 'User',
              photoURL: matchData.photoURL || '',
              matches: matchData.matchCount || 0,
              gender: gender,
              location: location
            });
          }
        }
      }
      
      // Sort matches by match count in descending order
      matches.sort((a, b) => b.matches - a.matches);
      
      return matches;
    } catch (error) {
      console.error('Error getting matches:', error);
      throw error;
    }
  },

  // Create chat between users - fixed addDoc implementation
  createChat: async (userId, otherUserId) => {
    try {
      console.log(`Creating chat between ${userId} and ${otherUserId}`);
      
      // Check if chat already exists
      const chatsQuery = query(
        collection(db, 'chats'),
        where('participants', 'array-contains', userId)
      );
      
      const querySnapshot = await getDocs(chatsQuery);
      let existingChatId = null;
      
      querySnapshot.forEach(doc => {
        const chatData = doc.data();
        if (chatData.participants && chatData.participants.includes(otherUserId)) {
          existingChatId = doc.id;
        }
      });
      
      if (existingChatId) {
        console.log(`Existing chat found: ${existingChatId}`);
        return { success: true, chatId: existingChatId };
      }
      
      // Create new chat document
      const newChatRef = await addDoc(collection(db, 'chats'), {
        participants: [userId, otherUserId],
        createdAt: serverTimestamp(),
        lastMessage: 'New chat started',
        lastMessageTimestamp: serverTimestamp(),
        unreadCount: {
          [userId]: 0,
          [otherUserId]: 0
        }
      });
      
      console.log(`New chat created: ${newChatRef.id}`);
      return { success: true, chatId: newChatRef.id };
    } catch (error) {
      console.error('Error creating chat:', error);
      return { success: false, error: error.message };
    }
  },
  
  /**
   * Gets a user profile from Firestore
   * @param {string} userId - The user ID
   * @returns {Promise<Object>} Result object with user data
   */
  getUserProfile: async (userId) => {
    try {
      const userDoc = await getDoc(doc(db, 'users', userId));
      
      if (!userDoc.exists()) {
        return { success: false, error: 'User not found' };
      }
      
      return { success: true, data: userDoc.data() };
    } catch (error) {
      console.error('Error fetching user profile from Firestore:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Updates a user profile in Firestore
   * @param {string} userId - The user ID
   * @param {Object} updates - The fields to update
   * @returns {Promise<Object>} Result object
   */
  updateUserProfile: async (userId, updates) => {
    try {
      // Add updatedAt timestamp
      updates.updatedAt = Timestamp.now();
      
      // Validate profile updates
      if (updates.bio && updates.bio.length > 150) {
        return { success: false, error: 'Bio should be maximum 150 characters' };
      }
      
      // If age is provided, ensure it's a number
      if (updates.age !== undefined && updates.age !== null) {
        updates.age = Number(updates.age);
        if (isNaN(updates.age) || updates.age < 18) {
          return { success: false, error: 'Age must be at least 18' };
        }
      }
      
      // Update the document
      await updateDoc(doc(db, 'users', userId), updates);
      
      return { success: true };
    } catch (error) {
      console.error('Error updating user profile in Firestore:', error);
      return { success: false, error: error.message };
    }
  },
  
  /**
   * Uploads a photo to Cloudinary and updates profile
   * @param {string} uri - The local URI of the image
   * @param {string} userId - The user ID
   * @param {number} photoIndex - The photo index (0 for profile, 1-2 for additional)
   * @returns {Promise<Object>} Result object with URL
   */
  uploadPhoto: async (uri, userId, photoIndex) => {
    try {
      // Upload to Cloudinary
      const result = await cloudinaryService.uploadImage(uri, userId, photoIndex);
      
      if (!result.success) {
        throw new Error(result.error);
      }
      
      // Get current user data
      const userResult = await firestoreService.getUserProfile(userId);
      if (!userResult.success) {
        throw new Error('Failed to get user profile');
      }
      
      // Update photos array
      const userData = userResult.data;
      const photos = [...(userData.photos || [])];
      
      // If replacing an existing photo, mark old publicId for deletion
      const oldPublicId = photos[photoIndex] && photos[photoIndex].publicId;
      if (oldPublicId) {
        await cloudinaryService.deleteImage(oldPublicId);
      }
      
      // Update photos array
      photos[photoIndex] = {
        url: result.url,
        publicId: result.publicId,
        assetId: result.assetId
      };
      
      // Update Firestore
      const updateData = {
        photos: photos.map(photo => photo || null),
        updatedAt: Timestamp.now()
      };
      
      // If this is the profile photo (index 0), also update photoURL
      if (photoIndex === 0) {
        updateData.photoURL = result.url;
      }
      
      await updateDoc(doc(db, 'users', userId), updateData);
      
      return {
        success: true,
        url: result.url,
        publicId: result.publicId
      };
    } catch (error) {
      console.error('Error uploading photo:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Deletes a photo from Cloudinary and updates profile
   * @param {string} userId - The user ID
   * @param {number} photoIndex - The photo index to delete
   * @returns {Promise<Object>} Result object
   */
  deletePhoto: async (userId, photoIndex) => {
    try {
      // Get current user data
      const userResult = await firestoreService.getUserProfile(userId);
      if (!userResult.success) {
        throw new Error('Failed to get user profile');
      }
      
      // Update photos array
      const userData = userResult.data;
      const photos = [...(userData.photos || [])];
      
      // If no photo at this index, just return
      if (!photos[photoIndex]) {
        return { success: true };
      }
      
      // Get the photo to delete
      const photoToDelete = photos[photoIndex];
      
      // Delete from Cloudinary
      if (photoToDelete.publicId) {
        await cloudinaryService.deleteImage(photoToDelete.publicId);
      }
      
      // Remove or set to null
      if (photoIndex === 0) {
        // For profile photo, set to null rather than removing
        photos[0] = null;
      } else {
        // For additional photos, remove
        photos.splice(photoIndex, 1);
      }
      
      // Update Firestore
      const updateData = {
        photos: photos.map(photo => photo || null),
        updatedAt: Timestamp.now()
      };
      
      // If deleting profile photo, also update photoURL
      if (photoIndex === 0) {
        updateData.photoURL = null;
      }
      
      await updateDoc(doc(db, 'users', userId), updateData);
      
      return { success: true };
    } catch (error) {
      console.error('Error deleting photo:', error);
      return { success: false, error: error.message };
    }
  },

  // Fetch user profile for displaying other users
  fetchUserProfile: async (userId) => {
    try {
      const userDoc = await getDoc(doc(db, 'users', userId));
      
      if (!userDoc.exists()) {
        return { success: false, error: 'User not found' };
      }
      
      return { success: true, data: userDoc.data() };
    } catch (error) {
      console.error('Error fetching user profile:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Gets a user's subscription data
   * @param {string} userId - The user ID
   * @returns {Promise<Object>} Result object with subscription data
   */
  getUserSubscription: async (userId) => {
    try {
      const subscriptionRef = doc(db, 'subscriptions', userId);
      const subscriptionDoc = await getDoc(subscriptionRef);
      
      if (!subscriptionDoc.exists()) {
        // Create default subscription data for new users
        const defaultSubscription = {
          userId,
          isPremium: false,
          matchCount: 0,
          matchThreshold: 2, // Free users can match 2 people per week
          matchCooldownStartedAt: null,
          availableForMatching: true,
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now()
        };
        
        await setDoc(subscriptionRef, defaultSubscription);
        return { success: true, data: defaultSubscription };
      }
      
      return { success: true, data: subscriptionDoc.data() };
    } catch (error) {
      console.error('Error getting user subscription:', error);
      return { success: false, error: error.message };
    }
  },
  
  /**
   * Updates a user's subscription data with transaction support
   * @param {string} userId - The user ID
   * @param {Object} updateData - The fields to update
   * @returns {Promise<Object>} Result object
   */
  updateUserSubscription: async (userId, updateData = {}) => {
    try {
      const subscriptionRef = doc(db, 'subscriptions', userId);
      
      // Get current data first to check if we need to handle cooldown
      const subscriptionDoc = await getDoc(subscriptionRef);
      
      if (!subscriptionDoc.exists()) {
        // Create default subscription with provided updates
        const defaultSubscription = {
          userId,
          isPremium: false,
          matchCount: 0,
          matchThreshold: 2, // Free users can match 2 people per week
          matchCooldownStartedAt: null,
          availableForMatching: true,
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
          ...updateData
        };
        
        await setDoc(subscriptionRef, defaultSubscription);
        return { success: true, data: defaultSubscription };
      }
      
      // Update with provided data
      const updatedData = {
        updatedAt: Timestamp.now(),
        ...updateData
      };
      
      await updateDoc(subscriptionRef, updatedData);
      
      // Get the updated document
      const updatedDoc = await getDoc(subscriptionRef);
      return { success: true, data: updatedDoc.data() };
    } catch (error) {
      console.error('Error updating user subscription:', error);
      return { success: false, error: error.message };
    }
  },
  
  /**
   * Processes a new match between two users, updating match counts and cooldown if needed
   * Uses a transaction to ensure data consistency
   * @param {string} userId - First user in the match
   * @param {string} otherUserId - Second user in the match
   * @returns {Promise<Object>} Result with success status
   */
  processMatch: async (userId, otherUserId) => {
    try {
      console.log(`🔄 Processing match between users: ${userId} and ${otherUserId}`);
      
      // Use a transaction to update both users atomically
      const userSubRef = doc(db, 'subscriptions', userId);
      const otherUserSubRef = doc(db, 'subscriptions', otherUserId);
      
      // Fetch current subscription data for both users
      const userSubDoc = await getDoc(userSubRef);
      const otherUserSubDoc = await getDoc(otherUserSubRef);
      
      console.log(`📊 User subscription exists: ${userSubDoc.exists()}, Other user subscription exists: ${otherUserSubDoc.exists()}`);
      
      // Create default subscriptions if they don't exist
      if (!userSubDoc.exists()) {
        console.log(`🆕 Creating default subscription for user: ${userId}`);
        await setDoc(userSubRef, {
          userId,
          isPremium: false,
          matchCount: 0,
          matchThreshold: 2, // Free users can match 2 people per week
          matchCooldownStartedAt: null,
          availableForMatching: true,
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now()
        });
      }
      
      if (!otherUserSubDoc.exists()) {
        console.log(`🆕 Creating default subscription for user: ${otherUserId}`);
        await setDoc(otherUserSubRef, {
          userId: otherUserId,
          isPremium: false,
          matchCount: 0,
          matchThreshold: 2, // Free users can match 2 people per week
          matchCooldownStartedAt: null,
          availableForMatching: true,
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now()
        });
      }
      
      // Fetch again to make sure we have the data
      const userSubDocRefreshed = await getDoc(userSubRef);
      const otherUserSubDocRefreshed = await getDoc(otherUserSubRef);
      
      // Start a transaction to ensure atomic updates
      return await runTransaction(db, async (transaction) => {
        // Get the latest data within the transaction
        const latestUserSubDoc = await transaction.get(userSubRef);
        const latestOtherUserSubDoc = await transaction.get(otherUserSubRef);
        
        // Update first user
        if (latestUserSubDoc.exists()) {
          const userData = latestUserSubDoc.data() || {};
          
          // Only increment if user is available for matching
          if (userData.availableForMatching !== false) {
            const newMatchCount = (userData.matchCount || 0) + 1;
            const matchThreshold = userData.matchThreshold || 2;
            
            console.log(`👤 User ${userId}: match count ${userData.matchCount || 0} → ${newMatchCount}, threshold: ${matchThreshold}`);
            
            // Update match count
            const updateData = {
              matchCount: newMatchCount,
              updatedAt: Timestamp.now()
            };
            
            // Check if threshold is reached
            if (newMatchCount >= matchThreshold) {
              console.log(`🚫 User ${userId} reached threshold: Activating cooldown`);
              updateData.matchCooldownStartedAt = Timestamp.now();
              updateData.availableForMatching = false;
            }
            
            transaction.update(userSubRef, updateData);
          } else {
            console.log(`⚠️ User ${userId} is not available for matching, skipping increment`);
          }
        }
        
        // Update second user
        if (latestOtherUserSubDoc.exists()) {
          const otherUserData = latestOtherUserSubDoc.data() || {};
          
          // Only increment if user is available for matching
          if (otherUserData.availableForMatching !== false) {
            const newMatchCount = (otherUserData.matchCount || 0) + 1;
            const matchThreshold = otherUserData.matchThreshold || 2;
            
            console.log(`👤 User ${otherUserId}: match count ${otherUserData.matchCount || 0} → ${newMatchCount}, threshold: ${matchThreshold}`);
            
            // Update match count
            const updateData = {
              matchCount: newMatchCount,
              updatedAt: Timestamp.now()
            };
            
            // Check if threshold is reached
            if (newMatchCount >= matchThreshold) {
              console.log(`🚫 User ${otherUserId} reached threshold: Activating cooldown`);
              updateData.matchCooldownStartedAt = Timestamp.now();
              updateData.availableForMatching = false;
            }
            
            transaction.update(otherUserSubRef, updateData);
          } else {
            console.log(`⚠️ User ${otherUserId} is not available for matching, skipping increment`);
          }
        }
        
        return { success: true };
      });
      
      console.log(`✅ Successfully processed match between ${userId} and ${otherUserId}`);
    } catch (error) {
      console.error('❌ Error processing match:', error);
      return { success: false, error: error.message };
    }
  },
  
  /**
   * Checks if a user's cooldown period has ended and resets match count if needed
   * @param {string} userId - The user ID
   * @returns {Promise<Object>} Result with the user's updated matching availability
   */
  checkAndResetCooldown: async (userId) => {
    try {
      console.log(`🔍 Checking cooldown status for user: ${userId}`);
      const subscriptionRef = doc(db, 'subscriptions', userId);
      const subscriptionDoc = await getDoc(subscriptionRef);
      
      if (!subscriptionDoc.exists()) {
        console.log(`🆕 No subscription found for ${userId}, creating default`);
        // Create default subscription data
        return await firestoreService.getUserSubscription(userId);
      }
      
      const subData = subscriptionDoc.data();
      
      // If user is already available for matching, nothing to do
      if (subData.availableForMatching) {
        console.log(`✅ User ${userId} is already available for matching`);
        return {
          success: true, 
          availableForMatching: true,
          cooldownEnded: false 
        };
      }
      
      // Check if cooldown period has passed (3 minutes instead of 7 days)
      const cooldownStarted = subData.matchCooldownStartedAt?.toDate();
      
      if (cooldownStarted) {
        const now = new Date();
        const threeMinutesMs = 3 * 60 * 1000; // 3 minutes in milliseconds
        const elapsedMs = now.getTime() - cooldownStarted.getTime();
        const remainingMs = Math.max(0, threeMinutesMs - elapsedMs);
        
        console.log(`⏱️ Cooldown info for ${userId}:`);
        console.log(`   Started: ${cooldownStarted.toISOString()}`);
        console.log(`   Elapsed: ${Math.floor(elapsedMs/1000)}s / ${Math.floor(threeMinutesMs/1000)}s`);
        console.log(`   Remaining: ${Math.floor(remainingMs/1000)}s`);
        
        const cooldownEnded = elapsedMs >= threeMinutesMs;
        
        if (cooldownEnded) {
          console.log(`🔄 Cooldown ended for user ${userId}, resetting match count`);
          // Reset match count and make available for matching
          await updateDoc(subscriptionRef, {
            matchCount: 0,
            matchCooldownStartedAt: null,
            availableForMatching: true,
            updatedAt: Timestamp.now()
          });
          
          return { 
            success: true, 
            availableForMatching: true,
            cooldownEnded: true 
          };
        } else {
          console.log(`⏳ Cooldown still active for user ${userId}: ${Math.floor(remainingMs/1000)}s remaining`);
        }
      } else {
        console.log(`⚠️ User ${userId} is unavailable but has no cooldown timestamp`);
      }
      
      return { 
        success: true, 
        availableForMatching: false,
        cooldownEnded: false 
      };
    } catch (error) {
      console.error('❌ Error checking cooldown:', error);
      return { success: false, error: error.message };
    }
  },

  // Get user dramas
  getUserDramas: async (userId) => {
    try {
      const userRef = doc(db, 'users', userId);
      const userDoc = await getDoc(userRef);
      
      if (!userDoc.exists()) {
        return [];
      }
      
      const userData = userDoc.data();
      
      // Convert the dramasData object to array for UI display
      if (userData.dramasData && typeof userData.dramasData === 'object') {
        const dramasArray = Object.values(userData.dramasData);
        return dramasArray;
      } else {
        // Return empty array if no dramas found
        return [];
      }
    } catch (error) {
      console.error('Error getting user dramas:', error);
      throw error;
    }
  },

  // Add a new favorite drama to user profile and update drama-user mapping
  addDrama: async (userId, drama) => {
    try {
      console.log(`Adding drama ${drama.id} to favorites for user ${userId}`);
      
      // Get user document reference
      const userRef = doc(db, 'users', userId);
      const userDoc = await getDoc(userRef);
      
      // Create batch to update multiple collections atomically
      const batch = writeBatch(db);
      
      // Extract only the needed fields from the drama object
      const dramaData = {
        id: drama.id,
        name: drama.name,
        original_name: drama.original_name || drama.name,
        poster_path: drama.poster_path,
        backdrop_path: drama.backdrop_path,
        first_air_date: drama.first_air_date || null,
        vote_average: drama.vote_average || 0,
        origin_country: drama.origin_country || [],
        overview: drama.overview || '',
        clientKey: drama.clientKey || `drama_${drama.id}_${Math.random().toString(36).substring(2, 11)}`,
        createdAt: serverTimestamp()
      };
      
      // Check if drama is already in favorites
      if (userDoc.exists()) {
        const userData = userDoc.data();
        if (userData.dramasData && userData.dramasData[drama.id]) {
          console.log(`Drama ${drama.id} already in favorites`);
          return { success: true, message: 'Already in favorites' };
        }
      }
      
      // Update dramaUsers collection to track which users like this drama
      const dramaUserRef = doc(db, 'dramaUsers', drama.id.toString());
      const dramaUserDoc = await getDoc(dramaUserRef);
      
      if (dramaUserDoc.exists()) {
        // Append this user to the existing users array
        const dramaUserData = dramaUserDoc.data();
        const users = dramaUserData.users || [];
        
        // Check if user already exists in the array
        if (!users.includes(userId)) {
          batch.update(dramaUserRef, {
            users: arrayUnion(userId),
            updatedAt: serverTimestamp()
          });
        }
      } else {
        // Create a new drama-users mapping
        batch.set(dramaUserRef, {
          dramaId: drama.id,
          dramaName: drama.name,
          users: [userId],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }
      
      // Update the user's dramas and dramasData fields
      batch.update(userRef, {
        [`dramasData.${drama.id}`]: dramaData,
        dramas: arrayUnion(drama.id),
        updatedAt: serverTimestamp()
      });
      
      // Commit all changes in a single batch
      await batch.commit();
      
      console.log(`Successfully added drama ${drama.id} to favorites`);
      return { success: true };
    } catch (error) {
      console.error('Error adding drama to favorites:', error);
      return { success: false, error: error.message };
    }
  },

  // Remove a drama from user's favorites
  removeDramaFromFavorites: async (userId, dramaId) => {
    try {
      // Get user document reference
      const userRef = doc(db, 'users', userId);
      const userDoc = await getDoc(userRef);
      
      // Create batch to update multiple collections atomically
      const batch = writeBatch(db);
      
      if (userDoc.exists()) {
        const userData = userDoc.data();
        
        // Check if drama exists in favorites
        if (!userData.dramas || !userData.dramas.includes(dramaId)) {
          console.log(`Drama ${dramaId} not in favorites`);
          return { success: true, message: 'Drama not in favorites' };
        }
        
        // Prepare update to remove from user's dramas array
        batch.update(userRef, {
          dramas: arrayRemove(dramaId),
          [`dramasData.${dramaId}`]: deleteField(),
          updatedAt: serverTimestamp()
        });
        
        // Update the dramaUsers collection
        const dramaUserRef = doc(db, 'dramaUsers', dramaId.toString());
        const dramaUserDoc = await getDoc(dramaUserRef);
        
        if (dramaUserDoc.exists()) {
          const dramaUserData = dramaUserDoc.data();
          const users = dramaUserData.users || [];
          
          // Remove this user from the users array
          if (users.includes(userId)) {
            if (users.length === 1) {
              // If this is the last user, delete the entire document
              batch.delete(dramaUserRef);
            } else {
              // Otherwise just remove this user
              batch.update(dramaUserRef, {
                users: arrayRemove(userId),
                updatedAt: serverTimestamp()
              });
            }
          }
        }
        
        // Commit all changes in batch
        await batch.commit();
        
        console.log(`Successfully removed drama ${dramaId} from favorites`);
        return { success: true };
      }
      
      return { success: false, error: 'User document not found' };
    } catch (error) {
      console.error('Error removing drama from favorites:', error);
      return { success: false, error: error.message };
    }
  }
};

export default firestoreService;