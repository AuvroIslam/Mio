import { doc, setDoc, getDoc, query, collection, getDocs, where } from 'firebase/firestore';
import { db } from '../config/firebaseConfig';
import firestoreService from './firestoreService';

// Constants for subscription limits
const SUBSCRIPTION_LIMITS = {
  FREE: {
    MAX_MATCHES_PER_WEEK: 15,
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
    // Get both users subscription info for limit checking
    const userSubResponse = await firestoreService.getUserSubscription(userId);
    const otherUserSubResponse = await firestoreService.getUserSubscription(otherUserId);
    
    const userSub = userSubResponse.success ? userSubResponse.data : null;
    const otherUserSub = otherUserSubResponse.success ? otherUserSubResponse.data : null;
    
    // Check if either user has reached their match limit
    const userIsPremium = userSub?.isPremium || false;
    const otherUserIsPremium = otherUserSub?.isPremium || false;
    
    const userMatchesThisWeek = userSub?.matchesThisWeek || 0;
    const otherUserMatchesThisWeek = otherUserSub?.matchesThisWeek || 0;
    
    const userMatchLimit = userIsPremium 
      ? SUBSCRIPTION_LIMITS.PREMIUM.MAX_MATCHES_PER_WEEK 
      : SUBSCRIPTION_LIMITS.FREE.MAX_MATCHES_PER_WEEK;
      
    const otherUserMatchLimit = otherUserIsPremium 
      ? SUBSCRIPTION_LIMITS.PREMIUM.MAX_MATCHES_PER_WEEK 
      : SUBSCRIPTION_LIMITS.FREE.MAX_MATCHES_PER_WEEK;
    
    // If either user has reached their limit, don't create the match
    if (!userIsPremium && userMatchesThisWeek >= userMatchLimit) {
      console.log(`User ${userId} has reached their match limit for the week`);
      return {
        success: false,
        error: 'Match limit reached for the week'
      };
    }
    
    if (!otherUserIsPremium && otherUserMatchesThisWeek >= otherUserMatchLimit) {
      console.log(`User ${otherUserId} has reached their match limit for the week`);
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
    
    // Update match count in subscription data
    if (!userIsPremium) {
      await firestoreService.updateUserSubscription(userId, {
        matchesThisWeek: userMatchesThisWeek + 1
      });
    }
    
    if (!otherUserIsPremium) {
      await firestoreService.updateUserSubscription(otherUserId, {
        matchesThisWeek: otherUserMatchesThisWeek + 1
      });
    }
    
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
    const userSubResponse = await firestoreService.getUserSubscription(userId);
    
    if (!userSubResponse.success) {
      return {
        success: false,
        error: 'Failed to retrieve user subscription data'
      };
    }
    
    const userSub = userSubResponse.data || { isPremium: false, matchesThisWeek: 0 };
    const isPremium = userSub.isPremium || false;
    const matchesThisWeek = userSub.matchesThisWeek || 0;
    
    const matchLimit = isPremium 
      ? SUBSCRIPTION_LIMITS.PREMIUM.MAX_MATCHES_PER_WEEK 
      : SUBSCRIPTION_LIMITS.FREE.MAX_MATCHES_PER_WEEK;
    
    const canCreate = isPremium || matchesThisWeek < matchLimit;
    const remainingMatches = isPremium ? Infinity : Math.max(0, matchLimit - matchesThisWeek);
    
    return {
      success: true,
      canCreate,
      remainingMatches,
      isPremium
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
        limit(limit)
      );
    } else {
      matchesQuery = query(
        matchesRef,
        orderBy('matchedAt', 'desc'),
        limit(limit)
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
  SUBSCRIPTION_LIMITS
}; 