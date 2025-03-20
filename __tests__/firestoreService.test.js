import { jest } from '@jest/globals';
import firestoreService from '../services/firestoreService';

// Mock Firestore functions
jest.mock('firebase/firestore', () => {
  return {
    doc: jest.fn(() => 'doc-ref-mock'),
    getDoc: jest.fn(),
    setDoc: jest.fn(),
    updateDoc: jest.fn(),
    writeBatch: jest.fn(() => ({
      update: jest.fn(),
      commit: jest.fn(),
    })),
    Timestamp: {
      now: jest.fn(() => ({ toDate: () => new Date() })),
    },
  };
});

const mockTimestamp = (date) => ({
  toDate: () => date,
});

describe('Firestore Service Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getUserSubscription', () => {
    test('creates default subscription when none exists', async () => {
      const { getDoc, setDoc } = require('firebase/firestore');
      
      // Mock getDoc to return that no subscription exists
      getDoc.mockResolvedValue({ exists: () => false });
      
      const result = await firestoreService.getUserSubscription('testUser');
      
      expect(getDoc).toHaveBeenCalled();
      expect(setDoc).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.data).toEqual(
        expect.objectContaining({
          userId: 'testUser',
          isPremium: false,
          matchCount: 0,
          matchThreshold: 2,
          availableForMatching: true,
        })
      );
    });

    test('returns existing subscription data', async () => {
      const { getDoc } = require('firebase/firestore');
      
      const mockSubscriptionData = {
        userId: 'testUser',
        isPremium: false,
        matchCount: 1,
        matchThreshold: 2,
        availableForMatching: true,
      };
      
      // Mock getDoc to return subscription exists
      getDoc.mockResolvedValue({
        exists: () => true,
        data: () => mockSubscriptionData,
      });
      
      const result = await firestoreService.getUserSubscription('testUser');
      
      expect(getDoc).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockSubscriptionData);
    });
  });

  describe('processMatch', () => {
    test('increments match count for both users', async () => {
      const { getDoc, writeBatch } = require('firebase/firestore');
      
      // Mock subscription data for both users
      const user1Data = {
        userId: 'user1',
        isPremium: false,
        matchCount: 1,
        matchThreshold: 2,
        availableForMatching: true,
      };
      
      const user2Data = {
        userId: 'user2',
        isPremium: false,
        matchCount: 0,
        matchThreshold: 2,
        availableForMatching: true,
      };
      
      // Mock getDoc to return subscription exists for both users
      getDoc
        .mockResolvedValueOnce({
          exists: () => true,
          data: () => user1Data,
        })
        .mockResolvedValueOnce({
          exists: () => true,
          data: () => user2Data,
        });
      
      const mockBatch = {
        update: jest.fn(),
        commit: jest.fn().mockResolvedValue(undefined),
      };
      
      writeBatch.mockReturnValue(mockBatch);
      
      const result = await firestoreService.processMatch('user1', 'user2');
      
      expect(getDoc).toHaveBeenCalledTimes(2);
      expect(mockBatch.update).toHaveBeenCalledTimes(2);
      expect(mockBatch.commit).toHaveBeenCalled();
      expect(result.success).toBe(true);
      
      // Check that the first user's match count was incremented
      expect(mockBatch.update.mock.calls[0][1]).toEqual(
        expect.objectContaining({
          matchCount: 2, // 1 + 1 = 2
        })
      );
      
      // Check that the second user's match count was incremented
      expect(mockBatch.update.mock.calls[1][1]).toEqual(
        expect.objectContaining({
          matchCount: 1, // 0 + 1 = 1
        })
      );
    });

    test('sets cooldown for user reaching threshold', async () => {
      const { getDoc, writeBatch } = require('firebase/firestore');
      
      // Mock subscription data for user at threshold
      const userData = {
        userId: 'user1',
        isPremium: false,
        matchCount: 1, // One more match will hit threshold of 2
        matchThreshold: 2,
        availableForMatching: true,
      };
      
      const otherUserData = {
        userId: 'user2',
        isPremium: false,
        matchCount: 0,
        matchThreshold: 2,
        availableForMatching: true,
      };
      
      // Mock getDoc to return subscription exists
      getDoc
        .mockResolvedValueOnce({
          exists: () => true,
          data: () => userData,
        })
        .mockResolvedValueOnce({
          exists: () => true,
          data: () => otherUserData,
        });
      
      const mockBatch = {
        update: jest.fn(),
        commit: jest.fn().mockResolvedValue(undefined),
      };
      
      writeBatch.mockReturnValue(mockBatch);
      
      const result = await firestoreService.processMatch('user1', 'user2');
      
      expect(getDoc).toHaveBeenCalledTimes(2);
      expect(mockBatch.update).toHaveBeenCalledTimes(2);
      expect(mockBatch.commit).toHaveBeenCalled();
      expect(result.success).toBe(true);
      
      // Check that the first user's match count was incremented and cooldown was set
      expect(mockBatch.update.mock.calls[0][1]).toEqual(
        expect.objectContaining({
          matchCount: 2, // 1 + 1 = 2 (hits threshold)
          availableForMatching: false, // Cooldown activated
          matchCooldownStartedAt: expect.anything(),
        })
      );
    });
  });

  describe('checkAndResetCooldown', () => {
    test('returns availableForMatching=true if already available', async () => {
      const { getDoc } = require('firebase/firestore');
      
      // Mock subscription data
      const userData = {
        userId: 'user1',
        isPremium: false,
        matchCount: 1,
        matchThreshold: 2,
        availableForMatching: true,
      };
      
      // Mock getDoc to return subscription exists
      getDoc.mockResolvedValue({
        exists: () => true,
        data: () => userData,
      });
      
      const result = await firestoreService.checkAndResetCooldown('user1');
      
      expect(getDoc).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.availableForMatching).toBe(true);
      expect(result.cooldownEnded).toBe(false);
    });

    test('resets cooldown if cooldown period has passed', async () => {
      const { getDoc, updateDoc } = require('firebase/firestore');
      
      // Mock a date 8 days ago (cooldown of 7 days)
      const eightDaysAgo = new Date();
      eightDaysAgo.setDate(eightDaysAgo.getDate() - 8);
      
      // Mock subscription data with cooldown set in the past
      const userData = {
        userId: 'user1',
        isPremium: false,
        matchCount: 2,
        matchThreshold: 2,
        availableForMatching: false,
        matchCooldownStartedAt: mockTimestamp(eightDaysAgo),
      };
      
      // Mock getDoc to return subscription exists
      getDoc.mockResolvedValue({
        exists: () => true,
        data: () => userData,
      });
      
      // Mock updateDoc to succeed
      updateDoc.mockResolvedValue(undefined);
      
      const result = await firestoreService.checkAndResetCooldown('user1');
      
      expect(getDoc).toHaveBeenCalled();
      expect(updateDoc).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.availableForMatching).toBe(true);
      expect(result.cooldownEnded).toBe(true);
      
      // Check updateDoc was called with reset values
      expect(updateDoc.mock.calls[0][1]).toEqual(
        expect.objectContaining({
          matchCount: 0,
          matchCooldownStartedAt: null,
          availableForMatching: true,
        })
      );
    });

    test('keeps cooldown if cooldown period has not passed', async () => {
      const { getDoc, updateDoc } = require('firebase/firestore');
      
      // Mock a date 3 days ago (cooldown of 7 days not passed)
      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
      
      // Mock subscription data with active cooldown
      const userData = {
        userId: 'user1',
        isPremium: false,
        matchCount: 2,
        matchThreshold: 2,
        availableForMatching: false,
        matchCooldownStartedAt: mockTimestamp(threeDaysAgo),
      };
      
      // Mock getDoc to return subscription exists
      getDoc.mockResolvedValue({
        exists: () => true,
        data: () => userData,
      });
      
      const result = await firestoreService.checkAndResetCooldown('user1');
      
      expect(getDoc).toHaveBeenCalled();
      expect(updateDoc).not.toHaveBeenCalled(); // Should not update
      expect(result.success).toBe(true);
      expect(result.availableForMatching).toBe(false);
      expect(result.cooldownEnded).toBe(false);
    });
  });
}); 