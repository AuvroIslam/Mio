/**
 * Timer Service - Provides consistent timer functionality across the app
 * Helps prevent memory leaks and provides a standardized way to handle timers
 */

// Store active timers so they can be properly cleared
const activeTimers = new Map();

/**
 * Creates a timeout that can be tracked and safely cleared
 * @param {string} key - Unique identifier for the timer
 * @param {Function} callback - Function to execute when timer completes 
 * @param {number} delay - Delay in milliseconds
 * @returns {number} - Timer ID
 */
const setTimeout = (key, callback, delay) => {
  // Clear any existing timer with this key
  clearTimeout(key);
  
  // Create new timer
  const timerId = global.setTimeout(() => {
    // Remove from active timers when complete
    activeTimers.delete(key);
    // Execute callback
    callback();
  }, delay);
  
  // Store in our map
  activeTimers.set(key, timerId);
  
  return timerId;
};

/**
 * Clears a timeout by key
 * @param {string} key - Unique identifier for the timer
 */
const clearTimeout = (key) => {
  if (activeTimers.has(key)) {
    global.clearTimeout(activeTimers.get(key));
    activeTimers.delete(key);
  }
};

/**
 * Creates an interval that can be tracked and safely cleared
 * @param {string} key - Unique identifier for the interval
 * @param {Function} callback - Function to execute on each interval
 * @param {number} delay - Interval delay in milliseconds  
 * @returns {number} - Interval ID
 */
const setInterval = (key, callback, delay) => {
  // Clear any existing interval with this key
  clearInterval(key);
  
  // Create new interval
  const intervalId = global.setInterval(callback, delay);
  
  // Store in our map
  activeTimers.set(key, intervalId);
  
  return intervalId;
};

/**
 * Clears an interval by key
 * @param {string} key - Unique identifier for the interval
 */
const clearInterval = (key) => {
  if (activeTimers.has(key)) {
    global.clearInterval(activeTimers.get(key));
    activeTimers.delete(key);
  }
};

/**
 * Creates a debounced function that delays invoking func until after wait milliseconds
 * @param {Function} func - The function to debounce
 * @param {number} wait - The number of milliseconds to delay
 * @param {string} key - Optional key to use for the timer (defaults to a random key)
 * @returns {Function} - The debounced function
 */
const debounce = (func, wait, key = `debounce_${Date.now()}_${Math.random()}`) => {
  return (...args) => {
    clearTimeout(key);
    setTimeout(key, () => func(...args), wait);
  };
};

/**
 * Creates a throttled function that only invokes func at most once per every limit milliseconds
 * @param {Function} func - The function to throttle
 * @param {number} limit - The number of milliseconds to throttle invocations to
 * @param {string} key - Optional key to use for the timer (defaults to a random key)
 * @returns {Function} - The throttled function
 */
const throttle = (func, limit, key = `throttle_${Date.now()}_${Math.random()}`) => {
  let lastFunc;
  let lastRan;
  
  return function(...args) {
    if (!lastRan) {
      func(...args);
      lastRan = Date.now();
    } else {
      clearTimeout(key);
      lastFunc = () => {
        if ((Date.now() - lastRan) >= limit) {
          func(...args);
          lastRan = Date.now();
        }
      };
      setTimeout(key, lastFunc, limit - (Date.now() - lastRan));
    }
  };
};

/**
 * Clears all active timers - useful when unmounting components
 */
const clearAll = () => {
  activeTimers.forEach((timerId, key) => {
    if (key.startsWith('interval_')) {
      global.clearInterval(timerId);
    } else {
      global.clearTimeout(timerId);
    }
  });
  activeTimers.clear();
};

export default {
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  debounce,
  throttle,
  clearAll
}; 