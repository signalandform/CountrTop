import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { SafeAreaView, View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Order, OrderStatus, User } from '@countrtop/models';
import { getDataClient } from './services/dataClient';
import { useAuthSession } from './services/auth';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

type TabKey = 'orders' | 'orderDetail' | 'analytics' | 'account';
type OrdersStackParamList = {
  Queue: undefined;
  Detail: undefined;
};

const Tab = createBottomTabNavigator();
const OrdersStack = createNativeStackNavigator<OrdersStackParamList>();

const vendorId = process.env.EXPO_PUBLIC_VENDOR_ID ?? 'vendor_cafe';
const actionableStatuses: OrderStatus[] = ['pending', 'preparing', 'ready', 'completed'];

const formatCurrency = (value: number) => `$${(value / 100).toFixed(2)}`;
const sortOrders = (items: Order[]) =>
  [...items].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
const upsertOrder = (orders: Order[], next: Order) => {
  const filtered = orders.filter((order) => order.id !== next.id);
  return sortOrders([next, ...filtered]);
};

export default function VendorOpsApp() {
  const dataClient = useMemo(() => getDataClient(), []);
  const { user, status, error: authError, signIn, signOut } = useAuthSession();
  const [activeTab, setActiveTab] = useState<TabKey>('orders');
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [subscriptionNote, setSubscriptionNote] = useState<string | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState<OrderStatus | null>(null);
  const [opsError, setOpsError] = useState<string | null>(null);

  const selectedOrder = useMemo(
    () => orders.find((order) => order.id === selectedOrderId) ?? orders[0] ?? null,
    [orders, selectedOrderId]
  );

  useEffect(() => {
    if (!selectedOrder && orders.length > 0) {
      setSelectedOrderId(orders[0].id);
    }
  }, [orders, selectedOrder]);

  useEffect(() => {
    if (status !== 'authenticated') return;

    let mounted = true;
    let cleanupSubscription: (() => void) | null = null;
    let pollingTimer: ReturnType<typeof setInterval> | null = null;

    const refreshOrders = async () => {
      const fetched = await dataClient.listOrdersForVendor(vendorId);
      if (!mounted) return;
      setOrders(sortOrders(fetched));
    };

    refreshOrders();

    try {
      const subscription = dataClient.subscribeToOrders(vendorId, (order) => {
        setOrders((current) => upsertOrder(current, order));
      });
      cleanupSubscription = () => subscription?.unsubscribe?.();
      setSubscriptionNote(null);
    } catch (error) {
      setSubscriptionNote(
        'Realtime channel unavailable. TODO: hook vendor ops channel once backend is ready. Polling every 10s.'
      );
      pollingTimer = setInterval(refreshOrders, 10000);
    }

    return () => {
      mounted = false;
      cleanupSubscription?.();
      if (pollingTimer) clearInterval(pollingTimer);
    };
  }, [dataClient, status]);

  const handleUnlock = () => {
    const email = process.env.EXPO_PUBLIC_VENDOR_USER_EMAIL ?? 'alex@example.com';
    const password = process.env.EXPO_PUBLIC_VENDOR_USER_PASSWORD ?? 'password123';
    void signIn(email, password);
  };

  const handleStatusUpdate = async (status: OrderStatus) => {
    if (!selectedOrder || selectedOrder.status === status) return;
    setUpdatingStatus(status);
    setOpsError(null);
    try {
      const updated = await dataClient.updateOrderStatus(selectedOrder.id, status);
      setOrders((current) => upsertOrder(current, updated));
      setSelectedOrderId(updated.id);
    } catch (error) {
      setOpsError(error instanceof Error ? error.message : 'Unable to update order.');
    } finally {
      setUpdatingStatus(null);
    }
  };

  const analytics = useMemo(() => {
    const total = orders.length;
    const active = orders.filter((order) => order.status !== 'completed').length;
    const ready = orders.filter((order) => order.status === 'ready').length;
    const completed = orders.filter((order) => order.status === 'completed').length;
    return { total, active, ready, completed };
  }, [orders]);

  const OrdersContext = createContext({
    orders,
    selectedOrder,
    selectOrder: setSelectedOrderId,
    subscriptionNote,
    handleStatusUpdate,
    analytics,
    opsError,
    updatingStatus
  });

  const OrdersQueueScreen = () => {
    const ctx = useContext(OrdersContext);
    return (
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Orders queue</Text>
          {ctx.subscriptionNote && <Text style={styles.helperText}>{ctx.subscriptionNote}</Text>}
          {ctx.orders.map((order) => (
            <TouchableOpacity
              key={order.id}
              style={[
                styles.orderRow,
                ctx.selectedOrder?.id === order.id && { borderColor: '#0ea5e9', borderWidth: 1 }
              ]}
              onPress={() => {
                ctx.selectOrder(order.id);
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.orderId}>#{order.id}</Text>
                <Text style={styles.orderMeta}>
                  {order.items.length} items • {formatCurrency(order.total)}
                </Text>
              </View>
              <View style={styles.statusPill}>
                <Text style={styles.statusPillText}>{order.status.toUpperCase()}</Text>
              </View>
            </TouchableOpacity>
          ))}
          {ctx.orders.length === 0 && <Text style={styles.helperText}>No orders yet.</Text>}
        </View>
      </ScrollView>
    );
  };

  const OrderDetailScreen = () => {
    const ctx = useContext(OrdersContext);
    return (
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Order detail</Text>
          {ctx.selectedOrder ? (
            <>
              <Text style={styles.orderId}>Order #{ctx.selectedOrder.id}</Text>
              <Text style={styles.orderMeta}>
                Placed {new Date(ctx.selectedOrder.createdAt).toLocaleTimeString()}
              </Text>
              <View style={{ marginTop: 12 }}>
                {ctx.selectedOrder.items.map((item, index) => (
                  <View key={item.menuItemId + index} style={styles.itemRow}>
                    <Text style={styles.itemName}>
                      {item.quantity} × {item.menuItemId}
                    </Text>
                    <Text style={styles.itemPrice}>{formatCurrency(item.price * item.quantity)}</Text>
                  </View>
                ))}
              </View>
              <Text style={[styles.orderMeta, { marginTop: 12 }]}>
                Total {formatCurrency(ctx.selectedOrder.total)}
              </Text>
              <Text style={[styles.orderMeta, { marginTop: 4 }]}>
                Status: <Text style={{ fontWeight: '600' }}>{ctx.selectedOrder.status}</Text>
              </Text>
              {ctx.opsError && <Text style={[styles.helperText, { color: '#dc2626' }]}>{ctx.opsError}</Text>}
              <View style={styles.statusGrid}>
                {actionableStatuses.map((status) => (
                  <TouchableOpacity
                    key={status}
                    disabled={ctx.updatingStatus !== null || ctx.selectedOrder.status === status}
                    style={[
                      styles.statusAction,
                      ctx.selectedOrder.status === status && styles.statusActionActive,
                      ctx.updatingStatus === status && { opacity: 0.5 }
                    ]}
                    onPress={() => ctx.handleStatusUpdate(status)}
                  >
                    <Text
                      style={[
                        styles.statusActionText,
                        ctx.selectedOrder.status === status && { color: '#fff' }
                      ]}
                    >
                      {status.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          ) : (
            <Text style={styles.helperText}>Select an order to review details.</Text>
          )}
        </View>
      </ScrollView>
    );
  };

  const AnalyticsScreen = () => (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Floor analytics</Text>
        <View style={styles.analyticsRow}>
          <View style={styles.analyticsTile}>
            <Text style={styles.analyticsValue}>{analytics.active}</Text>
            <Text style={styles.analyticsLabel}>Active</Text>
          </View>
          <View style={styles.analyticsTile}>
            <Text style={styles.analyticsValue}>{analytics.ready}</Text>
            <Text style={styles.analyticsLabel}>Ready</Text>
          </View>
          <View style={styles.analyticsTile}>
            <Text style={styles.analyticsValue}>{analytics.completed}</Text>
            <Text style={styles.analyticsLabel}>Completed</Text>
          </View>
          <View style={styles.analyticsTile}>
            <Text style={styles.analyticsValue}>{analytics.total}</Text>
            <Text style={styles.analyticsLabel}>Total Orders</Text>
          </View>
        </View>
        <Text style={styles.helperText}>
          Numbers derived from listOrdersForVendor; updateOrderStatus drives these real-time.
        </Text>
      </View>
    </ScrollView>
  );

  const AccountScreen = () => (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Account</Text>
        <Text style={styles.orderMeta}>{user?.displayName ?? 'Vendor Ops'}</Text>
        <Text style={styles.orderMeta}>{user?.email}</Text>
        <TouchableOpacity
          style={[styles.primaryButton, { marginTop: 16 }]}
          onPress={() => {
            setOrders([]);
            setSelectedOrderId(null);
            void signOut();
          }}
        >
          <Text style={styles.primaryButtonText}>Sign out</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );

  const OrdersStackNavigator = () => (
    <OrdersContext.Provider
      value={{
        orders,
        selectedOrder,
        selectOrder: setSelectedOrderId,
        subscriptionNote,
        handleStatusUpdate,
        analytics,
        opsError,
        updatingStatus
      }}
    >
      <OrdersStack.Navigator
        initialRouteName="Queue"
        screenOptions={{
          headerStyle: { backgroundColor: '#0f172a' },
          headerTintColor: '#fff',
          contentStyle: { backgroundColor: '#0f172a' }
        }}
      >
        <OrdersStack.Screen name="Queue" component={OrdersQueueScreen} options={{ title: 'Orders' }} />
        <OrdersStack.Screen name="Detail" component={OrderDetailScreen} options={{ title: 'Order detail' }} />
      </OrdersStack.Navigator>
    </OrdersContext.Provider>
  );

  if (status !== 'authenticated') {
    return (
      <SafeAreaView style={[styles.container, styles.lockedScreen]}>
        <StatusBar style="light" />
        <Text style={styles.heading}>CountrTop Vendor Ops</Text>
        <Text style={[styles.helperText, { color: '#cbd5f5' }]}>Live queue + analytics</Text>
        {authError && <Text style={[styles.helperText, { color: '#fecaca' }]}>{authError}</Text>}
        <TouchableOpacity
          style={[styles.primaryButton, { marginTop: 24 }]}
          onPress={handleUnlock}
          disabled={status === 'loading'}
        >
          <Text style={styles.primaryButtonText}>
            {status === 'loading' ? 'Signing in…' : 'Sign in as vendor'}
          </Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      <NavigationContainer>
        <Tab.Navigator
          screenOptions={{
            headerStyle: { backgroundColor: '#0f172a' },
            headerTintColor: '#fff',
            tabBarStyle: { backgroundColor: '#111827', borderTopColor: '#1e293b' },
            tabBarActiveTintColor: '#fff',
            tabBarInactiveTintColor: '#94a3b8'
          }}
        >
          <Tab.Screen
            name="Orders"
            component={OrdersStackNavigator}
            options={{ headerShown: false }}
            listeners={{
              tabPress: () => setSelectedOrderId((current) => current ?? orders[0]?.id ?? null)
            }}
          />
          <Tab.Screen name="Analytics" component={AnalyticsScreen} />
          <Tab.Screen name="Account" component={AccountScreen} />
        </Tab.Navigator>
      </NavigationContainer>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a'
  },
  lockedScreen: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 8
  },
  heading: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '700'
  },
  subheading: {
    color: '#cbd5f5'
  },
  scrollContent: {
    padding: 24,
    paddingBottom: 120,
    gap: 16
  },
  card: {
    backgroundColor: '#111827',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 }
  },
  cardTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12
  },
  helperText: {
    color: '#94a3b8',
    marginTop: 8
  },
  orderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1f2937',
    padding: 12,
    borderRadius: 12,
    marginBottom: 12
  },
  orderId: {
    color: '#f8fafc',
    fontWeight: '700'
  },
  orderMeta: {
    color: '#cbd5f5',
    fontSize: 13
  },
  statusPill: {
    backgroundColor: '#0ea5e9',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 4
  },
  statusPillText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600'
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6
  },
  itemName: {
    color: '#fff'
  },
  itemPrice: {
    color: '#cbd5f5'
  },
  statusGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 16
  },
  statusAction: {
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6
  },
  statusActionActive: {
    backgroundColor: '#0ea5e9',
    borderColor: '#0ea5e9'
  },
  statusActionText: {
    color: '#94a3b8',
    fontWeight: '600',
    fontSize: 12
  },
  analyticsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12
  },
  analyticsTile: {
    flexBasis: '45%',
    backgroundColor: '#1f2937',
    borderRadius: 12,
    padding: 12
  },
  analyticsValue: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '700'
  },
  analyticsLabel: {
    color: '#94a3b8'
  },
  primaryButton: {
    backgroundColor: '#0ea5e9',
    borderRadius: 999,
    paddingHorizontal: 20,
    paddingVertical: 12
  },
  primaryButtonText: {
    color: '#0f172a',
    fontWeight: '700',
    textAlign: 'center'
  }
});
