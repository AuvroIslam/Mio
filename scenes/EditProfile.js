import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Modal,
  ScrollView,
  TextInput,
  Image,
  Dimensions
} from 'react-native';
import { useAuth } from '../config/AuthContext';
import firestoreService from '../services/firestoreService';
import * as ImagePicker from 'expo-image-picker';
import LoadingModal from '../components/LoadingModal';
import Icon from '../components/Icon';

// Get window dimensions once at the module level
const { width: windowWidth } = Dimensions.get('window');

// Add education options
const EDUCATION_OPTIONS = [
  'High School',
  'College',
  'Undergraduate',
  'Post Graduate',
  'Working Professional',
  'Other'
];

const EditProfile = ({ navigation }) => {
  const [loading, setLoading] = useState(false);
  const [gender, setGender] = useState('');
  const [age, setAge] = useState('');
  const [education, setEducation] = useState('');
  const [bio, setBio] = useState('');
  const [location, setLocation] = useState('');
  const [showEducationOptions, setShowEducationOptions] = useState(false);
  const [photos, setPhotos] = useState([]);
  const [tempPhoto, setTempPhoto] = useState(null);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [matchGender, setMatchGender] = useState('everyone');
  const [matchLocation, setMatchLocation] = useState('worldwide');
  const [hotTake, setHotTake] = useState('');
  const [underratedAnime, setUnderratedAnime] = useState('');
  const [favoriteBand, setFavoriteBand] = useState('');
  
  const { currentUser } = useAuth();
  
  // Load user profile when component mounts
  useEffect(() => {
    if (currentUser) {
      loadUserProfile();
    }
  }, [currentUser]);
  
  const loadUserProfile = async () => {
    if (!currentUser) return;
    
    try {
      setLoading(true);
      
      const result = await firestoreService.getUserProfile(currentUser.uid);
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to load profile');
      }
      
      const userData = result.data;
      
      // Set profile data
      setGender(userData.gender || '');
      setAge(userData.age ? userData.age.toString() : '');
      setEducation(userData.education || '');
      setBio(userData.bio || '');
      setLocation(userData.location || '');
      setPhotos(userData.photos || []);
      setMatchGender(userData.matchGender || 'everyone');
      setMatchLocation(userData.matchLocation || 'worldwide');
      setHotTake(userData.hotTake || '');
      setUnderratedAnime(userData.underratedAnime || '');
      setFavoriteBand(userData.favoriteBand || '');
    } catch (error) {
      console.error('Error loading profile:', error);
      Alert.alert('Error', 'Failed to load profile: ' + error.message);
    } finally {
      setLoading(false);
    }
  };
  
  const pickImage = async () => {
    try {
      // Request permissions
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      
      if (!permissionResult.granted) {
        Alert.alert('Permission Required', 'We need access to your photos to update your profile pictures');
        return;
      }
      
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: photoIndex === 0 ? [1, 1] : [4, 3],
        quality: 0.8,
      });
      
      if (!result.canceled && result.assets && result.assets.length > 0) {
        setTempPhoto(result.assets[0].uri);
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Failed to select image: ' + (error.message || 'Unknown error'));
    }
  };

  // Add takePicture function
  const takePicture = async () => {
    try {
      // Request camera permissions
      const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
      
      if (!permissionResult.granted) {
        Alert.alert('Permission Required', 'We need access to your camera to take profile pictures');
        return;
      }
      
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: photoIndex === 0 ? [1, 1] : [4, 3],
        quality: 0.8,
      });
      
      if (!result.canceled && result.assets && result.assets.length > 0) {
        setTempPhoto(result.assets[0].uri);
      }
    } catch (error) {
      console.error('Error taking picture:', error);
      Alert.alert('Error', 'Failed to take picture: ' + (error.message || 'Unknown error'));
    }
  };

  const uploadPhoto = async (uri) => {
    if (!uri || !currentUser) return null;
    
    try {
      setLoading(true);
      
      // Check file size before uploading
      const response = await fetch(uri);
      const blob = await response.blob();
      
      // Check if file is too large (greater than 5MB)
      if (blob.size > 5 * 1024 * 1024) {
        Alert.alert('File Too Large', 'Please select an image smaller than 5MB');
        return false;
      }
      
      // Upload to Cloudinary via firestore service
      const result = await firestoreService.uploadPhoto(uri, currentUser.uid, photoIndex);
      
      if (!result.success) {
        Alert.alert('Upload Error', 'Failed to upload photo: ' + result.error);
        return false;
      }
      
      // Update photos array with the result from Cloudinary
      const updatedPhotos = [...photos];
      
      // Ensure we don't exceed 3 photos
      if (photoIndex >= updatedPhotos.length) {
        if (updatedPhotos.length >= 3) {
          Alert.alert('Photo Limit Reached', 'You can only have up to 3 photos');
          return false;
        }
        updatedPhotos.push(result.url);
      } else {
        updatedPhotos[photoIndex] = result.url;
      }
      
      // Update local state
      setPhotos(updatedPhotos);
      setTempPhoto(null);
      setShowProfileModal(false);
      
      return true;
    } catch (error) {
      console.error('Error uploading photo:', error);
      Alert.alert('Upload Error', 'Failed to upload photo: ' + error.message);
      return false;
    } finally {
      setLoading(false);
    }
  };

  const removePhoto = async (index) => {
    try {
      setLoading(true);
      
      // Use firestoreService to delete photo
      const result = await firestoreService.deletePhoto(currentUser.uid, index);
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to delete photo');
      }
      
      // Update local state
      await loadUserProfile(); // Reload the entire profile for consistency
      setShowProfileModal(false);
    } catch (error) {
      console.error('Error removing photo:', error);
      Alert.alert('Error', 'Failed to remove photo: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const saveProfile = async () => {
    try {
      // Validate bio
      if (bio && bio.length > 150) {
        Alert.alert('Error', 'Bio should be maximum 150 characters');
        return;
      }
      
      // Validate age
      const ageValue = parseInt(age);
      if (isNaN(ageValue) || ageValue < 18) {
        Alert.alert('Error', 'You must enter a valid age (18+)');
        return;
      }
      
      setLoading(true);
      
      // Update profile in Firestore
      const updates = {
        age: ageValue,
        education,
        bio,
        matchGender,
        matchLocation,
        hotTake,
        underratedAnime,
        favoriteBand
      };
      
      const result = await firestoreService.updateUserProfile(currentUser.uid, updates);
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to update profile');
      }
      
      // Call updateBidirectionalMatches to refresh matches after profile update
      await firestoreService.updateBidirectionalMatches(currentUser.uid);
      
      Alert.alert('Success', 'Profile updated successfully');
      
      // Reload profile to ensure UI is consistent with database
      await loadUserProfile();
      
      // Return to profile screen
      navigation.goBack();
    } catch (error) {
      console.error('Error saving profile:', error);
      Alert.alert('Error', 'Failed to save profile: ' + error.message);
    } finally {
      setLoading(false);
    }
  };
  
  const renderPhotoSelector = (index, title) => {
    const hasPhoto = photos && photos[index] && photos[index].url;
    
    return (
      <TouchableOpacity
        style={styles.photoSelector}
        onPress={() => {
          setPhotoIndex(index);
          setShowProfileModal(true);
        }}
      >
        {hasPhoto ? (
          <Image 
            source={{ uri: photos[index].url }} 
            style={styles.photoImage} 
            resizeMode="cover"
          />
        ) : (
          <View style={styles.photoPlaceholder}>
            <Icon type="ionicons" name="image-outline" size={40} color="#adb5bd" />
            <Text style={styles.photoPlaceholderText}>{title}</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <>
      <ScrollView style={styles.container}>
        <Text style={styles.sectionTitle}>Profile Photos</Text>
        <Text style={styles.sectionDescription}>
          Add up to 3 photos. First will be your profile picture.
        </Text>
        
        <View style={styles.photoRow}>
          {renderPhotoSelector(0, 'Profile Photo')}
          {renderPhotoSelector(1, 'Photo 2')}
          {renderPhotoSelector(2, 'Photo 3')}
        </View>
        
        <Text style={styles.sectionTitle}>Personal Information</Text>
        
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Gender</Text>
          <View style={styles.staticField}>
            <Text style={styles.staticFieldText}>
              {gender === 'male' ? 'Male' : gender === 'female' ? 'Female' : 'Not specified'}
            </Text>
            <Text style={styles.staticFieldNote}>(Cannot be changed)</Text>
          </View>
        </View>
        
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Age (must be 18+)</Text>
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
          <Text style={styles.label}>Education</Text>
          <TouchableOpacity
            style={styles.pickerButton}
            onPress={() => setShowEducationOptions(true)}
          >
            <Text style={education ? styles.pickerText : styles.pickerPlaceholder}>
              {education || 'Select your education level'}
            </Text>
            <Icon type="ionicons" name="chevron-down" size={20} color="#6c757d" />
          </TouchableOpacity>
        </View>
        
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Location</Text>
          <View style={styles.staticField}>
            <Text style={styles.staticFieldText}>
              {location || 'Not specified'}
            </Text>
            <Text style={styles.staticFieldNote}>(Cannot be changed)</Text>
          </View>
        </View>
        
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
        
        <Text style={styles.sectionTitle}>Match Preferences</Text>
        
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
        
        <TouchableOpacity
          style={styles.saveButton}
          onPress={saveProfile}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.saveButtonText}>Save Changes</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
      
      {/* Show loading modal when loading */}
      <LoadingModal
        visible={loading}
        message="Saving profile changes..."
      />

      {/* Education Options Modal */}
      <Modal
        transparent={true}
        visible={showEducationOptions}
        onRequestClose={() => setShowEducationOptions(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Select Education</Text>
            {EDUCATION_OPTIONS.map((option) => (
              <TouchableOpacity
                key={option}
                style={styles.educationOption}
                onPress={() => {
                  setEducation(option);
                  setShowEducationOptions(false);
                }}
              >
                <Text style={styles.educationOptionText}>{option}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={styles.modalCloseButton}
              onPress={() => setShowEducationOptions(false)}
            >
              <Text style={styles.modalCloseText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Photo Upload Modal */}
      <Modal
        visible={showProfileModal}
        transparent={true}
        onRequestClose={() => setShowProfileModal(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {photos[photoIndex]?.url ? 'Change Photo' : 'Add Photo'}
            </Text>
            {tempPhoto && (
              <Image
                source={{ uri: tempPhoto }}
                style={styles.previewImage}
                resizeMode="cover"
              />
            )}
            <View style={styles.photoButtonsContainer}>
              <TouchableOpacity 
                style={styles.photoButton}
                onPress={takePicture}
              >
                <Text style={styles.photoButtonText}>Take Photo</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={styles.photoButton}
                onPress={pickImage}
              >
                <Text style={styles.photoButtonText}>Choose from Gallery</Text>
              </TouchableOpacity>
              
              {tempPhoto && (
                <TouchableOpacity 
                  style={styles.uploadButton}
                  onPress={() => uploadPhoto(tempPhoto)}
                >
                  <Text style={styles.uploadButtonText}>Upload</Text>
                </TouchableOpacity>
              )}
              
              {photos[photoIndex]?.url && !tempPhoto && (
                <TouchableOpacity 
                  style={styles.deletePhotoButton}
                  onPress={() => removePhoto(photoIndex)}
                >
                  <Text style={styles.deletePhotoText}>Delete Photo</Text>
                </TouchableOpacity>
              )}
            </View>
            <TouchableOpacity
              style={styles.modalCloseButton}
              onPress={() => {
                setShowProfileModal(false);
                setTempPhoto(null);
              }}
            >
              <Text style={styles.modalCloseText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 16,
    marginBottom: 8,
    color: '#343a40',
  },
  sectionDescription: {
    fontSize: 14,
    color: '#6c757d',
    marginBottom: 16,
  },
  photoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  photoSelector: {
    width: windowWidth / 3.5,
    height: windowWidth / 3.5,
    borderRadius: 8,
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
    width: '100%',
    height: '100%',
  },
  photoPlaceholderText: {
    marginTop: 8,
    fontSize: 12,
    color: '#adb5bd',
    textAlign: 'center',
  },
  photoImage: {
    width: '100%',
    height: '100%',
  },
  inputGroup: {
    marginBottom: 16,
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
  staticField: {
    height: 50,
    borderWidth: 1,
    borderColor: '#ced4da',
    borderRadius: 8,
    paddingHorizontal: 12,
    backgroundColor: '#f8f9fa',
    justifyContent: 'center',
    flexDirection: 'row',
    alignItems: 'center',
  },
  staticFieldText: {
    fontSize: 16,
    color: '#495057',
    flex: 1,
  },
  staticFieldNote: {
    fontSize: 12,
    color: '#6c757d',
    fontStyle: 'italic',
  },
  radioContainer: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  radioButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginRight: 10,
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
  pickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 12,
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
  bioInput: {
    borderWidth: 1,
    borderColor: '#ced4da',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: 'white',
    minHeight: 100,
    textAlignVertical: 'top',
    fontSize: 16,
  },
  charCount: {
    alignSelf: 'flex-end',
    fontSize: 12,
    color: '#6c757d',
    marginTop: 4,
  },
  saveButton: {
    backgroundColor: '#007bff',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 40,
  },
  disabledButton: {
    backgroundColor: '#6c757d',
  },
  saveButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContent: {
    backgroundColor: 'white',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
  },
  modalCloseButton: {
    backgroundColor: '#f8f9fa',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 16,
  },
  modalCloseText: {
    color: '#007bff',
    fontSize: 16,
    fontWeight: '500',
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
  selectedOptionText: {
    color: '#007bff',
    fontWeight: 'bold',
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
  photoActions: {
    marginVertical: 20,
  },
  photoAction: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  photoActionRemove: {
    marginTop: 10,
  },
  photoActionText: {
    fontSize: 16,
    marginLeft: 10,
    color: '#007bff',
  },
  photoActionTextRemove: {
    color: '#dc3545',
  },
  previewContainer: {
    marginVertical: 20,
    alignItems: 'center',
  },
  previewImage: {
    width: windowWidth * 0.7,
    height: windowWidth * 0.7,
    borderRadius: 8,
    marginBottom: 16,
  },
  previewActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  previewCancel: {
    backgroundColor: '#f8f9fa',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ced4da',
  },
  previewUpload: {
    backgroundColor: '#007bff',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  previewButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#212529',
  },
  photoButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
  },
  photoButton: {
    padding: 10,
    borderWidth: 1,
    borderColor: '#ced4da',
    borderRadius: 8,
    backgroundColor: '#e9ecef',
  },
  photoButtonText: {
    fontSize: 16,
    color: '#007bff',
  },
  deletePhotoButton: {
    padding: 10,
    borderWidth: 1,
    borderColor: '#ced4da',
    borderRadius: 8,
    backgroundColor: '#f8f9fa',
  },
  deletePhotoText: {
    fontSize: 16,
    color: '#dc3545',
  },
  educationOption: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  educationOptionText: {
    fontSize: 16,
    color: '#212529',
  },
  uploadButton: {
    padding: 10,
    borderWidth: 1,
    borderColor: '#28a745',
    borderRadius: 8,
    backgroundColor: '#e6f4ea',
  },
  uploadButtonText: {
    fontSize: 16,
    color: '#28a745',
  },
});

export default EditProfile; 