import { Alert } from 'react-native';

/**
 * Centralized alert service with standardized messaging
 */
const alertService = {
  /**
   * Show an error alert
   * @param {string} message - The error message to display
   * @param {Error|string} error - Optional error object or string for logging
   */
  showError: (message, error) => {
    if (error) {
      console.error(message, error);
    }
    Alert.alert('Error', message);
  },

  /**
   * Show a success alert
   * @param {string} message - The success message to display
   */
  showSuccess: (message) => {
    Alert.alert('Success', message);
  },

  /**
   * Show a confirmation alert with approve/cancel options
   * @param {string} title - The title of the confirmation
   * @param {string} message - The confirmation message
   * @param {Function} onConfirm - Callback to execute on confirmation
   * @param {string} confirmText - Text for confirm button (default: "OK")
   */
  showConfirmation: (title, message, onConfirm, confirmText = 'OK') => {
    Alert.alert(
      title,
      message,
      [
        {
          text: 'Cancel',
          style: 'cancel'
        },
        {
          text: confirmText,
          onPress: onConfirm
        }
      ]
    );
  },

  /**
   * Show premium upgrade alert
   * @param {string} title - The title of the alert
   * @param {string} message - The message about premium benefits
   * @param {Function} onUpgradePress - Navigation function to premium upgrade
   */
  showPremiumUpgrade: (title, message, onUpgradePress) => {
    Alert.alert(
      title,
      message,
      [
        {
          text: 'OK',
          style: 'cancel'
        },
        {
          text: 'Upgrade to Premium',
          onPress: onUpgradePress
        }
      ]
    );
  },

  /**
   * Show a limit reached alert with option to upgrade
   * @param {string} type - The type of limit reached (favorites, changes, etc.)
   * @param {string} message - Details about the limit
   * @param {Function} onUpgradePress - Navigation function to premium upgrade
   */
  showLimitReached: (type, message, onUpgradePress) => {
    Alert.alert(
      `${type} Limit Reached`,
      message + ' Upgrade to premium for unlimited access.',
      [
        { text: 'OK' },
        { 
          text: 'Upgrade to Premium', 
          onPress: onUpgradePress
        }
      ]
    );
  }
};

export default alertService; 