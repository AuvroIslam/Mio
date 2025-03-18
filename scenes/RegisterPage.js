import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../config/AuthContext';
import firestoreService from '../services/firestoreService';
import * as ImagePicker from 'expo-image-picker';

// Add education options
const EDUCATION_OPTIONS = [
  'High School',
  'College',
  'Undergraduate',
  'Post Graduate',
  'Working Professional',
  'Other'
];

// Full list of world countries for dropdown
const COUNTRIES = [
  'Afghanistan', 'Albania', 'Algeria', 'Andorra', 'Angola', 'Antigua and Barbuda', 'Argentina', 'Armenia', 'Australia', 'Austria', 
  'Azerbaijan', 'Bahamas', 'Bahrain', 'Bangladesh', 'Barbados', 'Belarus', 'Belgium', 'Belize', 'Benin', 'Bhutan', 
  'Bolivia', 'Bosnia and Herzegovina', 'Botswana', 'Brazil', 'Brunei', 'Bulgaria', 'Burkina Faso', 'Burundi', 'Cabo Verde', 'Cambodia', 
  'Cameroon', 'Canada', 'Central African Republic', 'Chad', 'Chile', 'China', 'Colombia', 'Comoros', 'Congo', 'Costa Rica', 
  'Croatia', 'Cuba', 'Cyprus', 'Czech Republic', 'Denmark', 'Djibouti', 'Dominica', 'Dominican Republic', 'Ecuador', 'Egypt', 
  'El Salvador', 'Equatorial Guinea', 'Eritrea', 'Estonia', 'Eswatini', 'Ethiopia', 'Fiji', 'Finland', 'France', 'Gabon', 
  'Gambia', 'Georgia', 'Germany', 'Ghana', 'Greece', 'Grenada', 'Guatemala', 'Guinea', 'Guinea-Bissau', 'Guyana', 
  'Haiti', 'Honduras', 'Hungary', 'Iceland', 'India', 'Indonesia', 'Iran', 'Iraq', 'Ireland', 'Israel', 
  'Italy', 'Jamaica', 'Japan', 'Jordan', 'Kazakhstan', 'Kenya', 'Kiribati', 'Korea, North', 'Korea, South', 'Kosovo', 
  'Kuwait', 'Kyrgyzstan', 'Laos', 'Latvia', 'Lebanon', 'Lesotho', 'Liberia', 'Libya', 'Liechtenstein', 'Lithuania', 
  'Luxembourg', 'Madagascar', 'Malawi', 'Malaysia', 'Maldives', 'Mali', 'Malta', 'Marshall Islands', 'Mauritania', 'Mauritius', 
  'Mexico', 'Micronesia', 'Moldova', 'Monaco', 'Mongolia', 'Montenegro', 'Morocco', 'Mozambique', 'Myanmar', 'Namibia', 
  'Nauru', 'Nepal', 'Netherlands', 'New Zealand', 'Nicaragua', 'Niger', 'Nigeria', 'North Macedonia', 'Norway', 'Oman', 
  'Pakistan', 'Palau', 'Palestine', 'Panama', 'Papua New Guinea', 'Paraguay', 'Peru', 'Philippines', 'Poland', 'Portugal', 
  'Qatar', 'Romania', 'Russia', 'Rwanda', 'Saint Kitts and Nevis', 'Saint Lucia', 'Saint Vincent and the Grenadines', 'Samoa', 'San Marino', 'Sao Tome and Principe', 
  'Saudi Arabia', 'Senegal', 'Serbia', 'Seychelles', 'Sierra Leone', 'Singapore', 'Slovakia', 'Slovenia', 'Solomon Islands', 'Somalia', 
  'South Africa', 'South Sudan', 'Spain', 'Sri Lanka', 'Sudan', 'Suriname', 'Sweden', 'Switzerland', 'Syria', 'Taiwan', 
  'Tajikistan', 'Tanzania', 'Thailand', 'Timor-Leste', 'Togo', 'Tonga', 'Trinidad and Tobago', 'Tunisia', 'Turkey', 'Turkmenistan', 
  'Tuvalu', 'Uganda', 'Ukraine', 'United Arab Emirates', 'United Kingdom', 'United States', 'Uruguay', 'Uzbekistan', 
  'Vanuatu', 'Vatican City', 'Venezuela', 'Vietnam', 'Yemen', 'Zambia', 'Zimbabwe'
];

const RegisterPage = ({ navigation }) => {
  const { currentUser, updateUserProfile, isNewUser, setLoading: setAuthLoading, resetIsNewUser } = useAuth();
  
  // Required fields
  const [displayName, setDisplayName] = useState(currentUser?.displayName || '');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState('');
  const [location, setLocation] = useState('');
  
  // Optional fields
  const [bio, setBio] = useState('');
  const [education, setEducation] = useState('');
  const [matchGender, setMatchGender] = useState('everyone');
  const [matchLocation, setMatchLocation] = useState('worldwide');
  const [profilePhoto, setProfilePhoto] = useState(null);
  
  // Bumble-style questions
  const [hotTake, setHotTake] = useState('');
  const [underratedAnime, setUnderratedAnime] = useState('');
  const [favoriteBand, setFavoriteBand] = useState('');
  
  // UI states
  const [loading, setLoading] = useState(false);
  const [showEducationOptions, setShowEducationOptions] = useState(false);
  const [showLocationOptions, setShowLocationOptions] = useState(false);
  const [locationFilter, setLocationFilter] = useState('');
  const [filteredLocations, setFilteredLocations] = useState(COUNTRIES);
  const [currentStep, setCurrentStep] = useState(1);
  const [progressPercentage, setProgressPercentage] = useState(0);
  
  // Handle location filter
  useEffect(() => {
    if (locationFilter) {
      const filtered = COUNTRIES.filter(country => 
        country.toLowerCase().includes(locationFilter.toLowerCase())
      );
      setFilteredLocations(filtered);
    } else {
      setFilteredLocations(COUNTRIES);
    }
  }, [locationFilter]);
  
  // Update progress percentage when step changes
  useEffect(() => {
    const totalSteps = 3;
    setProgressPercentage((currentStep / totalSteps) * 100);
  }, [currentStep]);
  
  // Clear loading state when RegisterPage mounts
  useEffect(() => {
    console.log("RegisterPage mounted - clearing loading state");
    setAuthLoading(false);
  }, [setAuthLoading]);
  
  // Ensure RegisterPage is not shown if profile is complete
  useEffect(() => {
    if (currentUser && currentUser.profileComplete) {
      // Profile is already complete, redirect to main app
      console.log("Profile already complete, should redirect to main app");
    }
  }, [currentUser, navigation]);
  
  const pickImage = async () => {
    try {
      // Request permissions
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      
      if (!permissionResult.granted) {
        Alert.alert('Permission Required', 'We need access to your photos to set your profile picture');
        return;
      }
      
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      
      if (!result.canceled && result.assets && result.assets.length > 0) {
        setProfilePhoto(result.assets[0].uri);
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Failed to select image: ' + (error.message || 'Unknown error'));
    }
  };
  
  const uploadPhoto = async (uri) => {
    if (!uri || !currentUser) return null;
    
    try {
      // Check file size before uploading
      const response = await fetch(uri);
      const blob = await response.blob();
      
      // Check if file is too large (greater than 5MB)
      if (blob.size > 5 * 1024 * 1024) {
        Alert.alert('File Too Large', 'Please select an image smaller than 5MB');
        return null;
      }
      
      // Upload to Cloudinary via firestore service
      const result = await firestoreService.uploadPhoto(uri, currentUser.uid, 0);
      
      if (!result.success) {
        Alert.alert('Upload Error', 'Failed to upload photo: ' + result.error);
        return null;
      }
      
      return result.url;
    } catch (error) {
      console.error('Error uploading photo:', error);
      return null;
    }
  };
  
  const validateStep = () => {
    if (currentStep === 1) {
      // Validate required fields in Step 1
      if (!displayName.trim()) {
        Alert.alert('Required Field', 'Please enter your display name');
        return false;
      }
      
      if (!age || isNaN(parseInt(age)) || parseInt(age) < 18) {
        Alert.alert('Required Field', 'Please enter a valid age (18+)');
        return false;
      }
      
      if (!gender) {
        Alert.alert('Required Field', 'Please select your gender');
        return false;
      }
    }
    
    if (currentStep === 2) {
      // Validate location in Step 2
      if (!location) {
        Alert.alert('Required Field', 'Please select your location');
        return false;
      }
    }
    
    return true;
  };
  
  const handleNext = () => {
    if (validateStep()) {
      setCurrentStep(currentStep + 1);
    }
  };
  
  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };
  
  const handleSubmit = async () => {
    if (!validateStep()) {
      return;
    }
    
    // Validate required fields
    if (!displayName.trim()) {
      Alert.alert('Required Field', 'Please enter your display name');
      return;
    }
    
    if (!age || isNaN(parseInt(age)) || parseInt(age) < 18) {
      Alert.alert('Required Field', 'Please enter a valid age (18+)');
      return;
    }
    
    if (!gender) {
      Alert.alert('Required Field', 'Please select your gender');
      return;
    }
    
    if (!location) {
      Alert.alert('Required Field', 'Please select your location');
      setCurrentStep(2); // Go back to step 2 where location is selected
      return;
    }
    
    try {
      setLoading(true);
      console.log("RegisterPage: Submitting profile data");
      
      // 1. Upload profile photo if selected
      let photoURL = null;
      if (profilePhoto) {
        photoURL = await uploadPhoto(profilePhoto);
      }
      
      // 2. Create user profile in Firestore FIRST
      const userData = {
        userName: displayName,
        bio: bio || '',
        age: parseInt(age),
        gender: gender,
        education: education || '',
        location: location || '',
        matchGender: matchGender,
        matchLocation: matchLocation,
        animeHotTake: hotTake || '',
        underratedAnime: underratedAnime || '',
        favoriteBand: favoriteBand || '',
        profileComplete: true
      };
      
      // Add photos array if photo was uploaded
      if (photoURL) {
        userData.photos = [{ url: photoURL }];
      }
      
      // Save to Firestore
      await firestoreService.updateUserProfile(currentUser.uid, userData);
      
      // 3. Then update auth profile
      await updateUserProfile({ 
        displayName: displayName,
        profileComplete: true
      });
      
      // 4. Explicitly reset isNewUser flag - this also resets loading state
      console.log("Profile complete, calling resetIsNewUser");
      resetIsNewUser();
      
      // 5. Show success message
      Alert.alert('Success', 'Your profile has been created!');
      
    } catch (error) {
      console.error('Error saving profile:', error);
      Alert.alert('Error', 'Failed to save profile: ' + error.message);
      setLoading(false);
    }
  };
  
  const handleSkip = () => {
    // If on final step, submit with minimal required data
    if (currentStep === 3) {
      handleSubmit();
    } else if (currentStep === 2) {
      // Check if location is provided before allowing to skip step 2
      if (!location) {
        Alert.alert('Required Field', 'Please select your location before continuing');
        return;
      }
      setCurrentStep(currentStep + 1);
    } else {
      // Otherwise go to next step
      setCurrentStep(currentStep + 1);
    }
  };
  
  const renderStep1 = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>Basic Information</Text>
      <Text style={styles.stepDescription}>Tell us about yourself. You can change this information later in your profile settings.</Text>
      
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Display Name*</Text>
        <TextInput
          style={styles.input}
          placeholder="Enter your display name"
          value={displayName}
          onChangeText={setDisplayName}
          maxLength={30}
        />
      </View>
      
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Age* (must be 18+)</Text>
        <TextInput
          style={styles.input}
          placeholder="Enter your age"
          value={age}
          onChangeText={setAge}
          keyboardType="numeric"
          maxLength={3}
        />
      </View>
      
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Gender*</Text>
        <View style={styles.radioContainer}>
          <TouchableOpacity 
            style={[styles.radioButton, gender === 'male' && styles.radioSelected]}
            onPress={() => setGender('male')}
          >
            <Text style={[styles.radioText, gender === 'male' && styles.radioTextSelected]}>
              Male
            </Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.radioButton, gender === 'female' && styles.radioSelected]}
            onPress={() => setGender('female')}
          >
            <Text style={[styles.radioText, gender === 'female' && styles.radioTextSelected]}>
              Female
            </Text>
          </TouchableOpacity>
        </View>
      </View>
      
      <View style={styles.inputGroup}>
        <Text style={styles.label}>I want to match with</Text>
        <View style={styles.radioContainer}>
          <TouchableOpacity 
            style={[styles.radioButton, matchGender === 'male' && styles.radioSelected]}
            onPress={() => setMatchGender('male')}
          >
            <Text style={[styles.radioText, matchGender === 'male' && styles.radioTextSelected]}>
              Men
            </Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.radioButton, matchGender === 'female' && styles.radioSelected]}
            onPress={() => setMatchGender('female')}
          >
            <Text style={[styles.radioText, matchGender === 'female' && styles.radioTextSelected]}>
              Women
            </Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.radioButton, matchGender === 'everyone' && styles.radioSelected]}
            onPress={() => setMatchGender('everyone')}
          >
            <Text style={[styles.radioText, matchGender === 'everyone' && styles.radioTextSelected]}>
              Everyone
            </Text>
          </TouchableOpacity>
        </View>
      </View>
      
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Match location</Text>
        <View style={styles.radioContainer}>
          <TouchableOpacity 
            style={[styles.radioButton, matchLocation === 'local' && styles.radioSelected]}
            onPress={() => setMatchLocation('local')}
          >
            <Text style={[styles.radioText, matchLocation === 'local' && styles.radioTextSelected]}>
              Local only
            </Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.radioButton, matchLocation === 'worldwide' && styles.radioSelected]}
            onPress={() => setMatchLocation('worldwide')}
          >
            <Text style={[styles.radioText, matchLocation === 'worldwide' && styles.radioTextSelected]}>
              Worldwide
            </Text>
          </TouchableOpacity>
        </View>
      </View>
      
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Add a Profile Photo</Text>
        <TouchableOpacity
          style={styles.photoSelector}
          onPress={pickImage}
        >
          {profilePhoto ? (
            <Image
              source={{ uri: profilePhoto }}
              style={styles.photoImage}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.photoPlaceholder}>
              <Ionicons name="camera" size={40} color="#ccc" />
              <Text style={styles.photoPlaceholderText}>Tap to select a photo</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
  
  const renderStep2 = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>More About You</Text>
      <Text style={styles.stepDescription}>Help others get to know you</Text>
      
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Bio (max 150 characters)</Text>
        <TextInput
          style={styles.bioInput}
          placeholder="Write a short bio about yourself..."
          value={bio}
          onChangeText={setBio}
          multiline
          maxLength={150}
        />
        <Text style={styles.charCount}>{bio.length}/150</Text>
      </View>
      
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Education</Text>
        <TouchableOpacity
          style={styles.pickerButton}
          onPress={() => setShowEducationOptions(true)}
        >
          <Text style={education ? styles.pickerText : styles.pickerPlaceholder}>
            {education || 'Select your education level'}
          </Text>
          <Ionicons name="chevron-down" size={24} color="#007bff" />
        </TouchableOpacity>
      </View>
      
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Location*</Text>
        <TouchableOpacity
          style={styles.pickerButton}
          onPress={() => setShowLocationOptions(true)}
        >
          <Text style={location ? styles.pickerText : styles.pickerPlaceholder}>
            {location || 'Select your location'}
          </Text>
          <Ionicons name="location" size={24} color="#007bff" />
        </TouchableOpacity>
      </View>
      
      {showEducationOptions && (
        <View style={styles.optionsOverlay}>
          <View style={styles.optionsContainer}>
            <Text style={styles.optionsTitle}>Select Education</Text>
            <ScrollView style={styles.optionsList}>
              {EDUCATION_OPTIONS.map((option, index) => (
                <TouchableOpacity
                  key={index}
                  style={styles.optionItem}
                  onPress={() => {
                    setEducation(option);
                    setShowEducationOptions(false);
                  }}
                >
                  <Text style={styles.optionText}>{option}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => setShowEducationOptions(false)}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
      
      {showLocationOptions && (
        <View style={styles.optionsOverlay}>
          <View style={styles.optionsContainer}>
            <Text style={styles.optionsTitle}>Select Location</Text>
            <TextInput
              style={styles.searchInput}
              placeholder="Search locations..."
              value={locationFilter}
              onChangeText={setLocationFilter}
            />
            <ScrollView style={styles.optionsList}>
              {filteredLocations.map((country, index) => (
                <TouchableOpacity
                  key={index}
                  style={styles.optionItem}
                  onPress={() => {
                    setLocation(country);
                    setShowLocationOptions(false);
                  }}
                >
                  <Text style={styles.optionText}>{country}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => {
                setShowLocationOptions(false);
                setLocationFilter('');
              }}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
  
  const renderStep3 = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>Tell Us About Your Anime Preferences</Text>
      <Text style={styles.stepDescription}>Help others connect with you</Text>
      
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Your hot take about any anime</Text>
        <TextInput
          style={styles.bioInput}
          placeholder="Share your controversial opinion..."
          value={hotTake}
          onChangeText={setHotTake}
          multiline
        />
      </View>
      
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Your most underrated anime</Text>
        <TextInput
          style={styles.bioInput}
          placeholder="What amazing anime are people missing out on?"
          value={underratedAnime}
          onChangeText={setUnderratedAnime}
          multiline
        />
      </View>
      
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Favorite band or music artist</Text>
        <TextInput
          style={styles.input}
          placeholder="Who do you love listening to?"
          value={favoriteBand}
          onChangeText={setFavoriteBand}
        />
      </View>
    </View>
  );
  
  const renderCurrentStep = () => {
    switch (currentStep) {
      case 1:
        return renderStep1();
      case 2:
        return renderStep2();
      case 3:
        return renderStep3();
      default:
        return null;
    }
  };
  
  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Complete Your Profile</Text>
        </View>
        
        <View style={styles.progressContainer}>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${progressPercentage}%` }]} />
          </View>
          <Text style={styles.progressText}>Step {currentStep} of 3</Text>
        </View>
        
        {renderCurrentStep()}
        
        <View style={styles.buttonsContainer}>
          {currentStep > 1 && (
            <TouchableOpacity 
              style={styles.backButton}
              onPress={handleBack}
            >
              <Text style={styles.backButtonText}>Back</Text>
            </TouchableOpacity>
          )}
          
          {currentStep < 3 ? (
            <>
              <TouchableOpacity 
                style={styles.skipButton}
                onPress={handleSkip}
              >
                <Text style={styles.skipButtonText}>Skip</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={styles.nextButton}
                onPress={handleNext}
              >
                <Text style={styles.nextButtonText}>Next</Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity 
              style={[styles.submitButton, loading && styles.disabledButton]}
              onPress={handleSubmit}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.submitButtonText}>Complete Profile</Text>
              )}
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  scrollContainer: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 20,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
  },
  progressContainer: {
    marginBottom: 20,
  },
  progressBar: {
    height: 8,
    backgroundColor: '#e9ecef',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#007bff',
  },
  progressText: {
    marginTop: 8,
    fontSize: 14,
    color: '#6c757d',
    textAlign: 'right',
  },
  stepContainer: {
    marginBottom: 20,
  },
  stepTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#343a40',
  },
  stepDescription: {
    fontSize: 16,
    color: '#6c757d',
    marginBottom: 20,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    marginBottom: 8,
    fontWeight: '500',
    color: '#495057',
  },
  input: {
    height: 50,
    borderWidth: 1,
    borderColor: '#ced4da',
    borderRadius: 8,
    paddingHorizontal: 12,
    backgroundColor: 'white',
    fontSize: 16,
  },
  bioInput: {
    borderWidth: 1,
    borderColor: '#ced4da',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: 'white',
    minHeight: 100,
    fontSize: 16,
    textAlignVertical: 'top',
  },
  charCount: {
    alignSelf: 'flex-end',
    fontSize: 12,
    color: '#6c757d',
    marginTop: 4,
  },
  radioContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  radioButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginRight: 10,
    marginBottom: 10,
    backgroundColor: '#e9ecef',
  },
  radioSelected: {
    backgroundColor: '#007bff',
  },
  radioText: {
    color: '#495057',
    fontWeight: '500',
  },
  radioTextSelected: {
    color: 'white',
  },
  photoSelector: {
    width: '100%',
    height: 200,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#e9ecef',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#dee2e6',
  },
  photoPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoPlaceholderText: {
    marginTop: 12,
    fontSize: 16,
    color: '#adb5bd',
    textAlign: 'center',
  },
  photoImage: {
    width: '100%',
    height: '100%',
  },
  pickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#ced4da',
    borderRadius: 8,
    backgroundColor: 'white',
  },
  pickerText: {
    fontSize: 16,
    color: '#212529',
  },
  pickerPlaceholder: {
    fontSize: 16,
    color: '#adb5bd',
  },
  optionsOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999,
  },
  optionsContainer: {
    width: '90%',
    maxHeight: '80%',
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 20,
  },
  optionsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
  },
  optionsList: {
    maxHeight: 300,
  },
  optionItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  optionText: {
    fontSize: 16,
    color: '#212529',
  },
  searchInput: {
    borderWidth: 1,
    borderColor: '#ced4da',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    backgroundColor: '#f8f9fa',
  },
  cancelButton: {
    marginTop: 16,
    paddingVertical: 12,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#007bff',
    fontSize: 16,
    fontWeight: '500',
  },
  buttonsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
  },
  backButton: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: '#6c757d',
    borderRadius: 8,
  },
  backButtonText: {
    color: '#6c757d',
    fontSize: 16,
    fontWeight: '500',
  },
  skipButton: {
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  skipButtonText: {
    color: '#6c757d',
    fontSize: 16,
  },
  nextButton: {
    backgroundColor: '#007bff',
    paddingVertical: 14,
    paddingHorizontal: 30,
    borderRadius: 8,
  },
  nextButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  submitButton: {
    flex: 1,
    backgroundColor: '#28a745',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  disabledButton: {
    backgroundColor: '#8dd9a1',
  },
  submitButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default RegisterPage; 