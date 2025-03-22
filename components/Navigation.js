import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { ActivityIndicator, View, Text, StyleSheet } from 'react-native';
import Icon from './Icon';
import Inbox from '../scenes/Inbox';
import { getFocusedRouteNameFromRoute } from '@react-navigation/native';
import { useAuth } from '../config/AuthContext';
import firestoreService from '../services/firestoreService';

// Import screens
import Home from '../scenes/Home';
import Profile from '../scenes/Profile';
import ChatRoom from '../scenes/ChatRoom';
import Matched from '../scenes/Matched'; // New Matched screen
import UserProfile from '../scenes/UserProfile'; // New UserProfile screen
import EditProfile from '../scenes/EditProfile'; // Import EditProfile screen
import AnimeDetails from '../scenes/AnimeDetails';
import DramaDetails from '../scenes/DramaDetails';
import Login from '../scenes/login';
import Signup from '../scenes/signup';
import RegisterPage from '../scenes/RegisterPage';

const Tab = createBottomTabNavigator();
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

// Home Stack Navigator
const HomeStack = () => {
  return (
    <Stack.Navigator>
      <Stack.Screen 
        name="HomeScreen" 
        component={Home} 
        options={{ title: 'Discover Content' }}
      />
      <Stack.Screen
        name="AnimeDetails"
        component={AnimeDetails}
        options={({ route }) => ({ 
          title: route.params?.anime?.title || 'Anime Details',
          headerShown: false
        })}
      />
      <Stack.Screen
        name="DramaDetails"
        component={DramaDetails}
        options={({ route }) => ({ 
          title: route.params?.drama?.name || 'Drama Details',
          headerShown: false
        })}
      />
    </Stack.Navigator>
  );
};

// Profile Stack Navigator
const ProfileStack = () => {
  return (
    <Stack.Navigator>
      <Stack.Screen 
        name="ProfileScreen" 
        component={Profile} 
        options={{ title: 'Profile' }}
      />
      <Stack.Screen 
        name="EditProfile" 
        component={EditProfile} 
        options={{ title: 'Edit Profile' }}
      />
      <Stack.Screen
        name="AnimeDetails"
        component={AnimeDetails}
        options={({ route }) => ({ 
          title: route.params?.anime?.title || 'Anime Details',
          headerShown: false
        })}
      />
      <Stack.Screen
        name="DramaDetails"
        component={DramaDetails}
        options={({ route }) => ({ 
          title: route.params?.drama?.name || 'Drama Details',
          headerShown: false
        })}
      />
    </Stack.Navigator>
  );
};

// Chat Stack Navigator
const ChatStack = () => {
  return (
    <Stack.Navigator>
      <Stack.Screen 
        name="Inbox" 
        component={Inbox} 
        options={{ title: 'Messages' }}
      />
      <Stack.Screen 
        name="ChatRoom" 
        component={ChatRoom}
        options={({ route }) => ({ 
          title: route.params?.userName || 'Chat',
          // Hide the bottom tab bar when in chat room
          tabBarStyle: { display: 'none' }
        })}
      />
      {/* Also add UserProfile to the ChatStack so users can view profiles from chats */}
      <Stack.Screen
        name="UserProfile"
        component={UserProfile}
        options={({ route }) => ({ title: route.params?.userName || 'User Profile' })}
      />
    </Stack.Navigator>
  );
};

// Matched Stack Navigator
const MatchedStack = () => {
  return (
    <Stack.Navigator>
      <Stack.Screen 
        name="MatchedScreen" 
        component={Matched} 
        options={{ title: 'Matched Fans' }}
      />
      <Stack.Screen
        name="UserProfile"
        component={UserProfile}
        options={({ route }) => ({ title: route.params?.userName || 'User Profile' })}
      />
    </Stack.Navigator>
  );
};

// Main Tab Navigator
const AppNavigator = () => {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;
          
          if (route.name === 'Home') {
            iconName = focused ? 'home' : 'home-outline';
          } else if (route.name === 'Chat') {
            iconName = focused ? 'chatbubbles' : 'chatbubbles-outline';
          } else if (route.name === 'Profile') {
            iconName = focused ? 'person' : 'person-outline';
          } else if (route.name === 'Matched') {
            iconName = focused ? 'people' : 'people-outline';
          }
          
          return <Icon type="ionicons" name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: '#007bff',
        tabBarInactiveTintColor: 'gray',
        tabBarLabelStyle: {
          fontSize: 12,
        },
        tabBarStyle: {
          paddingVertical: 5,
        },
      })}
    >
      <Tab.Screen 
        name="Home" 
        component={HomeStack} 
        options={{ headerShown: false }}
      />
      <Tab.Screen 
        name="Matched" 
        component={MatchedStack} 
        options={{ headerShown: false }}
      />
      <Tab.Screen 
        name="Chat" 
        component={ChatStack} 
        options={({ route }) => {
          const routeName = getFocusedRouteNameFromRoute(route) ?? '';
          return {
            headerShown: false,
            tabBarStyle: routeName === 'ChatRoom' 
              ? { display: 'none' } 
              : undefined
          };
        }}
      />
      <Tab.Screen 
        name="Profile" 
        component={ProfileStack} 
        options={{ headerShown: false }}
      />
    </Tab.Navigator>
  );
};

// Main Navigation Component
const Navigation = () => {
  const { currentUser, loading, isNewUser, checkingAuth } = useAuth();
  const [isProfileComplete, setIsProfileComplete] = React.useState(false);
  const [checkingProfile, setCheckingProfile] = React.useState(true);
  
  // Check if user has completed profile setup
  React.useEffect(() => {
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
        <View style={styles.container}>
          <ActivityIndicator size="large" color="#007bff" />
          <Text style={styles.text}>Loading...</Text>
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
  
  return renderMainContent();
};

// Loading screen styles
const styles = StyleSheet.create({
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

export default Navigation;
