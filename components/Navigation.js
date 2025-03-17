import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import Inbox from '../scenes/Inbox';
import { getFocusedRouteNameFromRoute } from '@react-navigation/native';

// Import screens
import Home from '../scenes/Home';
import Profile from '../scenes/Profile';
import ChatRoom from '../scenes/ChatRoom';
import Matched from '../scenes/Matched'; // New Matched screen
import UserProfile from '../scenes/UserProfile'; // New UserProfile screen
import EditProfile from '../scenes/EditProfile'; // Import EditProfile screen
import AnimeDetails from '../scenes/AnimeDetails';

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

// Home Stack Navigator
const HomeStack = () => {
  return (
    <Stack.Navigator>
      <Stack.Screen 
        name="HomeScreen" 
        component={Home} 
        options={{ title: 'Discover Anime' }}
      />
      <Stack.Screen
        name="AnimeDetails"
        component={AnimeDetails}
        options={({ route }) => ({ 
          title: route.params?.anime?.title || 'Anime Details',
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
          
          return <Ionicons name={iconName} size={size} color={color} />;
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

export default AppNavigator;
