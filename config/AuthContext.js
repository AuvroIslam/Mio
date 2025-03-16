import React, { createContext, useContext, useState, useEffect } from 'react';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  sendPasswordResetEmail,
  updateProfile
} from 'firebase/auth';
import { auth } from './firebaseConfig';

// Create the AuthContext
const AuthContext = createContext();

// Custom hook to use the auth context
export const useAuth = () => {
  return useContext(AuthContext);
};

// AuthProvider component to wrap our app and provide auth context
export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Function to sign up a new user
  const signup = (email, password) => {
    return createUserWithEmailAndPassword(auth, email, password);
  };

  // Function to log in a user
  const login = (email, password) => {
    return signInWithEmailAndPassword(auth, email, password);
  };

  // Function to log out the current user
  const logout = () => {
    return signOut(auth);
  };

  // Function to reset password
  const resetPassword = (email) => {
    return sendPasswordResetEmail(auth, email);
  };

  const updateUserProfile = async (updateData) => {
    try {
      await updateProfile(auth.currentUser, updateData);
      // Update the current user state to reflect changes
      setCurrentUser({ ...auth.currentUser, ...updateData });
    } catch (error) {
      throw error; // Throw error to be caught in the component
    }
  };

  // Effect to handle auth state changes
  useEffect(() => {
    // Subscribe to auth state changes
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setLoading(false);
    });

    // Cleanup subscription on unmount
    return unsubscribe;
  }, []);

  // Create value object with all auth functionality
  const value = {
    currentUser,
    login,
    signup,
    logout,
    resetPassword,
    loading,
    updateUserProfile
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};