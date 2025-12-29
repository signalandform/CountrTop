import { OrderSnapshot, Vendor, VendorInsights } from '@countrtop/models';

import { getServerDataClient } from './dataClient';

export const summarizeInsights = async (
  vendor: Vendor | null,
  orders: OrderSnapshot[],
  dataClient: ReturnType<typeof getServerDataClient>
): Promise<VendorInsights> => {
  if (!vendor) {
    return {
      orders: 0,
      uniqueCustomers: 0,
      repeatCustomers: 0,
      pointsIssued: 0,
      topReorderedItems: []
    };
  }

  const counts = new Map<string, number>();
  orders.forEach((order) => {
    if (!order.userId) return;
    counts.set(order.userId, (counts.get(order.userId) ?? 0) + 1);
  });

  // Batch loyalty entry queries using Promise.all for better performance
  const userIds = Array.from(counts.keys());
  const loyaltyEntryPromises = userIds.map((userId) =>
    dataClient.listLoyaltyEntriesForUser(vendor.id, userId)
  );
  const loyaltyEntryResults = await Promise.all(loyaltyEntryPromises);
  const pointsIssued = loyaltyEntryResults.reduce(
    (total, entries) => total + entries.reduce((sum, entry) => sum + Math.max(0, entry.pointsDelta), 0),
    0
  );

  type SnapshotItem = {
    name?: unknown;
    quantity?: unknown;
  };

  const itemCounts = new Map<string, number>();
  orders.forEach((order) => {
    const items = Array.isArray(order.snapshotJson?.items) ? order.snapshotJson.items : [];
    items.forEach((item) => {
      const raw = item as SnapshotItem;
      const label = typeof raw.name === 'string' ? raw.name : 'Item';
      const quantity = typeof raw.quantity === 'number' ? raw.quantity : 1;
      itemCounts.set(label, (itemCounts.get(label) ?? 0) + quantity);
    });
  });

  const topReorderedItems = [...itemCounts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return {
    orders: orders.length,
    uniqueCustomers: counts.size,
    repeatCustomers: [...counts.values()].filter((count) => count > 1).length,
    pointsIssued,
    topReorderedItems
  };
};
