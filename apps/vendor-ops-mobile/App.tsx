import React, { useEffect, useMemo, useState } from 'react';
import { SafeAreaView, View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Order, OrderStatus, User } from '@countrtop/models';
import { createDataClient, requireVendorUser } from '@countrtop/data';

type TabKey = 'orders' | 'orderDetail' | 'analytics' | 'account';

const vendorId = 'vendor_cafe';
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
  const dataClient = useMemo(() => createDataClient({ useMockData: true }), []);
  const [accessGranted, setAccessGranted] = useState(false);
  const [authError, setAuthError] = useState<string | null>('Vendor credential required.');
  const [user, setUser] = useState<User | null>(null);
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
    if (!accessGranted) return;

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
  }, [accessGranted, dataClient]);

  const handleUnlock = () => {
    const vendorUser: User = {
      id: 'vendor-ops',
      email: 'ops@countrtop.app',
      role: 'vendor',
      displayName: 'Ops Lead'
    };
    try {
      requireVendorUser(vendorUser);
      setAccessGranted(true);
      setAuthError(null);
      setUser(vendorUser);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Unauthorized');
    }
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

  const renderOrders = () => (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Orders queue</Text>
      {subscriptionNote && <Text style={styles.helperText}>{subscriptionNote}</Text>}
      {orders.map((order) => (
        <TouchableOpacity
          key={order.id}
          style={[
            styles.orderRow,
            selectedOrder?.id === order.id && { borderColor: '#0ea5e9', borderWidth: 1 }
          ]}
          onPress={() => {
            setSelectedOrderId(order.id);
            setActiveTab('orderDetail');
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
      {orders.length === 0 && <Text style={styles.helperText}>No orders yet.</Text>}
    </View>
  );

  const renderOrderDetail = () => (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Order detail</Text>
      {selectedOrder ? (
        <>
          <Text style={styles.orderId}>Order #{selectedOrder.id}</Text>
          <Text style={styles.orderMeta}>Placed {new Date(selectedOrder.createdAt).toLocaleTimeString()}</Text>
          <View style={{ marginTop: 12 }}>
            {selectedOrder.items.map((item, index) => (
              <View key={item.menuItemId + index} style={styles.itemRow}>
                <Text style={styles.itemName}>
                  {item.quantity} × {item.menuItemId}
                </Text>
                <Text style={styles.itemPrice}>{formatCurrency(item.price * item.quantity)}</Text>
              </View>
            ))}
          </View>
          <Text style={[styles.orderMeta, { marginTop: 12 }]}>Total {formatCurrency(selectedOrder.total)}</Text>
          <Text style={[styles.orderMeta, { marginTop: 4 }]}>
            Status: <Text style={{ fontWeight: '600' }}>{selectedOrder.status}</Text>
          </Text>
          {opsError && <Text style={[styles.helperText, { color: '#dc2626' }]}>{opsError}</Text>}
          <View style={styles.statusGrid}>
            {actionableStatuses.map((status) => (
              <TouchableOpacity
                key={status}
                disabled={updatingStatus !== null || selectedOrder.status === status}
                style={[
                  styles.statusAction,
                  selectedOrder.status === status && styles.statusActionActive,
                  updatingStatus === status && { opacity: 0.5 }
                ]}
                onPress={() => handleStatusUpdate(status)}
              >
                <Text
                  style={[
                    styles.statusActionText,
                    selectedOrder.status === status && { color: '#fff' }
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
  );

  const renderAnalytics = () => (
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
  );

  const renderAccount = () => (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Account</Text>
      <Text style={styles.orderMeta}>{user?.displayName ?? 'Vendor Ops'}</Text>
      <Text style={styles.orderMeta}>{user?.email}</Text>
      <TouchableOpacity
        style={[styles.primaryButton, { marginTop: 16 }]}
        onPress={() => {
          setAccessGranted(false);
          setOrders([]);
          setSelectedOrderId(null);
          setUser(null);
          setAuthError('Session ended.');
        }}
      >
        <Text style={styles.primaryButtonText}>Sign out</Text>
      </TouchableOpacity>
    </View>
  );

  if (!accessGranted) {
    return (
      <SafeAreaView style={[styles.container, styles.lockedScreen]}>
        <StatusBar style="light" />
        <Text style={styles.heading}>CountrTop Vendor Ops</Text>
        <Text style={[styles.helperText, { color: '#cbd5f5' }]}>Live queue + analytics</Text>
        {authError && <Text style={[styles.helperText, { color: '#fecaca' }]}>{authError}</Text>}
        <TouchableOpacity style={[styles.primaryButton, { marginTop: 24 }]} onPress={handleUnlock}>
          <Text style={styles.primaryButtonText}>Sign in as vendor</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <Text style={styles.heading}>Vendor Ops</Text>
        <Text style={styles.subheading}>Orders · Detail · Analytics · Account</Text>
      </View>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {activeTab === 'orders' && renderOrders()}
        {activeTab === 'orderDetail' && renderOrderDetail()}
        {activeTab === 'analytics' && renderAnalytics()}
        {activeTab === 'account' && renderAccount()}
      </ScrollView>
      <View style={styles.tabBar}>
        {(['orders', 'orderDetail', 'analytics', 'account'] as TabKey[]).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tabButton, activeTab === tab && styles.tabButtonActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabLabel, activeTab === tab && styles.tabLabelActive]}>
              {tab.replace(/([A-Z])/g, ' $1')}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
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
  },
  tabBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: '#111827',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderColor: '#1e293b'
  },
  tabButton: {
    paddingVertical: 4,
    paddingHorizontal: 8
  },
  tabButtonActive: {
    borderBottomWidth: 2,
    borderColor: '#0ea5e9'
  },
  tabLabel: {
    color: '#94a3b8',
    fontSize: 12
  },
  tabLabelActive: {
    color: '#fff',
    fontWeight: '600'
  }
});
