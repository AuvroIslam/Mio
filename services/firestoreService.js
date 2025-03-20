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
      
      // Update user document with new favorite
      const userRef = doc(db, 'users', userId);
      const userDoc = await getDoc(userRef);
      
      if (!userDoc.exists()) {
        return { success: false, error: 'User profile not found' };
      }
      
      const userData = userDoc.data();
      const currentFavorites = userData.favorites || [];
      
      // Check if anime is already a favorite
      if (currentFavorites.includes(anime.mal_id)) {
        return { success: true, exists: true };
      }
      
      // First, update the animeUsers collection to track which users like this anime
      // This is used for efficient matching
      const animeUserRef = doc(db, 'animeUsers', anime.mal_id.toString());
      const animeUserDoc = await getDoc(animeUserRef);
      
      try {
        if (animeUserDoc.exists()) {
          // Add this user to the list of users who like this anime
          const animeData = animeUserDoc.data();
          const users = animeData.users || [];
          
          if (!users.includes(userId)) {
            await updateDoc(animeUserRef, {
              users: arrayUnion(userId)
            });
          }
        } else {
          // Create a new document for this anime
          await setDoc(animeUserRef, {
            animeId: anime.mal_id,
            title: anime.title,
            users: [userId]
          });
        }
      } catch (animeError) {
        console.error('Error updating animeUsers collection:', animeError);
        // Fall back to the simpler but less efficient approach
        try {
          // Instead of updating the users array, just create a document in animeUsers
          // indicating this user favorited this anime (for querying)
          await setDoc(doc(db, 'animeUsers', `${anime.mal_id}_${userId}`), {
            animeId: anime.mal_id,
            userId: userId,
            createdAt: serverTimestamp()
          });
          
          // Debug logging - check if we saved the record
          const testDoc = await getDoc(doc(db, 'animeUsers', `${anime.mal_id}_${userId}`));
          console.log(`Debug: Created animeUsers record? ${testDoc.exists()}`);
        } catch (fallbackError) {
          console.error('Error with fallback animeUsers approach:', fallbackError);
        }
      }
      
      // Now update the user's favorites
      const updatedFavorites = [...currentFavorites, anime.mal_id];
      
      // Store anime details in the user's favorites data
      const favoriteData = userData.favoritesData || {};
      favoriteData[anime.mal_id] = {
        title: anime.title,
        image: anime.images?.jpg?.image_url || '',
        type: anime.type || 'Unknown',
        episodes: anime.episodes || 'Unknown',
        score: anime.score || 'N/A',
        added: Timestamp.now()
      };
      
      await updateDoc(userRef, {
        favorites: updatedFavorites,
        favoritesData: favoriteData
      });
      
      return { success: true };
    } catch (error) {
      console.error('Error adding favorite:', error);
      return { success: false, error: error.message };
    }
  },

  // Remove anime from favorites with bidirectional approach
  removeAnimeFromFavorites: async (userId, animeId) => {
    try {
      console.log(`Removing anime ${animeId} from favorites for user ${userId}`);
      
      // Convert animeId to string if it's not already
      animeId = animeId.toString();
      
      // Get user document
      const userRef = doc(db, 'users', userId);
      const userDoc = await getDoc(userRef);
      
      if (!userDoc.exists()) {
        console.error('User document not found');
        throw new Error('User document not found');
      }
      
      // Start a batch write
      const batch = writeBatch(db);
      
      // Remove from all favorite lists and data
      batch.update(userRef, {
        favorites: arrayRemove(animeId),
        favoriteAnimeIds: arrayRemove(animeId),
        [`favoritesData.${animeId}`]: deleteField()
      });
      
      // Update the AnimeUsers collection 
        const animeUserRef = doc(db, 'animeUsers', animeId);
        const animeUserDoc = await getDoc(animeUserRef);
        
        if (animeUserDoc.exists()) {
          const animeData = animeUserDoc.data();
          
          // Filter out this user
          const updatedUsers = animeData.users.filter(id => id !== userId);
          
          if (updatedUsers.length > 0) {
            // Update the document with the new users array
          batch.update(animeUserRef, {
              users: updatedUsers,
            updatedAt: Timestamp.now()
            });
          } else {
          // If no users left, delete the document
          batch.delete(animeUserRef);
        }
      }
      
      // Commit all changes
      await batch.commit();
      
      return true;
    } catch (error) {
      console.error('Error removing favorite:', error);
      throw error;
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
  }
};

export default firestoreService;