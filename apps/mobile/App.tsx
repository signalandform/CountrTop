import React, { useEffect, useState } from 'react';
import { ScrollView, SafeAreaView, Text, View, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { LoyaltySnapshot, MenuItem, OrderSummary, VendorProfile } from '@countrtop/models';
import {
  ensureNotificationPermissions,
  getStoredPushToken,
  obtainExpoPushToken,
  StoredPushToken
} from './notifications/pushNotifications';

const featuredVendors: VendorProfile[] = [
  { id: 'v1', name: 'Hilltop Tacos', cuisine: 'Mexican', location: 'Mission Bay' },
  { id: 'v2', name: 'Sunset Coffee Cart', cuisine: 'Cafe', location: 'Sunset Park' }
];

const sampleMenu: MenuItem[] = [
  { id: 'm1', name: 'Loaded Nachos', price: 12, isAvailable: true },
  { id: 'm2', name: 'Horchata Latte', price: 6, isAvailable: false }
];

const loyalty: LoyaltySnapshot = {
  points: 280,
  tier: 'silver',
  nextRewardAt: 300
};

const recentOrders: OrderSummary[] = [
  { id: 'o1', status: 'preparing', total: 24.5, etaMinutes: 8 },
  { id: 'o2', status: 'completed', total: 16 }
];

export default function App() {
  const [pushToken, setPushToken] = useState<StoredPushToken | null>(null);
  const [notificationStatus, setNotificationStatus] = useState<'checking' | 'ready' | 'denied' | 'error'>(
    'checking'
  );
  const [notificationError, setNotificationError] = useState<string | null>(null);

  useEffect(() => {
    const bootstrapNotifications = async () => {
      const cachedToken = await getStoredPushToken();
      if (cachedToken) {
        setPushToken(cachedToken);
        setNotificationStatus('ready');
        return;
      }

      try {
        const permission = await ensureNotificationPermissions();
        if (permission !== 'granted') {
          setNotificationStatus('denied');
          return;
        }

        const token = await obtainExpoPushToken();
        setPushToken(token);
        setNotificationStatus('ready');
      } catch (error) {
        setNotificationStatus('error');
        setNotificationError(error instanceof Error ? error.message : 'Unknown notification error');
      }
    };

    bootstrapNotifications();
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.heading}>CountrTop</Text>
        <Text style={styles.subtitle}>Order ahead, earn rewards, and track your food truck favorites.</Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Featured vendors</Text>
          {featuredVendors.map((vendor) => (
            <View key={vendor.id} style={styles.row}>
              <Text style={styles.rowTitle}>{vendor.name}</Text>
              <Text style={styles.rowSubtitle}>
                {vendor.cuisine} • {vendor.location}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Quick order</Text>
          {sampleMenu.map((item) => (
            <View key={item.id} style={styles.row}>
              <Text style={styles.rowTitle}>{item.name}</Text>
              <Text style={styles.rowSubtitle}>${item.price.toFixed(2)}</Text>
              <Text style={[styles.badge, !item.isAvailable && styles.badgeMuted]}>
                {item.isAvailable ? 'Available' : 'Sold out'}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Loyalty</Text>
          <Text style={styles.rowTitle}>{loyalty.tier.toUpperCase()} tier</Text>
          <Text style={styles.rowSubtitle}>
            {loyalty.points} pts • Next reward at {loyalty.nextRewardAt} pts
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Order status</Text>
          {recentOrders.map((order) => (
            <View key={order.id} style={styles.row}>
              <Text style={styles.rowTitle}>Order {order.id}</Text>
              <Text style={styles.rowSubtitle}>{order.status}</Text>
              {order.etaMinutes ? (
                <Text style={styles.badge}>ETA {order.etaMinutes}m</Text>
              ) : (
                <Text style={[styles.badge, styles.badgeMuted]}>Completed</Text>
              )}
            </View>
          ))}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Notifications</Text>
          <Text style={styles.rowSubtitle}>
            {notificationStatus === 'checking' && 'Checking permission and device token...'}
            {notificationStatus === 'ready' &&
              (pushToken
                ? `Push ready via ${pushToken.provider.toUpperCase()}`
                : 'Push notifications are configured.')}
            {notificationStatus === 'denied' &&
              'Notifications are disabled. Enable them to get order updates.'}
            {notificationStatus === 'error' && (notificationError ?? 'Unable to configure notifications.')}
          </Text>
          {pushToken && (
            <Text style={styles.monoText} numberOfLines={2}>
              {pushToken.token}
            </Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f7f7f7'
  },
  scrollContent: {
    padding: 20,
    gap: 12
  },
  heading: {
    fontSize: 28,
    fontWeight: '700'
  },
  subtitle: {
    color: '#6b7280',
    marginBottom: 8
  },
  card: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 }
  },
  cardTitle: {
    fontWeight: '600',
    fontSize: 16,
    marginBottom: 8
  },
  row: {
    marginBottom: 8
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: '600'
  },
  rowSubtitle: {
    color: '#6b7280'
  },
  badge: {
    alignSelf: 'flex-start',
    marginTop: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#ecfeff',
    color: '#0ea5e9'
  },
  badgeMuted: {
    backgroundColor: '#f3f4f6',
    color: '#6b7280'
  },
  monoText: {
    marginTop: 8,
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#f8fafc',
    fontFamily: 'Courier New',
    fontSize: 12,
    color: '#0f172a'
  }
});
