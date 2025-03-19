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
  Timestamp
} from 'firebase/firestore';
import { db } from '../config/firebaseConfig';
import cloudinaryService from './cloudinaryService';

// Number of common favorites needed to consider users as matching
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

  // Add an anime to user's favorites with bidirectional indexing
  addFavorite: async (userId, animeData) => {
    try {
      console.log(`Adding anime ${animeData.mal_id} to favorites for user ${userId}`);
      
      // First check if anime is already in favorites
      const userRef = doc(db, 'users', userId);
      const userDoc = await getDoc(userRef);
      
      if (!userDoc.exists()) {
        console.error('User document not found');
        return { success: false, error: 'User document not found' };
      }
      
      const userData = userDoc.data();
      const animeId = animeData.mal_id.toString();
      
      // Check if already in favorites
      if (userData.favorites && userData.favorites.includes(animeId)) {
        console.log('Anime already in favorites');
        return { success: true, message: 'Already in favorites' };
      }
      
      // Start a batch write
      const batch = writeBatch(db);
      
      // 1. Add to user's favorites array, favoritesData object, and favoriteAnimeIds for matching
      batch.update(userRef, {
        favorites: arrayUnion(animeId),
        favoriteAnimeIds: arrayUnion(animeId),
        [`favoritesData.${animeId}`]: {
          title: animeData.title,
          image: animeData.images?.jpg?.image_url || '',
          score: animeData.score || 'N/A',
          type: animeData.type || 'N/A',
          episodes: animeData.episodes || 'N/A',
          addedAt: Timestamp.now()
        }
      });
      
      // 2. Add user to AnimeUsers collection (reverse index)
      const animeUserRef = doc(db, 'animeUsers', animeId);
      const animeUserDoc = await getDoc(animeUserRef);
      
      if (animeUserDoc.exists()) {
        // Add user to existing anime fans array
        batch.update(animeUserRef, {
          users: arrayUnion(userId),
          updatedAt: Timestamp.now()
        });
      } else {
        // Create new document for this anime with user as first fan
        batch.set(animeUserRef, {
          animeId: animeId,
          title: animeData.title,
          image: animeData.images?.jpg?.image_url || '',
          users: [userId],
          updatedAt: Timestamp.now()
        });
      }
      
      // Commit the batch
      await batch.commit();
      console.log('Successfully added anime to favorites and updated animeUsers');
      
      // Update matches after adding a new favorite - but don't throw if it fails
      try {
        await firestoreService.updateBidirectionalMatches(userId);
      } catch (error) {
        console.error('Error updating matches:', error);
        // Continue even if match update fails
      }
      
      return { success: true, message: 'Added to favorites successfully' };
    } catch (error) {
      console.error('Error adding favorite:', error);
      return { success: false, error: error.message || 'Failed to add favorite' };
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
  
  // Efficient bidirectional matching using the AnimeUsers collection
  updateBidirectionalMatches: async (userId) => {
    try {
      console.log(`Starting to update matches for user ${userId}`);
      
      // Get current user's data
      const userRef = doc(db, 'users', userId);
      const userDoc = await getDoc(userRef);
      
      if (!userDoc.exists()) {
        return { success: false, error: 'User not found' };
      }
      
      const userData = userDoc.data();
      const userFavorites = userData.favorites || [];
      
      // Get current matches to preserve them
      const currentMatches = userData.matches || [];
      const currentMatchesData = userData.matchesData || {};
      
      // If user has no favorites and no existing matches, nothing to do
      if (userFavorites.length === 0 && currentMatches.length === 0) {
        return { success: true, matches: [] };
      }
      
      // Get user's gender preferences and location preferences
      const userGender = userData.gender || '';
      const userMatchGender = userData.matchGender || 'everyone';
      const userLocation = userData.location || '';
      const userMatchLocation = userData.matchLocation || 'worldwide';
      
      // Using a Map to count matches
      const potentialMatches = new Map();
      
      // Use batch processing for better performance
      const batchSize = 5;
      
      // Query the AnimeUsers collection for each anime this user likes
      for (let i = 0; i < userFavorites.length; i += batchSize) {
        const batch = userFavorites.slice(i, i + batchSize);
        
        for (const animeId of batch) {
          const animeUserRef = doc(db, 'animeUsers', animeId);
          const animeUserDoc = await getDoc(animeUserRef);
          
          if (animeUserDoc.exists()) {
            const animeData = animeUserDoc.data();
            const otherUsers = animeData.users || [];
            
            // Count each user who also likes this anime
            for (const otherUserId of otherUsers) {
              if (otherUserId !== userId) {
                potentialMatches.set(otherUserId, (potentialMatches.get(otherUserId) || 0) + 1);
              }
            }
          }
        }
      }
      
      // Filter to users who meet the match threshold
      const newMatches = [];
      const matchesData = {...currentMatchesData}; // Start with existing matches data
      
      // Process potential matches to check gender and location compatibility
      for (const [matchUserId, count] of potentialMatches.entries()) {
        // Skip if already in current matches (permanent matches)
        if (currentMatches.includes(matchUserId)) {
          // Just update the match count if needed
          if (matchesData[matchUserId]) {
            matchesData[matchUserId].matchCount = count;
          }
          continue;
        }
        
        if (count >= MATCH_THRESHOLD) {
          // Get this user's profile details
          const matchUserDoc = await getDoc(doc(db, 'users', matchUserId));
          
          if (matchUserDoc.exists()) {
            const matchUserData = matchUserDoc.data();
            const matchUserGender = matchUserData.gender || '';
            const matchUserMatchGender = matchUserData.matchGender || 'everyone';
            const matchUserLocation = matchUserData.location || '';
            const matchUserMatchLocation = matchUserData.matchLocation || 'worldwide';
            
            // Check gender compatibility
            let genderCompatible = false;
            
            // 1. If current user is male
            if (userGender === 'male') {
              // User wants to match with females
              if (userMatchGender === 'female') {
                // Only match with females who want to match with males or everyone
                genderCompatible = matchUserGender === 'female' && 
                  (matchUserMatchGender === 'male' || matchUserMatchGender === 'everyone');
              } 
              // User wants to match with males
              else if (userMatchGender === 'male') {
                // Only match with males who want to match with males or everyone
                genderCompatible = matchUserGender === 'male' && 
                  (matchUserMatchGender === 'male' || matchUserMatchGender === 'everyone');
              }
              // User wants to match with everyone
              else if (userMatchGender === 'everyone') {
                // Match with females who want to match with males or everyone
                // OR match with males who want to match with males or everyone
                genderCompatible = (matchUserGender === 'female' && 
                  (matchUserMatchGender === 'male' || matchUserMatchGender === 'everyone')) ||
                  (matchUserGender === 'male' && 
                  (matchUserMatchGender === 'male' || matchUserMatchGender === 'everyone'));
              }
            }
            // 2. If current user is female
            else if (userGender === 'female') {
              // User wants to match with males
              if (userMatchGender === 'male') {
                // Only match with males who want to match with females or everyone
                genderCompatible = matchUserGender === 'male' && 
                  (matchUserMatchGender === 'female' || matchUserMatchGender === 'everyone');
              } 
              // User wants to match with females
              else if (userMatchGender === 'female') {
                // Only match with females who want to match with females or everyone
                genderCompatible = matchUserGender === 'female' && 
                  (matchUserMatchGender === 'female' || matchUserMatchGender === 'everyone');
              }
              // User wants to match with everyone
              else if (userMatchGender === 'everyone') {
                // Match with males who want to match with females or everyone
                // OR match with females who want to match with females or everyone
                genderCompatible = (matchUserGender === 'male' && 
                  (matchUserMatchGender === 'female' || matchUserMatchGender === 'everyone')) ||
                  (matchUserGender === 'female' && 
                  (matchUserMatchGender === 'female' || matchUserMatchGender === 'everyone'));
              }
            }
            
            // Check location compatibility
            let locationCompatible = false;
            
            // Location compatibility needs to be checked from BOTH perspectives:
            // 1. From current user's perspective
            let userLocationPermits = false;
            if (userMatchLocation === 'local') {
              // User wants local matches only - must be in same country
              userLocationPermits = userLocation === matchUserLocation && userLocation !== '';
            } else if (userMatchLocation === 'worldwide') {
              // User is fine with worldwide matches
              userLocationPermits = true;
            }
            
            // 2. From match user's perspective
            let matchLocationPermits = false;
            if (matchUserMatchLocation === 'local') {
              // Match wants local matches only - must be in same country
              matchLocationPermits = matchUserLocation === userLocation && matchUserLocation !== '';
            } else if (matchUserMatchLocation === 'worldwide') {
              // Match is fine with worldwide matches
              matchLocationPermits = true;
            }
            
            // Both users must permit this match based on their location preferences
            locationCompatible = userLocationPermits && matchLocationPermits;
            
            // If both gender and location are compatible, add to matches
            if (genderCompatible && locationCompatible) {
              newMatches.push(matchUserId);
              matchesData[matchUserId] = {
                userName: matchUserData.userName || 'User',
                photoURL: matchUserData.photoURL || '',
                matchCount: count
              };
            }
          }
        }
      }
      
      // Combine current matches with new matches (preserving all existing matches)
      const allMatches = [...new Set([...currentMatches, ...newMatches])];
      
      // Update current user's matches
      await updateDoc(userRef, { matches: allMatches, matchesData });
      
      // For each new match, ensure the relationship is bidirectional
      const batch = writeBatch(db);
      let batchCount = 0;
      
      for (const matchUserId of newMatches) {
        const matchUserRef = doc(db, 'users', matchUserId);
        const matchUserDoc = await getDoc(matchUserRef);
        
        if (matchUserDoc.exists()) {
          const matchUserData = matchUserDoc.data();
          const matchUserMatches = matchUserData.matches || [];
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
            
            // Commit in batches of 500 (Firestore limit)
            if (batchCount >= 500) {
              await batch.commit();
              batchCount = 0;
            }
          } else if (matchUserMatchesData[userId]) {
            // Just update the match count for existing match
            batch.update(matchUserRef, {
              [`matchesData.${userId}.matchCount`]: potentialMatches.get(matchUserId) || 0
            });
            
            batchCount++;
            
            // Commit in batches of 500 (Firestore limit)
            if (batchCount >= 500) {
              await batch.commit();
              batchCount = 0;
            }
          }
        }
      }
      
      // Commit any remaining updates
      if (batchCount > 0) {
        await batch.commit();
      }
      
      console.log(`Updated matches for user ${userId}: found ${allMatches.length} total matches (${newMatches.length} new)`);
      return { success: true, matches: allMatches };
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

  // Get user subscription data
  getUserSubscription: async (userId) => {
    try {
      console.log('==========================================');
      console.log('FETCHING SUBSCRIPTION DATA FOR USER:', userId);
      const userSubscriptionRef = doc(db, 'userSubscriptions', userId);
      const docSnap = await getDoc(userSubscriptionRef);
      
      if (docSnap.exists()) {
        const data = docSnap.data();
        console.log('DATA RECEIVED FROM FIRESTORE:');
        console.log(JSON.stringify(data, null, 2));
        console.log('COOLDOWN STATUS: ', data.counterStartedAt ? 'ACTIVE' : 'INACTIVE');
        if (data.counterStartedAt) {
          const now = new Date();
          const cooldownStarted = new Date(data.counterStartedAt);
          const secondsSinceStart = Math.floor((now - cooldownStarted) / 1000);
          console.log('COOLDOWN TIME REMAINING:', 120 - secondsSinceStart, 'seconds');
        }
        console.log('==========================================');
        return {
          success: true,
          data: data
        };
      } else {
        console.log('NO DATA FOUND IN FIRESTORE FOR USER:', userId);
        console.log('==========================================');
        return {
          success: true,
          data: null
        };
      }
    } catch (error) {
      console.error('Error getting user subscription:', error);
      return {
        success: false,
        error: error.message
      };
    }
  },

  // Update user subscription data - MAKE SURE TO NOT OVERWRITE COOLDOWN DATA
  updateUserSubscription: async (userId, subscriptionData) => {
    try {
      console.log('==========================================');
      console.log('UPDATING SUBSCRIPTION DATA FOR USER:', userId);
      console.log('DATA BEING SENT TO FIRESTORE:');
      console.log(JSON.stringify(subscriptionData, null, 2));
      
      // CRITICAL FIX: Check if there's already data with an active cooldown before overwriting
      const existingData = await getDoc(doc(db, 'userSubscriptions', userId));
      let dataToSave = subscriptionData;
      
      // If we have existing data with an active cooldown
      if (existingData.exists() && existingData.data().counterStartedAt) {
        const existing = existingData.data();
        const now = new Date();
        const cooldownStarted = new Date(existing.counterStartedAt);
        const secondsSinceStart = Math.floor((now - cooldownStarted) / 1000);
        
        console.log('EXISTING DATA HAS COOLDOWN:', existing.counterStartedAt);
        console.log('SECONDS SINCE COOLDOWN STARTED:', secondsSinceStart);
        
        // If cooldown hasn't expired yet (2 minutes = 120 seconds), preserve cooldown data
        if (secondsSinceStart < 120) {
          console.log('PRESERVING COOLDOWN - ACTIVE COOLDOWN FOUND');
          console.log('COOLDOWN REMAINING:', 120 - secondsSinceStart, 'seconds');
          
          // Important: ALWAYS keep the changesThisWeek at max when cooldown is active
          dataToSave = {
            ...subscriptionData,
            counterStartedAt: existing.counterStartedAt,
            changesThisWeek: 3  // Force to maximum (should match MAX_CHANGES_PER_WEEK)
          };
          
          console.log('MODIFIED DATA BEING SAVED TO FIRESTORE:');
          console.log(JSON.stringify(dataToSave, null, 2));
        } else {
          console.log('COOLDOWN EXPIRED - NOT PRESERVING');
        }
      } else {
        console.log('NO ACTIVE COOLDOWN FOUND IN EXISTING DATA');
      }
      
      const userSubscriptionRef = doc(db, 'userSubscriptions', userId);
      await setDoc(userSubscriptionRef, dataToSave, { merge: true });
      
      console.log('SUCCESSFULLY UPDATED DATA IN FIRESTORE');
      console.log('==========================================');
      return {
        success: true
      };
    } catch (error) {
      console.error('Error updating user subscription:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
};

export default firestoreService;