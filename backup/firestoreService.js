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
      
      // Get a list of all potential match user IDs that meet the threshold
      const thresholdMatchIds = [];
      for (const [matchUserId, count] of potentialMatches.entries()) {
        if (count >= MATCH_THRESHOLD && !currentMatches.includes(matchUserId)) {
          thresholdMatchIds.push(matchUserId);
        }
      }
      
      // Check which users are available for matching (not in cooldown)
      // and get their subscription data
      const availableMatches = [];
      const matchUserData = {};
      
      // Process in batches to avoid hitting Firestore limits
      for (let i = 0; i < thresholdMatchIds.length; i += 10) {
        const batch = thresholdMatchIds.slice(i, i + 10);
        const batchPromises = batch.map(async (matchId) => {
          try {
            // Check if user is available for matching (not in cooldown)
            // Use a direct reference to avoid circular dependency issues
            const subscriptionRef = doc(db, 'subscriptions', matchId);
            const subscriptionDoc = await getDoc(subscriptionRef);
            
            let isAvailable = true;
            if (subscriptionDoc.exists()) {
              const subData = subscriptionDoc.data();
              isAvailable = subData.availableForMatching !== false;
            }
            
            if (isAvailable) {
              // Get this user's profile details
              const matchUserDoc = await getDoc(doc(db, 'users', matchId));
              
              if (matchUserDoc.exists()) {
                return {
                  id: matchId,
                  available: true,
                  userData: matchUserDoc.data()
                };
              }
            }
            
            return {
              id: matchId,
              available: false
            };
          } catch (error) {
            console.error(`Error checking availability for user ${matchId}:`, error);
            return {
              id: matchId,
              available: false
            };
          }
        });
        
        const results = await Promise.all(batchPromises);
        
        for (const result of results) {
          if (result.available && result.userData) {
            availableMatches.push(result.id);
            matchUserData[result.id] = result.userData;
          }
        }
      }
      
      // Filter to users who meet the match threshold
      const newMatches = [];
      const matchesData = {...currentMatchesData}; // Start with existing matches data
      
      // Process potential matches to check gender and location compatibility
      for (const matchUserId of availableMatches) {
        const matchData = matchUserData[matchUserId];
        
        // Ensure we have valid user data before proceeding
        if (!matchData) {
          console.log(`Missing user data for ${matchUserId}, skipping`);
          continue;
        }
        
        const count = potentialMatches.get(matchUserId) || 0;
        
        const matchUserGender = matchData.gender || '';
        const matchUserMatchGender = matchData.matchGender || 'everyone';
        const matchUserLocation = matchData.location || '';
        const matchUserMatchLocation = matchData.matchLocation || 'worldwide';
        
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
            userName: matchData.userName || 'User',
            photoURL: matchData.photoURL || '',
            matchCount: count
          };
        }
      }
      
      // Combine current matches with new matches (preserving all existing matches)
      const allMatches = [...new Set([...currentMatches, ...newMatches])];
      
      // Update current user's matches
      await updateDoc(userRef, { matches: allMatches, matchesData });
      
      // For each new match, ensure the relationship is bidirectional and increment match count
      const batch = writeBatch(db);
      let batchCount = 0;
      
      for (const matchUserId of newMatches) {
        try {
          const matchUserRef = doc(db, 'users', matchUserId);
          const matchUserDoc = await getDoc(matchUserRef);
          
          if (matchUserDoc.exists()) {
            const matchUserData = matchUserDoc.data() || {};
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
              
              // Process the match to increment match counts - directly use the db reference
              // to avoid circular dependency
              const userSubRef = doc(db, 'subscriptions', userId);
              const otherUserSubRef = doc(db, 'subscriptions', matchUserId);
              
              const userSubDoc = await getDoc(userSubRef);
              const otherUserSubDoc = await getDoc(otherUserSubRef);
              
              // Create default subscriptions if they don't exist
              if (!userSubDoc.exists()) {
                await setDoc(userSubRef, {
                  userId,
                  isPremium: false,
                  matchCount: 1,
                  matchThreshold: 2,
                  matchCooldownStartedAt: null,
                  availableForMatching: true,
                  createdAt: Timestamp.now(),
                  updatedAt: Timestamp.now()
                });
              } else {
                // Update match count for current user
                const userData = userSubDoc.data();
                if (userData.availableForMatching) {
                  const newMatchCount = (userData.matchCount || 0) + 1;
                  const matchThreshold = userData.matchThreshold || 2;
                  
                  const updateData = {
                    matchCount: newMatchCount,
                    updatedAt: Timestamp.now()
                  };
                  
                  if (newMatchCount >= matchThreshold) {
                    updateData.matchCooldownStartedAt = Timestamp.now();
                    updateData.availableForMatching = false;
                  }
                  
                  await updateDoc(userSubRef, updateData);
                }
              }
              
              // Do the same for other user
              if (!otherUserSubDoc.exists()) {
                await setDoc(otherUserSubRef, {
                  userId: matchUserId,
                  isPremium: false,
                  matchCount: 1,
                  matchThreshold: 2,
                  matchCooldownStartedAt: null,
                  availableForMatching: true,
                  createdAt: Timestamp.now(),
                  updatedAt: Timestamp.now()
                });
              } else {
                // Update match count for other user
                const otherUserData = otherUserSubDoc.data();
                if (otherUserData.availableForMatching) {
                  const newMatchCount = (otherUserData.matchCount || 0) + 1;
                  const matchThreshold = otherUserData.matchThreshold || 2;
                  
                  const updateData = {
                    matchCount: newMatchCount,
                    updatedAt: Timestamp.now()
                  };
                  
                  if (newMatchCount >= matchThreshold) {
                    updateData.matchCooldownStartedAt = Timestamp.now();
                    updateData.availableForMatching = false;
                  }
                  
                  await updateDoc(otherUserSubRef, updateData);
                }
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
        } catch (error) {
          console.error(`Error processing match with user ${matchUserId}:`, error);
          // Continue with other matches
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
      // Use a transaction to update both users atomically
      const userSubRef = doc(db, 'subscriptions', userId);
      const otherUserSubRef = doc(db, 'subscriptions', otherUserId);
      
      const userSubDoc = await getDoc(userSubRef);
      const otherUserSubDoc = await getDoc(otherUserSubRef);
      
      // Create default subscriptions if they don't exist
      if (!userSubDoc.exists()) {
        await firestoreService.getUserSubscription(userId);
      }
      
      if (!otherUserSubDoc.exists()) {
        await firestoreService.getUserSubscription(otherUserId);
      }
      
      // Start a batch
      const batch = writeBatch(db);
      
      // Update first user
      if (userSubDoc.exists()) {
        const userData = userSubDoc.data();
        
        // Only increment if user is available for matching
        if (userData.availableForMatching) {
          const newMatchCount = (userData.matchCount || 0) + 1;
          const matchThreshold = userData.matchThreshold || 2;
          
          // Update match count
          const updateData = {
            matchCount: newMatchCount,
            updatedAt: Timestamp.now()
          };
          
          // Check if threshold is reached
          if (newMatchCount >= matchThreshold) {
            updateData.matchCooldownStartedAt = Timestamp.now();
            updateData.availableForMatching = false;
          }
          
          batch.update(userSubRef, updateData);
        }
      }
      
      // Update second user
      if (otherUserSubDoc.exists()) {
        const otherUserData = otherUserSubDoc.data();
        
        // Only increment if user is available for matching
        if (otherUserData.availableForMatching) {
          const newMatchCount = (otherUserData.matchCount || 0) + 1;
          const matchThreshold = otherUserData.matchThreshold || 2;
          
          // Update match count
          const updateData = {
            matchCount: newMatchCount,
            updatedAt: Timestamp.now()
          };
          
          // Check if threshold is reached
          if (newMatchCount >= matchThreshold) {
            updateData.matchCooldownStartedAt = Timestamp.now();
            updateData.availableForMatching = false;
          }
          
          batch.update(otherUserSubRef, updateData);
        }
      }
      
      // Commit all changes
      await batch.commit();
      
      return { success: true };
    } catch (error) {
      console.error('Error processing match:', error);
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
      const subscriptionRef = doc(db, 'subscriptions', userId);
      const subscriptionDoc = await getDoc(subscriptionRef);
      
      if (!subscriptionDoc.exists()) {
        // Create default subscription data
        return await firestoreService.getUserSubscription(userId);
      }
      
      const subData = subscriptionDoc.data();
      
      // If user is already available for matching, nothing to do
      if (subData.availableForMatching) {
        return { 
          success: true, 
          availableForMatching: true,
          cooldownEnded: false 
        };
      }
      
      // Check if cooldown period has passed (1 week from start)
      const cooldownStarted = subData.matchCooldownStartedAt?.toDate();
      
      if (cooldownStarted) {
        const now = new Date();
        const oneWeekMs = 7 * 24 * 60 * 60 * 1000;
        const cooldownEnded = now.getTime() - cooldownStarted.getTime() >= oneWeekMs;
        
        if (cooldownEnded) {
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
        }
      }
      
      return { 
        success: true, 
        availableForMatching: false,
        cooldownEnded: false 
      };
    } catch (error) {
      console.error('Error checking cooldown:', error);
      return { success: false, error: error.message };
    }
  }
};

export default firestoreService;