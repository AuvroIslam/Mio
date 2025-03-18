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
  const [isNewUser, setIsNewUser] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  // Function to sign up a new user
  const signup = async (email, password) => {
    try {
      // Set isNewUser before creating the account
      setIsNewUser(true);
      
      // Create new user account
      const result = await createUserWithEmailAndPassword(auth, email, password);
      console.log("Signup successful, user is new");
      
      return result;
    } catch (error) {
      setIsNewUser(false);
      console.log("Signup error:", error.message);
      throw error;
    }
  };

  // Function to log in a user
  const login = async (email, password) => {
    setLoading(true);
    try {
      // This is an existing user, not a new one
      setIsNewUser(false);
      console.log("Login attempt for existing user");
      const result = await signInWithEmailAndPassword(auth, email, password);
      return result;
    } catch (error) {
      setLoading(false);
      throw error;
    }
  };

  // Function to log out the current user
  const logout = async () => {
    try {
      setLoading(true);
      setIsNewUser(false);
      console.log("Logout initiated");
      
      // Sign out from Firebase
      await signOut(auth);
      setLoading(false);
      
      return true;
    } catch (error) {
      console.error("Logout error:", error);
      setLoading(false);
      throw error;
    }
  };

  // Function to reset password
  const resetPassword = (email) => {
    return sendPasswordResetEmail(auth, email);
  };

  const updateUserProfile = async (updateData) => {
    try {
      await updateProfile(auth.currentUser, updateData);
      
      // If profile is marked as complete, reset isNewUser flag
      if (updateData.profileComplete) {
        console.log("Profile marked as complete, resetting isNewUser flag");
        setIsNewUser(false);
        // Force refresh the current user to include the profileComplete flag
        setCurrentUser({ ...auth.currentUser, ...updateData });
      } else {
        // Still update the current user state to reflect changes
        setCurrentUser({ ...auth.currentUser, ...updateData });
      }
      
      return true;
    } catch (error) {
      console.error("Profile update error:", error);
      throw error; 
    }
  };

  // Expose a function to explicitly reset the isNewUser flag and loading state
  const resetIsNewUser = () => {
    console.log("Explicitly resetting isNewUser flag and loading state");
    setIsNewUser(false);
    setLoading(false);
  };

  // Effect to handle auth state changes
  useEffect(() => {
    console.log("Setting up auth state listener");
    // Subscribe to auth state changes
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      console.log(`Auth state changed: user=${user ? 'authenticated' : 'unauthenticated'}, isNewUser=${isNewUser}`);
      setCurrentUser(user);
      setCheckingAuth(false);
      
      // If user is null (logged out) or not a new user, set loading to false
      if (!user || !isNewUser) {
        setLoading(false);
      }
    });

    // Cleanup subscription on unmount
    return unsubscribe;
  }, [isNewUser]);

  // Create value object with all auth functionality
  const value = {
    currentUser,
    login,
    signup,
    logout,
    resetPassword,
    loading,
    updateUserProfile,
    isNewUser,
    setLoading,
    checkingAuth,
    resetIsNewUser
  };

  return (
    <AuthContext.Provider value={value}>
      {!checkingAuth && children}
    </AuthContext.Provider>
  );
};