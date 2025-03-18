import 'react-native-gesture-handler';
import React, { useState, useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { AuthProvider, useAuth } from './config/AuthContext';
import { FavoritesProvider } from './config/FavoritesContext';
import firestoreService from './services/firestoreService';
import Login from './scenes/login';
import Signup from './scenes/signup';
import RegisterPage from './scenes/RegisterPage';
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
  const { currentUser, loading, isNewUser, checkingAuth } = useAuth();
  const [isProfileComplete, setIsProfileComplete] = useState(false);
  const [checkingProfile, setCheckingProfile] = useState(true);

  // Check if user has completed profile setup
  useEffect(() => {
    const checkProfileStatus = async () => {
      console.log(`Checking profile status: currentUser=${!!currentUser}, isNewUser=${isNewUser}`);
      
      if (currentUser) {
        try {
          // For returning users (not new users), skip profile check
          if (!isNewUser) {
            console.log("Existing user login - skipping detailed profile check");
            setIsProfileComplete(true);
            setCheckingProfile(false);
            return;
          }

          // For new users, check if profile exists in Firestore
          console.log("New user - checking if profile exists");
          const userProfile = await firestoreService.getUserProfile(currentUser.uid);
          
          const isComplete = userProfile.success && 
                          userProfile.data && 
                          (userProfile.data.profileComplete ||
                          (userProfile.data.userName && 
                          userProfile.data.age && 
                          userProfile.data.gender));
          
          console.log("Profile complete check result:", isComplete);
          setIsProfileComplete(isComplete);
        } catch (error) {
          console.error("Error checking profile:", error);
          setIsProfileComplete(false);
        }
      } else {
        // No user logged in
        setIsProfileComplete(false);
      }
      
      setCheckingProfile(false);
    };

    checkProfileStatus();
  }, [currentUser, isNewUser]);
  
  // Determine which screen to show
  const renderMainContent = () => {
    // Still loading auth state
    if (loading || checkingAuth || checkingProfile) {
      return (
        <View style={loadingStyles.container}>
          <ActivityIndicator size="large" color="#007bff" />
          <Text style={loadingStyles.text}>Loading...</Text>
        </View>
      );
    }
    
    // User is authenticated
    if (currentUser) {
      // Profile is complete - show main app
      if (isProfileComplete) {
        return <AppNavigator />;
      }
      
      // Profile is incomplete - show registration
      return (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="RegisterProfile" component={RegisterPage} />
        </Stack.Navigator>
      );
    }
    
    // Not authenticated - show login/signup
    return <AuthStack />;
  };
  
  return (
    <NavigationContainer>
      <StatusBar style="auto" />
      {renderMainContent()}
    </NavigationContainer>
  );
};

// Loading screen styles
const loadingStyles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
  },
  text: {
    marginTop: 16,
    fontSize: 16,
    color: '#6c757d',
  },
});

// Main App component with AuthProvider
export default function App() {
  return (
    <AuthProvider>
      <FavoritesProvider>
        <RootNavigator />
      </FavoritesProvider>
    </AuthProvider>
  );
}