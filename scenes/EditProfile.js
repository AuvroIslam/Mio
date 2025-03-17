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

const EditProfile = ({ navigation }) => {
  const [loading, setLoading] = useState(false);
  const [gender, setGender] = useState('');
  const [age, setAge] = useState('');
  const [education, setEducation] = useState('');
  const [bio, setBio] = useState('');
  const [location, setLocation] = useState('');
  const [showEducationOptions, setShowEducationOptions] = useState(false);
  const [showLocationOptions, setShowLocationOptions] = useState(false);
  const [photos, setPhotos] = useState([]);
  const [tempPhoto, setTempPhoto] = useState(null);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [matchGender, setMatchGender] = useState('everyone');
  const [matchLocation, setMatchLocation] = useState('worldwide');
  const [locationFilter, setLocationFilter] = useState('');
  const [filteredLocations, setFilteredLocations] = useState(COUNTRIES);
  
  const { currentUser } = useAuth();
  
  // Load user profile when component mounts
  useEffect(() => {
    if (currentUser) {
      loadUserProfile();
    }
  }, [currentUser]);
  
  // Effect to filter locations based on search
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
        gender,
        age: ageValue,
        education,
        bio,
        location,
        matchGender,
        matchLocation
      };
      
      const result = await firestoreService.updateUserProfile(currentUser.uid, updates);
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to update profile');
      }
      
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
            <Ionicons name="image-outline" size={40} color="#ccc" />
            <Text style={styles.photoPlaceholderText}>{title}</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
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
          <Ionicons name="chevron-down" size={24} color="#007bff" />
        </TouchableOpacity>
      </View>
      
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Location</Text>
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
        style={[styles.saveButton, loading && styles.disabledButton]}
        onPress={saveProfile}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.saveButtonText}>Save Profile</Text>
        )}
      </TouchableOpacity>
      
      {/* Education Options Modal */}
      <Modal
        visible={showEducationOptions}
        transparent={true}
        animationType="slide"
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Select Education</Text>
            <ScrollView>
              {EDUCATION_OPTIONS.map((option, index) => (
                <TouchableOpacity
                  key={index}
                  style={styles.optionItem}
                  onPress={() => {
                    setEducation(option);
                    setShowEducationOptions(false);
                  }}
                >
                  <Text style={[
                    styles.optionText,
                    education === option && styles.selectedOptionText
                  ]}>
                    {option}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity
              style={styles.modalCloseButton}
              onPress={() => setShowEducationOptions(false)}
            >
              <Text style={styles.modalCloseText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      
      {/* Location Options Modal */}
      <Modal
        visible={showLocationOptions}
        transparent={true}
        animationType="slide"
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Select Location</Text>
            <TextInput
              style={styles.searchInput}
              placeholder="Search countries..."
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
                    setLocationFilter('');
                  }}
                >
                  <Text style={[
                    styles.optionText,
                    location === country && styles.selectedOptionText
                  ]}>
                    {country}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity
              style={styles.modalCloseButton}
              onPress={() => {
                setShowLocationOptions(false);
                setLocationFilter('');
              }}
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
        animationType="slide"
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {photoIndex === 0 ? 'Profile Photo' : `Photo ${photoIndex + 1}`}
            </Text>
            
            {tempPhoto ? (
              <View style={styles.previewContainer}>
                <Image 
                  source={{ uri: tempPhoto }} 
                  style={styles.previewImage} 
                  resizeMode="contain"
                />
                
                <View style={styles.previewActions}>
                  <TouchableOpacity 
                    style={styles.previewCancel}
                    onPress={() => setTempPhoto(null)}
                  >
                    <Text style={styles.previewButtonText}>Cancel</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity 
                    style={styles.previewUpload}
                    onPress={() => uploadPhoto(tempPhoto)}
                  >
                    <Text style={styles.previewButtonText}>Upload</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={styles.photoActions}>
                <TouchableOpacity 
                  style={styles.photoAction}
                  onPress={pickImage}
                >
                  <Ionicons name="camera" size={24} color="#007bff" />
                  <Text style={styles.photoActionText}>
                    {photos && photos[photoIndex] ? 'Change Photo' : 'Add Photo'}
                  </Text>
                </TouchableOpacity>
                
                {photos && photos[photoIndex] && (
                  <TouchableOpacity 
                    style={[styles.photoAction, styles.photoActionRemove]}
                    onPress={() => removePhoto(photoIndex)}
                  >
                    <Ionicons name="trash" size={24} color="#dc3545" />
                    <Text style={[styles.photoActionText, styles.photoActionTextRemove]}>
                      Remove Photo
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
            
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
    </ScrollView>
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
    width: Dimensions.get('window').width / 3.5,
    height: Dimensions.get('window').width / 3.5,
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
    width: Dimensions.get('window').width * 0.7,
    height: Dimensions.get('window').width * 0.7,
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
});

export default EditProfile; 