import React, { useState } from 'react';
import Constants from 'expo-constants';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';

const getApiUrl = () => {
  const envUrl = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (envUrl) return envUrl.replace(/\/$/, '');

  const hostUri = Constants.expoConfig?.hostUri || Constants.manifest?.debuggerHost;
  if (hostUri) {
    const host = hostUri.split(':')[0];
    return `http://${host}:4000`;
  }

  return 'http://localhost:4000';
};

const API_URL = getApiUrl();

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function HomeScreen() {
  const [balance] = useState(125500.0);

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
        options={{ tabBarLabel: 'Home' }}
      />
      <Tab.Screen
        name="Wallet"
        component={WalletScreen}
        options={{ tabBarLabel: 'Wallet' }}
      />
      <Tab.Screen
        name="History"
        component={HistoryScreen}
        options={{ tabBarLabel: 'History' }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ tabBarLabel: 'Profile' }}
      />
    </Tab.Navigator>
  );
}

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="MainApp" component={TabNavigator} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

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

export { API_URL };
" ,{"path":"backend/src/server.js","content":"import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

const prisma = new PrismaClient();
const app = express();
const PORT = Number(process.env.PORT || 4000);
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET || JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET must be set and contain at least 32 characters');
}

const allowedOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(helmet());
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  })
);
app.use(express.json({ limit: '1mb' }));

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false });

const registerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(72),
});

const loginSchema = z.object({
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
  password: z.string().min(1).max(72),
});

function signToken(user) {
  return jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '1h' });
}

function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing bearer token' });
  try {
    const payload = jwt.verify(header.slice(7), JWT_SECRET);
    req.user = { id: payload.sub, email: payload.email };
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'CafiPay API' }));

app.post('/api/auth/register', authLimiter, async (req, res, next) => {
  try {
    const data = registerSchema.parse(req.body);
    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) return res.status(409).json({ error: 'Email already registered' });

    const passwordHash = await bcrypt.hash(data.password, 12);
    const user = await prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        passwordHash,
        wallet: { create: { balance: 0, currency: 'NGN' } },
      },
      select: { id: true, name: true, email: true, createdAt: true },
    });

    const token = signToken(user);
    res.status(201).json({ message: 'Registration successful', token, user });
  } catch (err) {
    next(err);
  }
});

app.post('/api/auth/login', authLimiter, async (req, res, next) => {
  try {
    const data = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: data.email } });
    if (!user || !(await bcrypt.compare(data.password, user.passwordHash))) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = signToken(user);
    res.json({ message: 'Login successful', token, user: { id: user.id, name: user.name, email: user.email } });
  } catch (err) {
    next(err);
  }
});

app.get('/api/auth/me', auth, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, name: true, email: true, createdAt: true, wallet: { select: { balance: true, currency: true } } },
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user });
  } catch (err) {
    next(err);
  }
});

app.get('/api/wallet', auth, async (req, res, next) => {
  try {
    const wallet = await prisma.wallet.findUnique({ where: { userId: req.user.id } });
    if (!wallet) return res.status(404).json({ error: 'Wallet not found' });
    res.json({ wallet });
  } catch (err) {
    next(err);
  }
});

app.get('/api/transactions', auth, async (req, res, next) => {
  try {
    const transactions = await prisma.transaction.findMany({ where: { userId: req.user.id }, orderBy: { createdAt: 'desc' }, take: 50 });
    res.json({ transactions });
  } catch (err) {
    next(err);
  }
});

app.post('/api/auth/logout', auth, (_req, res) => {
  res.json({ message: 'Logout acknowledged; discard the token on the client' });
});

app.use((err, _req, res, _next) => {
  if (err instanceof z.ZodError) return res.status(400).json({ error: 'Validation failed', details: err.issues });
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const server = app.listen(PORT, () => console.log(`CafiPay API listening on port ${PORT}`));

process.on('SIGINT', async () => {
  server.close();
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  server.close();
  await prisma.$disconnect();
  process.exit(0);
});
"},{"path":"mobile/.env.example","content":"EXPO_PUBLIC_API_URL=http://localhost:4000
"}]} ,