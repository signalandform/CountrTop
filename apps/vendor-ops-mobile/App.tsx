import { useMemo, useState } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

type OrderItem = {
  name: string;
  quantity: number;
  price: number;
};

type OrderTicket = {
  id: string;
  placedAt: string;
  status: 'new' | 'preparing' | 'ready';
  items: OrderItem[];
  total: number;
};

const formatCurrency = (value: number) => `$${(value / 100).toFixed(2)}`;

const demoOrders: OrderTicket[] = [
  {
    id: 'square_order_001',
    placedAt: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
    status: 'preparing',
    total: 1650,
    items: [
      { name: 'Espresso', quantity: 2, price: 325 },
      { name: 'Butter Croissant', quantity: 1, price: 1000 }
    ]
  },
  {
    id: 'square_order_002',
    placedAt: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
    status: 'new',
    total: 1099,
    items: [{ name: 'Chipotle Chicken Sandwich', quantity: 1, price: 1099 }]
  }
];

export default function VendorOpsApp() {
  const [orders, setOrders] = useState<OrderTicket[]>(demoOrders);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(orders[0]?.id ?? null);

  const selectedOrder = useMemo(
    () => orders.find((order) => order.id === selectedOrderId) ?? orders[0] ?? null,
    [orders, selectedOrderId]
  );

  const markReady = (orderId: string) => {
    setOrders((current) =>
      current.map((order) => (order.id === orderId ? { ...order, status: 'ready' } : order))
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <Text style={styles.title}>CountrTop Vendor Ops</Text>
        <Text style={styles.subtitle}>Order queue + mark ready</Text>
      </View>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Order queue</Text>
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
          {orders.length === 0 && <Text style={styles.helperText}>No active orders.</Text>}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Order detail</Text>
          {selectedOrder ? (
            <>
              <Text style={styles.orderId}>Order #{selectedOrder.id}</Text>
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
