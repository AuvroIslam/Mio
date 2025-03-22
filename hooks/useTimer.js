import { useRef, useEffect, useCallback } from 'react';
import timerService from '../services/timerService';

/**
 * Custom hook for managing timers with automatic cleanup
 * @returns {Object} Timer management functions
 */
const useTimer = () => {
  // Create a unique identifier for this component instance
  const timerKeyPrefix = useRef(`timer_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`);
  
  // Keep track of active timers in this component
  const activeTimers = useRef(new Set());
  
  /**
   * Generate a unique key for a timer
   * @param {string} name - Optional name to identify the timer
   * @returns {string} - Unique timer key
   */
  const getTimerKey = useCallback((name = '') => {
    const key = `${timerKeyPrefix.current}_${name || Math.random().toString(36).substring(2, 9)}`;
    activeTimers.current.add(key);
    return key;
  }, []);
  
  /**
   * Set a timeout that will be automatically cleaned up
   * @param {Function} callback - Function to execute after delay
   * @param {number} delay - Delay in milliseconds
   * @param {string} name - Optional name to identify the timer
   * @returns {string} Timer key that can be used to clear the timeout
   */
  const setTimeout = useCallback((callback, delay, name) => {
    const key = getTimerKey(name);
    timerService.setTimeout(key, callback, delay);
    return key;
  }, [getTimerKey]);
  
  /**
   * Set an interval that will be automatically cleaned up
   * @param {Function} callback - Function to execute on interval
   * @param {number} delay - Interval delay in milliseconds
   * @param {string} name - Optional name to identify the timer
   * @returns {string} Timer key that can be used to clear the interval
   */
  const setInterval = useCallback((callback, delay, name) => {
    const key = getTimerKey(name);
    timerService.setInterval(key, callback, delay);
    return key;
  }, [getTimerKey]);
  
  /**
   * Clear a specific timeout or interval
   * @param {string} key - Timer key to clear
   */
  const clearTimer = useCallback((key) => {
    if (key) {
      timerService.clearTimeout(key);
      timerService.clearInterval(key);
      activeTimers.current.delete(key);
    }
  }, []);
  
  /**
   * Creates a debounced function that will be automatically cleaned up
   * @param {Function} func - Function to debounce
   * @param {number} wait - Debounce wait time in milliseconds
   * @param {string} name - Optional name to identify the timer
   * @returns {Function} Debounced function
   */
  const debounce = useCallback((func, wait, name) => {
    const key = getTimerKey(name);
    return timerService.debounce(func, wait, key);
  }, [getTimerKey]);
  
  /**
   * Creates a throttled function that will be automatically cleaned up
   * @param {Function} func - Function to throttle
   * @param {number} limit - Throttle time limit in milliseconds
   * @param {string} name - Optional name to identify the timer
   * @returns {Function} Throttled function
   */
  const throttle = useCallback((func, limit, name) => {
    const key = getTimerKey(name);
    return timerService.throttle(func, limit, key);
  }, [getTimerKey]);
  
  // Cleanup all timers when the component unmounts
  useEffect(() => {
    return () => {
      // Clear all timers created by this hook instance
      activeTimers.current.forEach(key => {
        timerService.clearTimeout(key);
        timerService.clearInterval(key);
      });
      activeTimers.current.clear();
    };
  }, []);
  
  return {
    setTimeout,
    setInterval,
    clearTimer,
    debounce,
    throttle
  };
};

export default useTimer; 