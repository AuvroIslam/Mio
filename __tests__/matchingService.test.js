import { jest } from '@jest/globals';
import matchingService from '../services/matchingService';
import firestoreService from '../services/firestoreService';

// Mock firestore service
jest.mock('../services/firestoreService');

describe('Matching Service Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('canCreateMoreMatches', () => {
    test('returns true and correct remaining matches for user not at limit', async () => {
      // Mock the checkAndResetCooldown and getUserSubscription functions
      firestoreService.checkAndResetCooldown.mockResolvedValue({
        success: true,
        availableForMatching: true,
        cooldownEnded: false
      });

      firestoreService.getUserSubscription.mockResolvedValue({
        success: true,
        data: {
          userId: 'testUser',
          isPremium: false,
          matchCount: 1,
          matchThreshold: 2,
          availableForMatching: true
        }
      });

      const result = await matchingService.canCreateMoreMatches('testUser');

      expect(result.success).toBe(true);
      expect(result.canCreate).toBe(true);
      expect(result.remainingMatches).toBe(1); // 2 - 1 = 1 remaining
      expect(result.isPremium).toBe(false);
    });

    test('returns false for user at limit with active cooldown', async () => {
      firestoreService.checkAndResetCooldown.mockResolvedValue({
        success: true,
        availableForMatching: false,
        cooldownEnded: false
      });

      const result = await matchingService.canCreateMoreMatches('testUser');

      expect(result.success).toBe(true);
      expect(result.canCreate).toBe(false);
      expect(result.remainingMatches).toBe(0);
      expect(result.message).toBe('Weekly match limit reached, please wait for the cooldown to end');
    });

    test('returns true after cooldown period has ended', async () => {
      firestoreService.checkAndResetCooldown.mockResolvedValue({
        success: true,
        availableForMatching: true,
        cooldownEnded: true
      });

      const result = await matchingService.canCreateMoreMatches('testUser');

      expect(result.success).toBe(true);
      expect(result.canCreate).toBe(true);
      expect(result.remainingMatches).toBe(2); // Reset to full amount
      expect(result.message).toBe('Weekly match limit has been reset');
    });
  });

  describe('createBidirectionalMatch', () => {
    test('creates a match when both users are available', async () => {
      // Mock the necessary functions
      firestoreService.checkAndResetCooldown
        .mockResolvedValueOnce({
          success: true,
          availableForMatching: true
        })
        .mockResolvedValueOnce({
          success: true,
          availableForMatching: true
        });

      firestoreService.processMatch.mockResolvedValue({ success: true });

      // Mock the Firestore document creation
      global.setDoc = jest.fn().mockResolvedValue(undefined);

      const result = await matchingService.createBidirectionalMatch('user1', 'user2');

      expect(result.success).toBe(true);
      expect(firestoreService.processMatch).toHaveBeenCalledWith('user1', 'user2');
    });

    test('fails to create a match when first user is not available', async () => {
      firestoreService.checkAndResetCooldown
        .mockResolvedValueOnce({
          success: true,
          availableForMatching: false
        });

      const result = await matchingService.createBidirectionalMatch('user1', 'user2');

      expect(result.success).toBe(false);
      expect(result.error).toBe('User has reached their match limit for the week');
      expect(firestoreService.processMatch).not.toHaveBeenCalled();
    });

    test('fails to create a match when second user is not available', async () => {
      firestoreService.checkAndResetCooldown
        .mockResolvedValueOnce({
          success: true,
          availableForMatching: true
        })
        .mockResolvedValueOnce({
          success: true,
          availableForMatching: false
        });

      const result = await matchingService.createBidirectionalMatch('user1', 'user2');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Other user has reached their match limit for the week');
      expect(firestoreService.processMatch).not.toHaveBeenCalled();
    });
  });

  describe('filterAvailableMatches', () => {
    test('filters out users who are not available for matching', async () => {
      firestoreService.checkAndResetCooldown
        .mockResolvedValueOnce({
          success: true,
          availableForMatching: true
        })
        .mockResolvedValueOnce({
          success: true,
          availableForMatching: false // User in cooldown
        })
        .mockResolvedValueOnce({
          success: true,
          availableForMatching: true
        });

      const result = await matchingService.filterAvailableMatches('currentUser', ['user1', 'user2', 'user3']);

      expect(result).toEqual(['user1', 'user3']);
      expect(firestoreService.checkAndResetCooldown).toHaveBeenCalledTimes(3);
    });

    test('returns empty array for empty input', async () => {
      const result = await matchingService.filterAvailableMatches('currentUser', []);
      expect(result).toEqual([]);
      expect(firestoreService.checkAndResetCooldown).not.toHaveBeenCalled();
    });
  });
}); 