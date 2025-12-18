import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, SafeAreaView, Text, View, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { LoyaltySnapshot, OrderSummary, VendorProfile } from '@countrtop/models';
import { fetchFeaturedVendors, fetchLoyalty, fetchRecentOrders } from '@countrtop/api-client';
import {
  ensureNotificationPermissions,
  getStoredPushToken,
  obtainExpoPushToken,
  StoredPushToken
} from './notifications/pushNotifications';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

const mockUser = {
  name: 'Jordan Lee'
};

const mockVendors: VendorProfile[] = [
  { id: 'vendor_cafe', name: 'Sunset Coffee Cart', cuisine: 'Cafe', location: 'Sunset Park' },
  { id: 'vendor_foodtruck', name: 'Hilltop Tacos', cuisine: 'Mexican', location: 'Mission Bay' }
];

const mockLoyalty: LoyaltySnapshot = {
  points: 280,
  tier: 'silver',
  nextRewardAt: 300
};

const mockOrders: OrderSummary[] = [
  { id: 'order_one', status: 'preparing', total: 11, etaMinutes: 8 },
  { id: 'order_two', status: 'ready', total: 12.5, etaMinutes: 3 },
  { id: 'order_three', status: 'completed', total: 9.25 }
];

type TabParamList = {
  Discover: undefined;
  Orders: undefined;
  Rewards: undefined;
  Account: undefined;
};

const Tab = createBottomTabNavigator<TabParamList>();

export default function App() {
  const [pushToken, setPushToken] = useState<StoredPushToken | null>(null);
  const [notificationStatus, setNotificationStatus] = useState<'checking' | 'ready' | 'denied' | 'error'>(
    'checking'
  );
  const [notificationError, setNotificationError] = useState<string | null>(null);
  const [featuredVendors, setFeaturedVendors] = useState<VendorProfile[]>([]);
  const [recentOrders, setRecentOrders] = useState<OrderSummary[]>([]);
  const [loyalty, setLoyalty] = useState<LoyaltySnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);

  const customerUserId = process.env.EXPO_PUBLIC_CUSTOMER_USER_ID ?? 'user_demo';
  const preferredVendorId = process.env.EXPO_PUBLIC_CUSTOMER_VENDOR_ID ?? 'vendor_cafe';

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

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setDataError(null);
      try {
        const [vendorsResponse, ordersResponse, loyaltyResponse] = await Promise.all([
          fetchFeaturedVendors().catch(() => mockVendors),
          fetchRecentOrders(preferredVendorId).catch(() => mockOrders),
          fetchLoyalty(customerUserId).catch(() => mockLoyalty)
        ]);
        setFeaturedVendors(vendorsResponse ?? mockVendors);
        setRecentOrders(ordersResponse ?? mockOrders);
        setLoyalty(loyaltyResponse ?? mockLoyalty);
      } catch (error) {
        setDataError('Using offline demo data.');
        setFeaturedVendors(mockVendors);
        setRecentOrders(mockOrders);
        setLoyalty(mockLoyalty);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [customerUserId, preferredVendorId]);

  const notificationCopy = useMemo(() => {
    if (notificationStatus === 'checking') {
      return 'Checking permission and device token…';
    }
    if (notificationStatus === 'ready') {
      return pushToken
        ? `Push ready via ${pushToken.provider.toUpperCase()}`
        : 'Push notifications are configured.';
    }
    if (notificationStatus === 'denied') {
      return 'Notifications are disabled. Enable them to get order updates.';
    }
    return notificationError ?? 'Unable to configure notifications.';
  }, [notificationError, notificationStatus, pushToken]);

  const DiscoverScreen = () => (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      <View style={styles.card}>
        {loading && <Text style={styles.rowSubtitle}>Loading vendors…</Text>}
        {featuredVendors.map((vendor) => (
          <View key={vendor.id} style={styles.vendorBlock}>
            <View style={styles.vendorHeader}>
              <Text style={styles.eyebrowText}>open</Text>
              <Text style={styles.vendorName}>{vendor.name}</Text>
              <View style={styles.actionsBadge}>
                <Text style={styles.actionsBadgeText}>≡</Text>
              </View>
            </View>
            <Text style={styles.rowSubtitle}>
              {vendor.cuisine} • {vendor.location}
            </Text>
            <View style={styles.thumbnailRow}>
              {[1, 2, 3, 4].map((thumb) => (
                <View key={`${vendor.id}-${thumb}`} style={styles.thumbnail} />
              ))}
            </View>
          </View>
        ))}
        {!loading && featuredVendors.length === 0 && (
          <Text style={styles.rowSubtitle}>No vendors available right now.</Text>
        )}
        {dataError && <Text style={[styles.rowSubtitle, { color: '#ef4444' }]}>{dataError}</Text>}
      </View>
    </ScrollView>
  );

  const OrdersScreen = () => (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      <View style={styles.card}>
        {loading && <Text style={styles.rowSubtitle}>Loading orders…</Text>}
        {recentOrders.map((order) => (
          <View key={order.id} style={styles.orderRow}>
            <View style={styles.orderThumb} />
            <View style={styles.orderMeta}>
              <Text style={styles.orderDate}>#{order.id}</Text>
              <Text style={styles.orderStatus}>
                {order.status === 'completed' ? 'Completed.' : `${order.status}…`}
              </Text>
            </View>
            <Text style={styles.orderCTA}>→</Text>
          </View>
        ))}
        {!loading && recentOrders.length === 0 && (
          <Text style={styles.rowSubtitle}>No orders yet. Place your first order.</Text>
        )}
        <Text style={styles.notificationHint}>{notificationCopy}</Text>
        {dataError && <Text style={[styles.rowSubtitle, { color: '#ef4444' }]}>{dataError}</Text>}
      </View>
    </ScrollView>
  );

  const RewardsScreen = () => (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      <View style={styles.card}>
        <Text style={styles.rewardsIcon}>☆</Text>
        {loyalty ? (
          <>
            <Text style={styles.rewardsPoints}>{loyalty.points.toString().padStart(4, '0')}</Text>
            <Text style={styles.rowSubtitle}>points</Text>
          </>
        ) : (
          <Text style={styles.rowSubtitle}>{loading ? 'Loading loyalty…' : 'No loyalty data available.'}</Text>
        )}
        <View style={styles.rewardsRow}>
          <View style={styles.rewardsThumb} />
          <View>
            <Text style={styles.rowTitle}>Available Offers</Text>
            <Text style={styles.rowSubtitle}>Browse</Text>
          </View>
          <Text style={styles.orderCTA}>→</Text>
        </View>
        <View style={styles.rewardsRow}>
          <View style={styles.rewardsThumb} />
          <View>
            <Text style={styles.rowTitle}>Your Coupons</Text>
            <Text style={styles.rowSubtitle}>Redeem</Text>
          </View>
          <Text style={styles.orderCTA}>→</Text>
        </View>
        <View style={styles.rewardsRow}>
          <View style={styles.rewardsThumb} />
          <View>
            <Text style={styles.rowTitle}>Redemption History</Text>
            <Text style={styles.rowSubtitle}>Previous</Text>
          </View>
          <Text style={styles.orderCTA}>→</Text>
        </View>
        {loyalty && <Text style={styles.rowSubtitle}>Next reward at {loyalty.nextRewardAt} pts</Text>}
        {dataError && <Text style={[styles.rowSubtitle, { color: '#ef4444' }]}>{dataError}</Text>}
      </View>
    </ScrollView>
  );

  const AccountScreen = () => (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      <View style={styles.card}>
        <View style={styles.accountAvatar}>
          <Text style={styles.accountAvatarText}>👤</Text>
        </View>
        <Text style={styles.accountName}>{mockUser.name}</Text>
        <View style={styles.accountList}>
          {['loyalty program', 'order history', 'account settings', 'support'].map((item) => (
            <View key={item} style={styles.accountRow}>
              <Text style={styles.rowTitle}>{item}</Text>
              <Text style={styles.orderCTA}>→</Text>
            </View>
          ))}
        </View>
        <Text style={styles.legalText}>terms & conditions</Text>
        <Text style={styles.legalText}>CountrTop v1.2.1</Text>
      </View>
    </ScrollView>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      <NavigationContainer>
        <Tab.Navigator
          screenOptions={{
            header: ({ route }) => (
              <View style={styles.screenHeader}>
                <Text style={styles.screenEyebrow}>{route.name}</Text>
                <Text style={styles.screenTitle}>{route.name}</Text>
              </View>
            ),
            tabBarStyle: { paddingVertical: 8 },
            tabBarLabelStyle: { fontSize: 12 }
          }}
        >
          <Tab.Screen name="Discover" component={DiscoverScreen} />
          <Tab.Screen name="Orders" component={OrdersScreen} />
          <Tab.Screen name="Rewards" component={RewardsScreen} />
          <Tab.Screen name="Account" component={AccountScreen} />
        </Tab.Navigator>
      </NavigationContainer>
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
    paddingBottom: 120,
    gap: 16
  },
  screenHeader: {
    paddingTop: 12,
    paddingHorizontal: 20
  },
  screenEyebrow: {
    fontSize: 12,
    textTransform: 'uppercase',
    color: '#9ca3af',
    letterSpacing: 1
  },
  screenTitle: {
    fontSize: 32,
    fontWeight: '700'
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
  vendorBlock: {
    marginBottom: 20
  },
  vendorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4
  },
  eyebrowText: {
    fontSize: 12,
    textTransform: 'uppercase',
    color: '#22c55e',
    marginRight: 10
  },
  vendorName: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600'
  },
  actionsBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center'
  },
  actionsBadgeText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600'
  },
  thumbnailRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10
  },
  thumbnail: {
    flex: 1,
    height: 68,
    borderRadius: 8,
    backgroundColor: '#e5e7eb'
  },
  orderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16
  },
  orderThumb: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: '#e5e7eb',
    marginRight: 12
  },
  orderMeta: {
    flex: 1
  },
  orderDate: {
    fontSize: 12,
    color: '#9ca3af',
    marginBottom: 4
  },
  orderStatus: {
    fontSize: 14,
    fontWeight: '600'
  },
  orderCTA: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1f2937'
  },
  notificationHint: {
    color: '#6b7280',
    fontSize: 12
  },
  rewardsIcon: {
    fontSize: 42,
    textAlign: 'center'
  },
  rewardsPoints: {
    fontSize: 48,
    fontWeight: '700',
    textAlign: 'center'
  },
  rewardsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16
  },
  rewardsThumb: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: '#e5e7eb',
    marginRight: 12
  },
  accountAvatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2,
    borderColor: '#d1d5db',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 12
  },
  accountAvatarText: {
    fontSize: 32
  },
  accountName: {
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 16
  },
  accountList: {
    gap: 12,
    marginBottom: 20
  },
  accountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  legalText: {
    color: '#9ca3af',
    fontSize: 12,
    textAlign: 'center'
  },
  tabBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff'
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 6
  },
  tabButtonActive: {
    borderBottomWidth: 2,
    borderColor: '#111827'
  },
  tabLabel: {
    fontSize: 12,
    color: '#9ca3af'
  },
  tabLabelActive: {
    color: '#111827',
    fontWeight: '600'
  }
});
