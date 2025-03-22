import React, { useState, useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { enableScreens } from 'react-native-screens';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AuthProvider } from './config/AuthContext';
import { SubscriptionProvider } from './config/SubscriptionContext';
import { FavoritesProvider } from './config/FavoritesContext';
import { DramaProvider } from './config/DramaContext';
import Navigation from './components/Navigation';
import { View } from 'react-native';

// Enable screens for better navigation performance
enableScreens();

// Main app component
export default function App() {
  const [appIsReady, setAppIsReady] = useState(false);

  useEffect(() => {
    // Simple initialization
    setTimeout(() => {
      setAppIsReady(true);
    }, 500);
  }, []);

  if (!appIsReady) {
    return null;
  }

  // Wrap the app with all required context providers
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <View style={{ flex: 1 }}>
          <StatusBar style="auto" />
          <AuthProvider>
            <SubscriptionProvider>
              <FavoritesProvider>
                <DramaProvider>
                  <NavigationContainer>
                    <Navigation />
                  </NavigationContainer>
                </DramaProvider>
              </FavoritesProvider>
            </SubscriptionProvider>
          </AuthProvider>
        </View>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}