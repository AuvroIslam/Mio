import { Platform } from 'react-native';

// Cloudinary configuration
const CLOUDINARY_URL = 'https://api.cloudinary.com/v1_1/dl75lyt5x/upload';
const UPLOAD_PRESET = 'my_unsigned_preset';
const CLOUD_NAME = 'dl75lyt5x';

/**
 * Uploads an image to Cloudinary
 * @param {string} uri - The local URI of the image
 * @param {string} userId - The user ID (for folder structure)
 * @param {number} photoIndex - The index of the photo (0 for profile, 1-2 for additional photos)
 * @returns {Promise<Object>} - Result object with success state and URL or error
 */
export const uploadImage = async (uri, userId, photoIndex) => {
  try {
    // Prepare the file URI for different platforms
    const fileUri = Platform.OS === 'ios' ? uri.replace('file://', '') : uri;
    
    // Fetch the image and convert to blob
    const response = await fetch(fileUri);
    const blob = await response.blob();
    
    // Check file size (5MB limit)
    if (blob.size > 5 * 1024 * 1024) {
      return { 
        success: false, 
        error: 'File size exceeds 5MB limit' 
      };
    }
    
    // Create form data for upload
    const formData = new FormData();
    formData.append('file', {
      uri: fileUri,
      type: 'image/jpeg', // Assuming JPEG, adjust if needed
      name: `${userId}_photo_${photoIndex}.jpg`
    });
    formData.append('upload_preset', UPLOAD_PRESET);
    formData.append('folder', `momometsushi/users/${userId}`);
    
    // Upload to Cloudinary
    const uploadResponse = await fetch(CLOUDINARY_URL, {
      method: 'POST',
      body: formData,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'multipart/form-data'
      }
    });
    
    // Parse response
    const uploadResult = await uploadResponse.json();
    
    if (uploadResponse.ok) {
      return {
        success: true,
        url: uploadResult.secure_url,
        publicId: uploadResult.public_id,
        assetId: uploadResult.asset_id
      };
    } else {
      throw new Error(uploadResult.error?.message || 'Upload failed');
    }
  } catch (error) {
    console.error('Error uploading image to Cloudinary:', error);
    return { 
      success: false, 
      error: error.message || 'Failed to upload image'
    };
  }
};

/**
 * Deletes an image from Cloudinary
 * @param {string} publicId - The public ID of the image to delete
 * @returns {Promise<Object>} - Result object with success state or error
 */
export const deleteImage = async (publicId) => {
  try {
    if (!publicId) return { success: true };
    
    // For Cloudinary, we need to use their Admin API with API secret
    // For security reasons, deletion should be handled through your backend
    // Here we'll just return success and you can implement the actual deletion via your backend
    console.log(`Image deletion for ${publicId} should be handled by backend`);
    
    return { success: true };
  } catch (error) {
    console.error('Error with image deletion:', error);
    return { 
      success: false, 
      error: error.message || 'Failed to process image deletion'
    };
  }
};

export default {
  uploadImage,
  deleteImage
}; 