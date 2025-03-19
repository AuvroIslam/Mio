import React, { useState } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  StyleSheet,
  Alert,
  ActivityIndicator
} from 'react-native';
import { useAuth } from '../config/AuthContext';
import { auth } from '../config/firebaseConfig';
import firestoreService from '../services/firestoreService';

const Login = ({ navigation }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  
  const { login, resetPassword } = useAuth();

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please enter both email and password');
      return;
    }
    
    try {
      console.log('==========================================');
      console.log('LOGIN PROCESS STARTED');
      setLoading(true);
      
      const userCredential = await login(email, password);
      console.log('LOGIN SUCCESSFUL - USER:', userCredential.user.uid);
      
      setTimeout(async () => {
        try {
          if (auth.currentUser) {
            console.log('CHECKING SUBSCRIPTION DATA AFTER LOGIN');
            console.log('USER:', auth.currentUser.uid);
            
            const response = await firestoreService.getUserSubscription(auth.currentUser.uid);
            
            console.log('SUBSCRIPTION DATA AFTER LOGIN:');
            console.log(JSON.stringify(response.data, null, 2));
            
            if (response.data && response.data.counterStartedAt) {
              const now = new Date();
              const cooldownStarted = new Date(response.data.counterStartedAt);
              const secondsSinceStart = Math.floor((now - cooldownStarted) / 1000);
              
              console.log('COOLDOWN STATUS: ACTIVE');
              console.log('COOLDOWN START TIME:', cooldownStarted.toISOString());
              console.log('SECONDS ELAPSED:', secondsSinceStart);
              console.log('REMAINING SECONDS:', Math.max(0, 120 - secondsSinceStart));
              console.log('CHANGES THIS WEEK:', response.data.changesThisWeek);
            } else {
              console.log('COOLDOWN STATUS: INACTIVE');
            }
            
            console.log('LOGIN CHECK COMPLETE');
            console.log('==========================================');
          }
        } catch (error) {
          console.error('Error checking subscription data:', error);
        }
      }, 1000);
      
    } catch (error) {
      let errorMessage = 'Failed to login';
      
      switch(error.code) {
        case 'auth/user-not-found':
        case 'auth/wrong-password':
          errorMessage = 'Invalid email or password';
          break;
        default:
          errorMessage = error.message;
      }
      
      console.log('LOGIN ERROR:', error.code, error.message);
      console.log('==========================================');
      Alert.alert('Login Error', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      Alert.alert('Error', 'Please enter your email address to reset password');
      return;
    }

    try {
      setLoading(true);
      await resetPassword(email);
      Alert.alert('Success', 'Password reset email sent! Check your inbox');
    } catch (error) {
      let errorMessage = 'Failed to send reset email';
      switch(error.code) {
        case 'auth/invalid-email':
          errorMessage = 'Please enter a valid email address';
          break;
        case 'auth/user-not-found':
          errorMessage = 'No account found with this email';
          break;
        default:
          errorMessage = error.message;
      }
      Alert.alert('Password Reset Error', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Welcome Back!</Text>
      
      <TextInput
        style={styles.input}
        placeholder="Email"
        keyboardType="email-address"
        autoCapitalize="none"
        value={email}
        onChangeText={setEmail}
      />

      <TextInput
        style={styles.input}
        placeholder="Password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      <TouchableOpacity 
        style={styles.forgotPassword}
        onPress={handleForgotPassword}
      >
        <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
      </TouchableOpacity>

      <TouchableOpacity 
        style={[styles.button, loading && styles.buttonDisabled]} 
        onPress={handleLogin}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Login</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity onPress={() => navigation.navigate('Signup')}>
        <Text style={styles.linkText}>
          Don't have an account? Sign Up
        </Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
    backgroundColor: '#f5f5f5',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 30,
    textAlign: 'center',
  },
  input: {
    height: 50,
    borderColor: '#ddd',
    borderWidth: 1,
    marginBottom: 15,
    padding: 15,
    borderRadius: 8,
    backgroundColor: '#fff',
  },
  button: {
    backgroundColor: '#007bff',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 15,
  },
  buttonDisabled: {
    backgroundColor: '#7fb7ff',
  },
  buttonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  forgotPassword: {
    alignSelf: 'flex-end',
    marginBottom: 15,
  },
  forgotPasswordText: {
    color: '#007bff',
    fontSize: 14,
  },
  linkText: {
    color: '#007bff',
    textAlign: 'center',
    marginTop: 10,
  },
});

export default Login;