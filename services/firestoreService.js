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
  increment
} from 'firebase/firestore';
import { db } from '../config/firebaseConfig';

// Number of common favorites needed to consider users as matching
const MATCH_THRESHOLD = 3;

const firestoreService = {
  // Create a new user profile in Firestore
  createUserProfile: async (userId, displayName, email) => {
    try {
      await setDoc(doc(db, 'users', userId), {
        userId: userId,
        userName: displayName,
        email: email,
        createdAt: new Date(),
        favorites: [],
        favoritesData: {},
        matches: [],
        matchesData: {}
      });
      
      return true;
    } catch (error) {
      console.error('Error creating user profile:', error);
      throw error;
    }
  },

  // Add an anime to user's favorites with improved structure
  addFavorite: async (userId, animeData) => {
    try {
      console.log(`Starting to add anime ${animeData.mal_id} to favorites for user ${userId}`);
      
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
      
      // 1. Add to user's favorites array and favoritesData object
      batch.update(userRef, {
        favorites: arrayUnion(animeId),
        [`favoritesData.${animeId}`]: {
          title: animeData.title,
          image: animeData.images?.jpg?.image_url || '',
          score: animeData.score || 'N/A',
          type: animeData.type || 'N/A',
          episodes: animeData.episodes || 'N/A',
          addedAt: new Date()
        }
      });
      
      // 2. Add user to AnimeUsers collection (reverse index)
      const animeUserRef = doc(db, 'animeUsers', animeId);
      const animeUserDoc = await getDoc(animeUserRef);
      
      if (animeUserDoc.exists()) {
        // Add user to existing anime fans array
        batch.update(animeUserRef, {
          users: arrayUnion(userId),
          updatedAt: new Date()
        });
      } else {
        // Create new document for this anime with user as first fan
        batch.set(animeUserRef, {
          animeId: animeId,
          title: animeData.title,
          image: animeData.images?.jpg?.image_url || '',
          users: [userId],
          updatedAt: new Date()
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

  // Remove anime from favorites with improved structure
  removeAnimeFromFavorites: async (userId, animeId) => {
    try {
      console.log(`Starting to remove anime ${animeId} from favorites for user ${userId}`);
      
      // Convert animeId to string if it's not already
      animeId = animeId.toString();
      
      // Get user document
      const userRef = doc(db, 'users', userId);
      const userDoc = await getDoc(userRef);
      
      if (!userDoc.exists()) {
        console.error('User document not found');
        throw new Error('User document not found');
      }
      
      // Start by updating user's document first - this part usually works
      await updateDoc(userRef, {
        favorites: arrayRemove(animeId),
        [`favoritesData.${animeId}`]: deleteField()
      });
      console.log('Successfully removed from user favorites');
      
      // Now handle the AnimeUsers collection separately with more error handling
      try {
        const animeUserRef = doc(db, 'animeUsers', animeId);
        const animeUserDoc = await getDoc(animeUserRef);
        
        if (animeUserDoc.exists()) {
          const animeData = animeUserDoc.data();
          
          // Filter out this user
          const updatedUsers = animeData.users.filter(id => id !== userId);
          
          if (updatedUsers.length > 0) {
            // Update the document with the new users array
            await updateDoc(animeUserRef, {
              users: updatedUsers,
              updatedAt: new Date()
            });
            console.log(`Updated animeUsers/${animeId} - removed user ${userId}`);
          } else {
            // If no users left, try to delete the document
            try {
              await deleteDoc(animeUserRef);
              console.log(`Deleted animeUsers/${animeId} - no users left`);
            } catch (deleteError) {
              console.error(`Failed to delete animeUsers/${animeId}:`, deleteError);
              // If delete fails, try to update with empty array instead
              await updateDoc(animeUserRef, {
                users: [],
                updatedAt: new Date()
              });
            }
          }
        }
      } catch (animeUserError) {
        console.error('Error updating animeUsers collection:', animeUserError);
        // Continue execution even if this part fails - the user's document was already updated
      }
      
      // Finally update matches
      try {
        await firestoreService.updateBidirectionalMatches(userId);
        console.log('Successfully updated matches after removing favorite');
      } catch (matchError) {
        console.error('Error updating matches after removing favorite:', matchError);
        // Continue execution - this is not critical for the removal operation
      }
      
      return true;
    } catch (error) {
      console.error('Error removing favorite:', error);
      throw error;
    }
  },

  // Get user favorites - adapted for new structure
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
  
  // Fix the updateBidirectionalMatches function

  updateBidirectionalMatches: async (userId) => {
    try {
      console.log(`Starting to update matches for user ${userId}`);
      
      // Get current user's data
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, {
        matches: [],
        matchesData: {}
      });
      
      // First get the user's favorites
      const userDoc = await getDoc(userRef);
      if (!userDoc.exists()) {
        return { success: true, matches: [] };
      }
      
      const userData = userDoc.data();
      const userFavorites = userData.favorites || [];
      
      // If user has no favorites, we're done
      if (userFavorites.length === 0) {
        return { success: true, matches: [] };
      }
      
      // Get all users
      const usersQuery = query(collection(db, "users"));
      const usersSnapshot = await getDocs(usersQuery);
      
      const matches = [];
      const matchesData = {};
      
      // Check each user for matches
      for (const docSnapshot of usersSnapshot.docs) {
        const otherUserId = docSnapshot.id;
        
        // Skip the current user
        if (otherUserId === userId) continue;
        
        const otherUserData = docSnapshot.data();
        const otherUserFavorites = otherUserData.favorites || [];
        
        // Count common favorites
        const commonFavorites = userFavorites.filter(id => 
          otherUserFavorites.includes(id)
        );
        
        // Check if they meet the match threshold
        if (commonFavorites.length >= MATCH_THRESHOLD) {
          matches.push(otherUserId);
          matchesData[otherUserId] = {
            userName: otherUserData.userName || 'User',
            photoURL: otherUserData.photoURL || '',
            matchCount: commonFavorites.length
          };
          
          // Update the other user's matches
          try {
            const otherUserRef = doc(db, 'users', otherUserId);
            
            // First check if we need to update their matches
            const otherUserSnapshot = await getDoc(otherUserRef);
            if (otherUserSnapshot.exists()) {
              const currentMatches = otherUserSnapshot.data().matches || [];
              const currentMatchesData = otherUserSnapshot.data().matchesData || {};
              
              // If we're not already in their matches or data is different, update
              if (!currentMatches.includes(userId) || 
                  !currentMatchesData[userId] ||
                  currentMatchesData[userId].matchCount !== commonFavorites.length) {
                
                await updateDoc(otherUserRef, {
                  matches: arrayUnion(userId),
                  [`matchesData.${userId}`]: {
                    userName: userData.userName || 'User',
                    photoURL: userData.photoURL || '',
                    matchCount: commonFavorites.length
                  }
                });
                
                console.log(`Updated match for user ${otherUserId}`);
              }
            }
          } catch (error) {
            console.error(`Error updating match for user ${otherUserId}:`, error);
            // Continue with other matches even if one fails
          }
        }
      }
      
      // Update the user's matches
      await updateDoc(userRef, {
        matches: matches,
        matchesData: matchesData
      });
      
      console.log(`Updated matches for user ${userId}: found ${matches.length} matches`);
      return { success: true, matches: matches };
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
            matches.push({
              userId: matchId,
              userName: matchData.userName || 'User',
              photoURL: matchData.photoURL || '',
              matches: matchData.matchCount || 0
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
  
  // Migrate from old format to new format
  migrateToNewStructure: async () => {
    try {
      console.log("Starting migration to new structure...");
      
      // Fetch all users
      const usersSnapshot = await getDocs(collection(db, "users"));
      
      for (const userDoc of usersSnapshot.docs) {
        const userId = userDoc.id;
        const userData = userDoc.data();
        
        console.log(`Checking user: ${userId}`);
        
        // Skip if already migrated
        if (userData.favorites && userData.favoritesData) {
          console.log(`User ${userId} already migrated`);
          continue;
        }
        
        console.log(`Migrating user: ${userId}`);
        
        // Create batch for atomic updates
        const batch = writeBatch(db);
        const userRef = doc(db, "users", userId);
        
        // 1. Prepare new data structure for favorites
        const favorites = [];
        const favoritesData = {};
        
        // Convert old favourite_animes array to new structure
        if (userData.favourite_animes && Array.isArray(userData.favourite_animes)) {
          for (const anime of userData.favourite_animes) {
            if (anime.mal_id) {
              const animeId = anime.mal_id.toString();
              favorites.push(animeId);
              
              favoritesData[animeId] = {
                title: anime.title || 'Unknown',
                image: anime.images?.jpg?.image_url || '',
                score: anime.score || 'N/A',
                type: anime.type || 'N/A',
                episodes: anime.episodes || 'N/A',
                addedAt: new Date()
              };
            }
          }
        }
        
        // 2. Update user document with new structure
        await updateDoc(userRef, {
          favorites: favorites,
          favoritesData: favoritesData
        });
        
        // 3. Add to AnimeUsers collection - do this one by one to avoid batch size limits
        for (const animeId of favorites) {
          try {
            const animeUserRef = doc(db, "animeUsers", animeId);
            const animeUserDoc = await getDoc(animeUserRef);
            
            if (animeUserDoc.exists()) {
              batch.update(animeUserRef, {
                users: arrayUnion(userId),
                updatedAt: new Date()
              });
            } else {
              batch.set(animeUserRef, {
                animeId: animeId,
                title: favoritesData[animeId].title,
                image: favoritesData[animeId].image,
                users: [userId],
                updatedAt: new Date()
              });
            }
          } catch (error) {
            console.error(`Error updating animeUsers for anime ${animeId}:`, error);
          }
        }
        
        // Commit the batch
        await batch.commit();
        console.log(`Successfully migrated user ${userId}`);
      }
      
      console.log("Migration completed successfully");
      return { success: true };
    } catch (error) {
      console.error("Migration failed:", error);
      return { success: false, error: error.message };
    }
  },
  
  // Fetch user profile
  fetchUserProfile: async (userId) => {
    try {
      if (!userId) {
        return { success: false, error: 'User ID is required' };
      }
      
      const userDoc = await getDoc(doc(db, 'users', userId));
      
      if (!userDoc.exists()) {
        return { success: false, error: 'User not found' };
      }
      
      const userData = userDoc.data();
      
      // For backwards compatibility, construct favourite_animes array
      if (userData.favoritesData && !userData.favourite_animes) {
        const favourite_animes = Object.entries(userData.favoritesData).map(([animeId, data]) => ({
          mal_id: parseInt(animeId),
          title: data.title,
          images: { jpg: { image_url: data.image } },
          score: data.score,
          type: data.type,
          episodes: data.episodes
        }));
        
        userData.favourite_animes = favourite_animes;
      }
      
      return { success: true, data: userData };
    } catch (error) {
      console.error('Error fetching user profile:', error);
      return { success: false, error: error.message };
    }
  },

  // Efficient way to update bidirectional matches
  updateBidirectionalMatches: async (userId) => {
    try {
      console.log(`Efficiently updating matches for user ${userId}`);
      
      // Get current user data
      const userRef = doc(db, 'users', userId);
      const userDoc = await getDoc(userRef);
      
      if (!userDoc.exists()) return { success: false, error: 'User not found' };
      
      const userData = userDoc.data();
      const userFavorites = userData.favorites || [];
      
      // If user has no favorites, clear matches
      if (userFavorites.length === 0) {
        await updateDoc(userRef, { matches: [], matchesData: {} });
        return { success: true, matches: [] };
      }
      
      // Find potential matches by collecting users who like the same anime
      const potentialMatches = new Map();
      
      // For better performance, query users with batch processing
      const batchSize = 5; // Process favorites in smaller batches
      
      for (let i = 0; i < userFavorites.length; i += batchSize) {
        const batch = userFavorites.slice(i, i + batchSize);
        
        for (const animeId of batch) {
          const animeRef = doc(db, 'animeUsers', animeId);
          const animeDoc = await getDoc(animeRef);
          
          if (animeDoc.exists()) {
            const users = animeDoc.data().users || [];
            
            // Count each user occurrence
            users.forEach(uid => {
              if (uid !== userId) {
                potentialMatches.set(uid, (potentialMatches.get(uid) || 0) + 1);
              }
            });
          }
        }
      }
      
      // Filter users who meet the match threshold
      const matches = [];
      const matchesData = {};
      
      for (const [matchUserId, count] of potentialMatches.entries()) {
        if (count >= MATCH_THRESHOLD) {
          const matchUserDoc = await getDoc(doc(db, 'users', matchUserId));
          
          if (matchUserDoc.exists()) {
            const matchUserData = matchUserDoc.data();
            matches.push(matchUserId);
            matchesData[matchUserId] = {
              userName: matchUserData.userName || 'User',
              photoURL: matchUserData.photoURL || '',
              matchCount: count
            };
          }
        }
      }
      
      // Update current user's matches
      await updateDoc(userRef, { matches, matchesData });
      
      console.log(`Updated matches for user ${userId}: found ${matches.length} matches`);
      
      // For each match, ensure bidirectionality without updating their whole document
      for (const matchUserId of matches) {
        try {
          const matchUserRef = doc(db, 'users', matchUserId);
          await updateDoc(matchUserRef, {
            [`matchesData.${userId}`]: {
              userName: userData.userName || 'User',
              photoURL: userData.photoURL || '',
              matchCount: potentialMatches.get(matchUserId) || 0
            },
            matches: arrayUnion(userId)
          });
        } catch (error) {
          console.error(`Error updating match for ${matchUserId}:`, error);
          // Continue with other matches even if one fails
        }
      }
      
      return { success: true, matches };
    } catch (error) {
      console.error('Error updating matches:', error);
      return { success: false, error: error.message };
    }
  }
};

export { firestoreService };