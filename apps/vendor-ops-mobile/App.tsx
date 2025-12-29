import { useEffect, useMemo, useState } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { OpsOrder, OrderItem, validateEnvProduction, vendorOpsMobileEnvSchema } from '@countrtop/models';
import { ErrorBoundary } from '@countrtop/ui';

// Validate environment variables on startup (warn in development, fail in production)
if (__DEV__) {
  try {
    validateEnvProduction(vendorOpsMobileEnvSchema, 'vendor-ops-mobile');
  } catch (error) {
    console.warn('Environment validation warnings:', error);
  }
}

// Alias for compatibility
type OrderTicket = OpsOrder;

type ApiOrder = Partial<OrderTicket>;

const hasRequiredOrderFields = (
  order: ApiOrder
): order is ApiOrder & { id: string; squareOrderId: string; placedAt: string } =>
  typeof order.id === 'string' &&
  typeof order.squareOrderId === 'string' &&
  typeof order.placedAt === 'string';

const formatCurrency = (value: number) => `$${(value / 100).toFixed(2)}`;

const resolveApiBaseUrl = () => process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:3000';
const vendorSlug = process.env.EXPO_PUBLIC_VENDOR_SLUG ?? 'sunset';

export default function VendorOpsApp() {
  const [orders, setOrders] = useState<OrderTicket[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [orderStatus, setOrderStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [orderError, setOrderError] = useState<string | null>(null);

  const selectedOrder = useMemo(
    () => orders.find((order) => order.id === selectedOrderId) ?? orders[0] ?? null,
    [orders, selectedOrderId]
  );

  const loadOrders = async () => {
    setOrderStatus('loading');
    setOrderError(null);
    try {
      const response = await fetch(`${resolveApiBaseUrl()}/api/vendors/${vendorSlug}/ops/orders`);
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? 'Failed to load orders');
      }
      const rawOrders = Array.isArray(payload.orders) ? (payload.orders as ApiOrder[]) : [];
      const mapped: OrderTicket[] = rawOrders.filter(hasRequiredOrderFields).map((order) => ({
        id: order.id,
        squareOrderId: order.squareOrderId,
        placedAt: order.placedAt,
        status: order.status ?? 'new',
        items: Array.isArray(order.items) ? order.items : [],
        total: typeof order.total === 'number' ? order.total : 0,
        currency: typeof order.currency === 'string' ? order.currency : 'USD'
      }));
      setOrders(mapped);
      setOrderStatus('ready');
      if (mapped.length > 0 && !mapped.find((order) => order.id === selectedOrderId)) {
        setSelectedOrderId(mapped[0].id);
      }
    } catch (error) {
      setOrderStatus('error');
      setOrderError(error instanceof Error ? error.message : 'Unable to load orders');
    }
  };

  useEffect(() => {
    loadOrders();
  }, []);

  const markReady = async (orderId: string) => {
    setOrderError(null);
    try {
      const response = await fetch(`${resolveApiBaseUrl()}/api/vendors/${vendorSlug}/ops/ready`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId })
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? 'Unable to mark ready');
      }
      setOrders((current) =>
        current.map((order) => (order.id === orderId ? { ...order, status: 'ready' } : order))
      );
    } catch (error) {
      setOrderError(error instanceof Error ? error.message : 'Unable to mark ready');
    }
  };

  return (
    <ErrorBoundary
      onError={(error, errorInfo) => {
        // Log to console in development
        if (__DEV__) {
          console.error('Application error:', error, errorInfo);
        }
        // In production, send to monitoring service
        // Example: Sentry.captureException(error, { contexts: { react: errorInfo } });
      }}
    >
      <SafeAreaView style={styles.container}>
        <StatusBar style="light" />
        <View style={styles.header}>
          <Text style={styles.title}>CountrTop Vendor Ops</Text>
          <Text style={styles.subtitle}>Order queue + mark ready</Text>
        </View>
        <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Order queue</Text>
            <TouchableOpacity style={styles.refreshButton} onPress={loadOrders}>
              <Text style={styles.refreshButtonText}>Refresh</Text>
            </TouchableOpacity>
          </View>
          {orderStatus === 'loading' && <Text style={styles.helperText}>Loading orders…</Text>}
          {orderStatus === 'error' && <Text style={styles.helperText}>{orderError}</Text>}
          {orderError && orderStatus !== 'error' && (
            <Text style={[styles.helperText, styles.errorText]}>{orderError}</Text>
          )}
          {orders.map((order) => (
            <TouchableOpacity
              key={order.id}
              style={[
                styles.orderRow,
                selectedOrder?.id === order.id && { borderColor: '#38bdf8', borderWidth: 1 }
              ]}
              onPress={() => setSelectedOrderId(order.id)}
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
          {orderStatus === 'ready' && orders.length === 0 && (
            <Text style={styles.helperText}>No active orders.</Text>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Order detail</Text>
          {selectedOrder ? (
            <>
              <Text style={styles.orderId}>Order #{selectedOrder.squareOrderId.slice(-6)}</Text>
              <Text style={styles.orderMeta}>
                Placed {new Date(selectedOrder.placedAt).toLocaleTimeString()}
              </Text>
              <View style={{ marginTop: 12 }}>
                {selectedOrder.items.map((item, index) => (
                  <View key={`${item.name}-${index}`} style={styles.itemRow}>
                    <Text style={styles.itemName}>
                      {item.quantity} × {item.name}
                    </Text>
                    <Text style={styles.itemPrice}>{formatCurrency(item.price * item.quantity)}</Text>
                  </View>
                ))}
              </View>
              <Text style={[styles.orderMeta, { marginTop: 12 }]}>
                Total {formatCurrency(selectedOrder.total)}
              </Text>
              <Text style={[styles.orderMeta, { marginTop: 4 }]}>
                Status: <Text style={{ fontWeight: '600' }}>{selectedOrder.status}</Text>
              </Text>
              <TouchableOpacity
                style={[styles.primaryButton, { marginTop: 16 }]}
                disabled={selectedOrder.status === 'ready'}
                onPress={() => markReady(selectedOrder.id)}
              >
                <Text style={styles.primaryButtonText}>
                  {selectedOrder.status === 'ready' ? 'Ready sent' : 'Mark Ready'}
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <Text style={styles.helperText}>Select an order to review details.</Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a'
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 8
  },
  title: {
    color: '#fff',
    fontSize: 26,
    fontWeight: '700'
  },
  subtitle: {
    color: '#94a3b8'
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
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12
  },
  refreshButton: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#1f2937'
  },
  refreshButtonText: {
    color: '#e2e8f0',
    fontSize: 12,
    fontWeight: '600'
  },
  helperText: {
    color: '#94a3b8',
    marginTop: 8
  },
  errorText: {
    color: '#fecaca'
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
  primaryButton: {
    backgroundColor: '#38bdf8',
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
