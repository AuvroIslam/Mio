import React from 'react';
import { View } from 'react-native';
import { 
  Ionicons, 
  FontAwesome, 
  MaterialIcons, 
  AntDesign, 
  MaterialCommunityIcons 
} from '@expo/vector-icons';

/**
 * A reusable Icon component that wraps various icon libraries from @expo/vector-icons
 * @param {string} type - The icon family type (ionicons, fontawesome, antdesign, material, materialcommunity)
 * @param {string} name - The name of the icon from the specified family
 * @param {number} size - The size of the icon (default: 24)
 * @param {string} color - The color of the icon (default: black)
 * @param {Object} style - Additional styles for the icon container
 * @returns {JSX.Element} The icon component
 */
const Icon = ({ 
  type = 'ionicons', 
  name, 
  size = 24, 
  color = '#000', 
  style 
}) => {
  
  if (!name) return null;
  
  // Render the appropriate icon family based on type
  const renderIcon = () => {
    switch (type.toLowerCase()) {
      case 'ionicons':
        return <Ionicons name={name} size={size} color={color} />;
      case 'fontawesome':
        return <FontAwesome name={name} size={size} color={color} />;
      case 'antdesign':
        return <AntDesign name={name} size={size} color={color} />;
      case 'material':
        return <MaterialIcons name={name} size={size} color={color} />;
      case 'materialcommunity':
        return <MaterialCommunityIcons name={name} size={size} color={color} />;
      default:
        return <Ionicons name={name} size={size} color={color} />;
    }
  };

  return <View style={style}>{renderIcon()}</View>;
};

export default Icon; 