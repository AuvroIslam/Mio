import 'react-native-gesture-handler';
import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { AuthProvider, useAuth } from './config/AuthContext';
import { firestoreService } from './services/firestoreService';
import Login from './scenes/login';
import Signup from './scenes/signup';
import AppNavigator from './components/Navigation';

const Stack = createStackNavigator();

// Auth Navigator - shown when user is NOT authenticated
const AuthStack = () => {
  return (
    <Stack.Navigator initialRouteName="Login">
      <Stack.Screen 
        name="Login" 
        component={Login} 
        options={{ headerShown: false }}
      />
      <Stack.Screen 
        name="Signup" 
        component={Signup}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
};

// Root component that handles authentication state
const RootNavigator = () => {
  const { currentUser, loading } = useAuth();
  
  useEffect(() => {
    const runMigration = async () => {
      try {
        if (currentUser) {
          console.log("Running data migration check...");
          await firestoreService.migrateToNewStructure();
        }
      } catch (error) {
        console.error("Migration error:", error);
      }
    };
    
    runMigration();
  }, [currentUser]);

  if (loading) {
    // You could add a loading screen here if needed
    return null;
  }
  
  return (
    <NavigationContainer>
      <StatusBar style="auto" />
      {currentUser ? <AppNavigator /> : <AuthStack />}
    </NavigationContainer>
  );
};

// Main App component with AuthProvider
export default function App() {
  return (
    <AuthProvider>
      <RootNavigator />
    </AuthProvider>
  );
}