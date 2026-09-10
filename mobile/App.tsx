import React, { useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  ScrollView,
} from 'react-native';

// API Configuration
const API_URL = 'http://localhost:4000'; // Change to your LAN IP for physical devices

// Navigation Setup
const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

// Home Screen
function HomeScreen() {
  const [balance] = useState(125500.00);

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>CafiPay</Text>
        <Text style={styles.subtitle}>Available Balance</Text>
        <Text style={styles.balance}>₦{balance.toLocaleString()}</Text>
      </View>

      <View style={styles.quickActions}>
        <TouchableOpacity style={styles.actionButton}>
          <Text style={styles.actionText}>Send</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton}>
          <Text style={styles.actionText}>Receive</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton}>
          <Text style={styles.actionText}>Scan QR</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton}>
          <Text style={styles.actionText}>Pay</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Quick Services</Text>
        <View style={styles.serviceGrid}>
          <TouchableOpacity style={styles.serviceButton}>
            <Text style={styles.serviceText}>Airtime</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.serviceButton}>
            <Text style={styles.serviceText}>Data</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.serviceButton}>
            <Text style={styles.serviceText}>Bills</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.serviceButton}>
            <Text style={styles.serviceText}>International</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Exchange Rates</Text>
        <View style={styles.rateContainer}>
          <Text style={styles.rateText}>USD/NGN: 1,520.00</Text>
          <Text style={styles.rateText}>GBP/NGN: 1,920.00</Text>
          <Text style={styles.rateText}>EUR/NGN: 1,650.00</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Markets</Text>
        <View style={styles.rateContainer}>
          <Text style={styles.rateText}>BTC: $72,500</Text>
          <Text style={styles.rateText}>ETH: $3,800</Text>
          <Text style={styles.rateText}>AAPL: $189.95</Text>
        </View>
      </View>
    </ScrollView>
  );
}

// Wallet Screen
function WalletScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Wallet & History</Text>
      <View style={styles.emptyState}>
        <Text style={styles.emptyText}>No transactions yet</Text>
      </View>
    </View>
  );
}

// History Screen
function HistoryScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Transaction History</Text>
      <View style={styles.emptyState}>
        <Text style={styles.emptyText}>No transaction history</Text>
      </View>
    </View>
  );
}

// Profile Screen
function ProfileScreen() {
  const [user] = useState({ name: 'Demo User', email: 'demo@cafipay.com', phone: '+234XXXXXXXXXX' });

  return (
    <ScrollView style={styles.container}>
      <View style={styles.profileHeader}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>DU</Text>
        </View>
        <Text style={styles.profileName}>{user.name}</Text>
        <Text style={styles.profileDetail}>{user.email}</Text>
        <Text style={styles.profileDetail}>{user.phone}</Text>
      </View>

      <View style={styles.section}>
        <TouchableOpacity style={styles.profileOption}>
          <Text style={styles.profileOptionText}>Account Settings</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.profileOption}>
          <Text style={styles.profileOptionText}>Security</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.profileOption}>
          <Text style={styles.profileOptionText}>Beneficiaries</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.profileOption}>
          <Text style={styles.profileOptionText}>Help & Support</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.profileOption, styles.logoutButton]}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

// Main Tab Navigator
function TabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#1E90FF',
        tabBarInactiveTintColor: '#999',
        tabBarStyle: styles.tabBar,
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarLabel: 'Home',
        }}
      />
      <Tab.Screen
        name="Wallet"
        component={WalletScreen}
        options={{
          tabBarLabel: 'Wallet',
        }}
      />
      <Tab.Screen
        name="History"
        component={HistoryScreen}
        options={{
          tabBarLabel: 'History',
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarLabel: 'Profile',
        }}
      />
    </Tab.Navigator>
  );
}

// Root App Component
export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="MainApp" component={TabNavigator} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

// Styles
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  header: {
    backgroundColor: '#1E90FF',
    padding: 24,
    paddingTop: 40,
    color: 'white',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 14,
    color: '#E0E0E0',
    marginBottom: 4,
  },
  balance: {
    fontSize: 32,
    fontWeight: 'bold',
    color: 'white',
  },
  quickActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    padding: 16,
    marginVertical: 8,
  },
  actionButton: {
    backgroundColor: 'white',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    elevation: 2,
  },
  actionText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1E90FF',
  },
  section: {
    padding: 16,
    marginVertical: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  serviceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  serviceButton: {
    width: '48%',
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 8,
    marginBottom: 8,
    elevation: 1,
  },
  serviceText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E90FF',
    textAlign: 'center',
  },
  rateContainer: {
    backgroundColor: 'white',
    padding: 12,
    borderRadius: 8,
    elevation: 1,
  },
  rateText: {
    fontSize: 14,
    color: '#333',
    paddingVertical: 6,
  },
  tabBar: {
    backgroundColor: 'white',
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    paddingBottom: 8,
    paddingTop: 8,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
  },
  profileHeader: {
    backgroundColor: '#1E90FF',
    padding: 24,
    alignItems: 'center',
    paddingTop: 40,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'white',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatarText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1E90FF',
  },
  profileName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 8,
  },
  profileDetail: {
    fontSize: 14,
    color: '#E0E0E0',
  },
  profileOption: {
    backgroundColor: 'white',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  profileOptionText: {
    fontSize: 16,
    color: '#333',
  },
  logoutButton: {
    backgroundColor: '#FF6B6B',
  },
  logoutText: {
    fontSize: 16,
    color: 'white',
    fontWeight: '600',
  },
});
