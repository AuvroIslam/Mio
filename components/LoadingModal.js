import React from 'react';
import { Modal, View, ActivityIndicator, Text, StyleSheet } from 'react-native';

/**
 * Reusable loading modal component
 * @param {boolean} visible - Controls modal visibility
 * @param {string} message - Message to display in the loading modal
 * @param {object} style - Additional styles to apply to the modal container
 */
const LoadingModal = ({ visible, message, style }) => {
  return (
    <Modal
      transparent={true}
      animationType="fade"
      visible={visible}
      onRequestClose={() => {}}
    >
      <View style={[styles.modalContainer, style]}>
        <View style={styles.modalContent}>
          <ActivityIndicator size="large" color="#007bff" />
          <Text style={styles.modalText}>
            {message || 'Loading...'}
          </Text>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContent: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 10,
    alignItems: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  modalText: {
    marginTop: 10,
    fontSize: 16,
  }
});

export default LoadingModal; 