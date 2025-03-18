import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

/**
 * This component serves as a fallback banner image when an actual image file
 * isn't available. It creates a nice gradient with text overlay.
 */
const PremiumBanner = ({ style }) => {
  return (
    <View style={[styles.container, style]}>
      <LinearGradient
        colors={['#4c669f', '#3b5998', '#192f6a']}
        style={styles.gradient}
      >
        <View style={styles.content}>
          <Text style={styles.title}>Anime Matches Premium</Text>
          <Text style={styles.subtitle}>Unlock the full experience</Text>
          <View style={styles.starburst}>
            <Text style={styles.starburstText}>PRO</Text>
          </View>
        </View>
      </LinearGradient>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: 180,
    overflow: 'hidden',
    borderRadius: 8,
  },
  gradient: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    alignItems: 'center',
    position: 'relative',
    width: '100%',
    height: '100%',
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#e0e0e0',
    textAlign: 'center',
  },
  starburst: {
    position: 'absolute',
    top: 20,
    right: 20,
    backgroundColor: '#f5a623',
    borderRadius: 25,
    width: 50,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    transform: [{ rotate: '15deg' }],
  },
  starburstText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 14,
  }
});

export default PremiumBanner; 