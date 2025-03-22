import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSubscription } from '../config/SubscriptionContext';
import PremiumBanner from '../assets/premium-banner';
import LoadingModal from '../components/LoadingModal';

const PremiumScreen = ({ navigation }) => {
  const { 
    isPremium, 
    loading, 
    upgradeToPremium, 
    getRemainingCounts,
    getSubscriptionTier,
    LIMITS
  } = useSubscription();

  const remaining = getRemainingCounts();
  
  const handleUpgrade = async () => {
    await upgradeToPremium();
  };

  if (loading) {
    return (
      <LoadingModal
        visible={true}
        message="Loading subscription info..."
      />
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <PremiumBanner style={styles.bannerImage} />
        <View style={styles.currentPlanBadge}>
          <Text style={styles.currentPlanText}>
            {isPremium ? 'PREMIUM PLAN' : 'FREE PLAN'}
          </Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Your Current Plan</Text>
        <View style={styles.planDetails}>
          <View style={styles.planDetail}>
            <Ionicons name="heart" size={24} color={isPremium ? "#007bff" : "#6c757d"} />
            <Text style={styles.planDetailText}>
              <Text style={styles.highlight}>{
                isPremium ? LIMITS.PREMIUM.MAX_FAVORITES : LIMITS.FREE.MAX_FAVORITES
              }</Text> favorite anime slots
            </Text>
          </View>
          
          <View style={styles.planDetail}>
            <Ionicons name="sync" size={24} color={isPremium ? "#007bff" : "#6c757d"} />
            <Text style={styles.planDetailText}>
              <Text style={styles.highlight}>{
                isPremium ? "Unlimited" : LIMITS.FREE.MAX_CHANGES_PER_WEEK
              }</Text> changes per week
            </Text>
          </View>
          
          <View style={styles.planDetail}>
            <Ionicons name="people" size={24} color={isPremium ? "#007bff" : "#6c757d"} />
            <Text style={styles.planDetailText}>
              <Text style={styles.highlight}>{
                isPremium ? "Unlimited" : LIMITS.FREE.MAX_MATCHES_PER_WEEK
              }</Text> matches per week
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>This Week's Usage</Text>
        <View style={styles.usageContainer}>
          <View style={styles.usageItem}>
            <Text style={styles.usageLabel}>Favorites Remaining</Text>
            <Text style={styles.usageValue}>
              {remaining.favorites === Infinity ? "∞" : remaining.favorites}
            </Text>
          </View>
          
          <View style={styles.usageItem}>
            <Text style={styles.usageLabel}>Changes Remaining</Text>
            <Text style={styles.usageValue}>
              {remaining.changes === Infinity ? "∞" : remaining.changes}
            </Text>
          </View>
          
          <View style={styles.usageItem}>
            <Text style={styles.usageLabel}>Matches Remaining</Text>
            <Text style={styles.usageValue}>
              {remaining.matches === Infinity ? "∞" : remaining.matches}
            </Text>
          </View>
        </View>
      </View>
      
      {!isPremium && (
        <View style={styles.upgradeSection}>
          <Text style={styles.upgradeSectionTitle}>Upgrade to Premium</Text>
          <Text style={styles.upgradeDescription}>
            Get unlimited changes to your favorites, match with more people, and save up to 10 favorite anime!
          </Text>
          
          <View style={styles.comparisonTable}>
            <View style={styles.comparisonHeader}>
              <Text style={styles.comparisonHeaderText}>Feature</Text>
              <Text style={styles.comparisonHeaderText}>Free</Text>
              <Text style={[styles.comparisonHeaderText, styles.premiumText]}>Premium</Text>
            </View>
            
            <View style={styles.comparisonRow}>
              <Text style={styles.comparisonFeature}>Favorites List</Text>
              <Text style={styles.comparisonValue}>{LIMITS.FREE.MAX_FAVORITES}</Text>
              <Text style={[styles.comparisonValue, styles.premiumText]}>{LIMITS.PREMIUM.MAX_FAVORITES}</Text>
            </View>
            
            <View style={styles.comparisonRow}>
              <Text style={styles.comparisonFeature}>Changes per Week</Text>
              <Text style={styles.comparisonValue}>{LIMITS.FREE.MAX_CHANGES_PER_WEEK}</Text>
              <Text style={[styles.comparisonValue, styles.premiumText]}>Unlimited</Text>
            </View>
            
            <View style={styles.comparisonRow}>
              <Text style={styles.comparisonFeature}>Matches per Week</Text>
              <Text style={styles.comparisonValue}>{LIMITS.FREE.MAX_MATCHES_PER_WEEK}</Text>
              <Text style={[styles.comparisonValue, styles.premiumText]}>Unlimited</Text>
            </View>
          </View>
          
          <TouchableOpacity 
            style={styles.upgradeButton}
            onPress={handleUpgrade}
          >
            <Ionicons name="star" size={20} color="#fff" />
            <Text style={styles.upgradeButtonText}>Upgrade Now</Text>
          </TouchableOpacity>
          
          <Text style={styles.pricingInfo}>
            Just $4.99/month or $49.99/year
          </Text>
        </View>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6c757d',
  },
  header: {
    position: 'relative',
    height: 180,
    marginBottom: 20,
  },
  bannerImage: {
    width: '100%',
    height: '100%',
  },
  currentPlanBadge: {
    position: 'absolute',
    bottom: -15,
    right: 20,
    backgroundColor: '#007bff',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  currentPlanText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  section: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 20,
    marginHorizontal: 15,
    marginBottom: 20,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
    color: '#343a40',
  },
  planDetails: {
    marginTop: 10,
  },
  planDetail: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  planDetailText: {
    fontSize: 16,
    marginLeft: 15,
    color: '#495057',
  },
  highlight: {
    fontWeight: 'bold',
    color: '#007bff',
  },
  usageContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
  },
  usageItem: {
    width: '30%',
    alignItems: 'center',
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#f8f9fa',
  },
  usageLabel: {
    fontSize: 12,
    color: '#6c757d',
    textAlign: 'center',
    marginBottom: 8,
  },
  usageValue: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#007bff',
  },
  upgradeSection: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 20,
    marginHorizontal: 15,
    marginBottom: 30,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  upgradeSectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#343a40',
  },
  upgradeDescription: {
    fontSize: 16,
    lineHeight: 24,
    color: '#6c757d',
    marginBottom: 20,
  },
  comparisonTable: {
    marginBottom: 20,
  },
  comparisonHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderColor: '#dee2e6',
    paddingBottom: 10,
    marginBottom: 10,
  },
  comparisonHeaderText: {
    flex: 1,
    fontWeight: 'bold',
    fontSize: 16,
    color: '#343a40',
  },
  comparisonRow: {
    flexDirection: 'row',
    paddingVertical: 8,
  },
  comparisonFeature: {
    flex: 1,
    fontSize: 15,
    color: '#495057',
  },
  comparisonValue: {
    flex: 1,
    fontSize: 15,
    color: '#6c757d',
  },
  premiumText: {
    color: '#007bff',
    fontWeight: 'bold',
  },
  upgradeButton: {
    flexDirection: 'row',
    backgroundColor: '#007bff',
    paddingVertical: 14,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  upgradeButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
    marginLeft: 8,
  },
  pricingInfo: {
    textAlign: 'center',
    fontSize: 14,
    color: '#6c757d',
  }
});

export default PremiumScreen; 