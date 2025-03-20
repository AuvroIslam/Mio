import { doc, setDoc, getDoc, query, collection, getDocs, where, orderBy, startAfter, limit as fbLimit } from 'firebase/firestore';
import { db } from '../config/firebaseConfig';
import firestoreService from './firestoreService';

// Constants for subscription limits
const SUBSCRIPTION_LIMITS = {
  FREE: {
    MAX_MATCHES_PER_WEEK: 2, // Free users can match with 2 new people each week
  },
  PREMIUM: {
    MAX_MATCHES_PER_WEEK: Infinity,
  }
};

/**
 * Creates a bidirectional match between two users, respecting subscription limits
 * @param {string} userId - Current user ID
 * @param {string} otherUserId - ID of the user to match with
 */
const createBidirectionalMatch = async (userId, otherUserId) => {
  try {
    // First check if both users are available for matching
    const userAvailabilityResponse = await firestoreService.checkAndResetCooldown(userId);
    const otherUserAvailabilityResponse = await firestoreService.checkAndResetCooldown(otherUserId);
    
    // If either user has a cooldown and isn't available, don't create the match
    if (!userAvailabilityResponse.success || !userAvailabilityResponse.availableForMatching) {
      return {
        success: false,
        error: 'User has reached their match limit for the week'
      };
    }
    
    if (!otherUserAvailabilityResponse.success || !otherUserAvailabilityResponse.availableForMatching) {
      return {
        success: false,
        error: 'Other user has reached their match limit for the week'
      };
    }
    
    // Create the match in both users' documents
    const userMatchRef = doc(db, 'users', userId, 'matches', otherUserId);
    const otherUserMatchRef = doc(db, 'users', otherUserId, 'matches', userId);
    
    // Create the match document
    await setDoc(userMatchRef, {
      matchedAt: new Date().toISOString(),
      userId: otherUserId
    });
    
    await setDoc(otherUserMatchRef, {
      matchedAt: new Date().toISOString(),
      userId: userId
    });
    
    // Process the match and update match counts for both users
    await firestoreService.processMatch(userId, otherUserId);
    
    return {
      success: true,
      message: 'Match created successfully'
    };
  } catch (error) {
    console.error('Error creating bidirectional match:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Checks if a user can have more matches based on their subscription
 * @param {string} userId - User ID to check 
 */
const canCreateMoreMatches = async (userId) => {
  try {
    // Check if user's cooldown has ended
    const cooldownCheck = await firestoreService.checkAndResetCooldown(userId);
    
    if (!cooldownCheck.success) {
      return {
        success: false,
        error: 'Failed to check user cooldown status'
      };
    }
    
    // If user was in cooldown and it just ended, they're now available
    if (cooldownCheck.cooldownEnded) {
      return {
        success: true,
        canCreate: true,
        remainingMatches: SUBSCRIPTION_LIMITS.FREE.MAX_MATCHES_PER_WEEK,
        isPremium: false,
        message: 'Weekly match limit has been reset'
      };
    }
    
    // If user is not available for matching, they're in cooldown
    if (!cooldownCheck.availableForMatching) {
      return {
        success: true,
        canCreate: false,
        remainingMatches: 0,
        isPremium: false,
        message: 'Weekly match limit reached, please wait for the cooldown to end'
      };
    }
    
    // Get the subscription data to check their remaining matches
    const subscriptionResponse = await firestoreService.getUserSubscription(userId);
    
    if (!subscriptionResponse.success) {
      return {
        success: false,
        error: 'Failed to retrieve user subscription data'
      };
    }
    
    const subscription = subscriptionResponse.data;
    const isPremium = subscription.isPremium || false;
    const matchCount = subscription.matchCount || 0;
    const matchThreshold = subscription.matchThreshold || SUBSCRIPTION_LIMITS.FREE.MAX_MATCHES_PER_WEEK;
    
    const remainingMatches = isPremium ? Infinity : Math.max(0, matchThreshold - matchCount);
    const canCreate = isPremium || remainingMatches > 0;
    
    return {
      success: true,
      canCreate,
      remainingMatches,
      isPremium,
      matchCount
    };
  } catch (error) {
    console.error('Error checking if user can create more matches:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Filters potential matches to only include users who are available for matching
 * @param {string} userId - Current user ID
 * @param {Array} potentialMatchIds - Array of potential match user IDs
 * @returns {Promise<Array>} Filtered array of available match user IDs
 */
const filterAvailableMatches = async (userId, potentialMatchIds) => {
  try {
    if (!potentialMatchIds || potentialMatchIds.length === 0) {
      return [];
    }
    
    const availableMatches = [];
    
    // Process in batches to avoid hitting Firestore limits
    const batchSize = 10;
    for (let i = 0; i < potentialMatchIds.length; i += batchSize) {
      const batch = potentialMatchIds.slice(i, i + batchSize);
      const batchPromises = batch.map(matchId => 
        firestoreService.checkAndResetCooldown(matchId)
      );
      
      const results = await Promise.all(batchPromises);
      
      for (let j = 0; j < results.length; j++) {
        const result = results[j];
        const matchId = batch[j];
        
        if (result.success && result.availableForMatching) {
          availableMatches.push(matchId);
        }
      }
    }
    
    return availableMatches;
  } catch (error) {
    console.error('Error filtering available matches:', error);
    return [];
  }
};

/**
 * Gets all matches for a user with pagination support
 * @param {string} userId - User ID to get matches for
 * @param {number} limit - Maximum number of matches to return
 * @param {string} lastMatchId - Last match ID for pagination
 */
const getUserMatches = async (userId, limit = 20, lastMatchId = null) => {
  try {
    const matchesRef = collection(db, 'users', userId, 'matches');
    let matchesQuery;
    
    if (lastMatchId) {
      const lastMatchDoc = await getDoc(doc(db, 'users', userId, 'matches', lastMatchId));
      matchesQuery = query(
        matchesRef,
        orderBy('matchedAt', 'desc'),
        startAfter(lastMatchDoc),
        fbLimit(limit)
      );
    } else {
      matchesQuery = query(
        matchesRef,
        orderBy('matchedAt', 'desc'),
        fbLimit(limit)
      );
    }
    
    const matchesSnap = await getDocs(matchesQuery);
    const matches = [];
    
    // Get user details for each match
    for (const matchDoc of matchesSnap.docs) {
      const matchData = matchDoc.data();
      const matchUserId = matchData.userId;
      
      // Get the match user's profile data
      const userProfileResponse = await firestoreService.getUserProfile(matchUserId);
      
      if (userProfileResponse.success && userProfileResponse.data) {
        matches.push({
          id: matchDoc.id,
          matchedAt: matchData.matchedAt,
          user: userProfileResponse.data
        });
      }
    }
    
    return {
      success: true,
      matches,
      hasMore: matchesSnap.docs.length === limit
    };
  } catch (error) {
    console.error('Error getting user matches:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

export default {
  createBidirectionalMatch,
  canCreateMoreMatches,
  getUserMatches,
  filterAvailableMatches,
  SUBSCRIPTION_LIMITS
}; 