# KDS Schema Documentation

## Tables

### `square_orders`
Mirror of Square orders for rendering/debugging. Stores minimal JSON-first schema.

**Columns:**
- `square_order_id` (TEXT, PRIMARY KEY) - Square order ID
- `location_id` (TEXT, NOT NULL) - Square location ID
- `state` (TEXT, NOT NULL) - Square order state (e.g., 'OPEN', 'COMPLETED')
- `created_at` (TIMESTAMPTZ, NOT NULL) - Order creation timestamp
- `updated_at` (TIMESTAMPTZ, NOT NULL) - Last update timestamp
- `reference_id` (TEXT, NULL) - Optional reference ID
- `metadata` (JSONB, NULL) - Order metadata
- `line_items` (JSONB, NULL) - Order line items array
- `fulfillment` (JSONB, NULL) - Fulfillment information
- `source` (TEXT, NOT NULL) - Source: 'countrtop_online' or 'square_pos'
- `raw` (JSONB, NULL) - Raw Square order payload for debugging

**Indexes:**
- `square_orders_location_updated_idx` - (location_id, updated_at DESC) for KDS queries
- `square_orders_state_idx` - (state) for filtering by state
- `square_orders_reference_id_idx` - (reference_id) for lookup by reference

### `kitchen_tickets`
CountrTop canonical kitchen ticket state machine. Independent from Square order state.

**Columns:**
- `id` (UUID, PRIMARY KEY) - Ticket ID
- `square_order_id` (TEXT, NOT NULL, UNIQUE) - Reference to square_orders (CASCADE DELETE)
- `location_id` (TEXT, NOT NULL) - Denormalized location ID for fast queries
- `ct_reference_id` (TEXT, NULL) - CountrTop reference ID
- `customer_user_id` (UUID, NULL) - Customer user ID if from CountrTop
- `source` (TEXT, NOT NULL) - Source: 'countrtop_online' or 'square_pos'
- `status` (TEXT, NOT NULL) - Status: 'placed', 'preparing', 'ready', 'completed', 'canceled'
- `shortcode` (TEXT, NULL) - Auto-generated 4-character uppercase shortcode (unique per location)
- `promoted_at` (TIMESTAMPTZ, NULL) - Timestamp when ticket was promoted from queued to active
- `placed_at` (TIMESTAMPTZ, NOT NULL) - When order was placed
- `ready_at` (TIMESTAMPTZ, NULL) - When order was marked ready
- `completed_at` (TIMESTAMPTZ, NULL) - When order was completed
- `canceled_at` (TIMESTAMPTZ, NULL) - When order was canceled
- `last_updated_by_vendor_user_id` (UUID, NULL) - Vendor user who last updated
- `updated_at` (TIMESTAMPTZ, NOT NULL) - Last update timestamp

**Indexes:**
- `kitchen_tickets_location_status_idx` - (location_id, status) for KDS queue queries
- `kitchen_tickets_location_placed_idx` - (location_id, placed_at DESC) for sorting
- `kitchen_tickets_updated_at_idx` - (updated_at DESC) for recent updates
- `kitchen_tickets_location_shortcode_unique` - UNIQUE (location_id, shortcode) for shortcode uniqueness
- `kitchen_tickets_shortcode_idx` - (shortcode) for fast shortcode lookups

**Constraints:**
- `square_order_id` is UNIQUE - enables UPSERT operations
- Foreign key to `square_orders` with CASCADE DELETE - ticket deleted when order deleted
- `(location_id, shortcode)` is UNIQUE - ensures shortcodes are unique per location

**Triggers:**
- `trg_kitchen_tickets_set_shortcode` - BEFORE INSERT trigger that auto-generates a unique 4-character uppercase shortcode if not provided

## TypeScript Models

### `SquareOrder`
```typescript
type SquareOrder = {
  squareOrderId: string;
  locationId: string;
  state: string;
  createdAt: string;
  updatedAt: string;
  referenceId?: string | null;
  metadata?: Record<string, unknown> | null;
  lineItems?: unknown[] | null;
  fulfillment?: Record<string, unknown> | null;
  source: 'countrtop_online' | 'square_pos';
  raw?: Record<string, unknown> | null;
};
```

### `KitchenTicket`
```typescript
type KitchenTicket = {
  id: string;
  squareOrderId: string;
  locationId: string;
  ctReferenceId?: string | null;
  customerUserId?: string | null;
  source: 'countrtop_online' | 'square_pos';
  status: 'placed' | 'preparing' | 'ready' | 'completed' | 'canceled';
  shortcode?: string | null;
  promotedAt?: string | null;
  placedAt: string;
  readyAt?: string | null;
  completedAt?: string | null;
  canceledAt?: string | null;
  lastUpdatedByVendorUserId?: string | null;
  updatedAt: string;
};
```

## Mapping Helpers

Located in `packages/data/src/supabaseClient.ts`:

- `mapSquareOrderFromRow(row)` - Maps database row to SquareOrder model
- `toSquareOrderUpsert(order)` - Converts SquareOrder to database Insert/Update shape
- `mapKitchenTicketFromRow(row)` - Maps database row to KitchenTicket model
- `toKitchenTicketInsert(ticket)` - Converts KitchenTicket to database Insert shape

## Usage Example

```typescript
import { mapSquareOrderFromRow, toSquareOrderUpsert } from '@countrtop/data';

// Upsert a Square order
const orderData = toSquareOrderUpsert({
  squareOrderId: 'order_123',
  locationId: 'loc_456',
  state: 'OPEN',
  source: 'countrtop_online',
  lineItems: [...],
  // ... other fields
});

await supabase
  .from('square_orders')
  .upsert(orderData, { onConflict: 'square_order_id' });

// Create/update kitchen ticket
const ticketData = toKitchenTicketInsert({
  squareOrderId: 'order_123',
  locationId: 'loc_456',
  source: 'countrtop_online',
  status: 'placed',
});

await supabase
  .from('kitchen_tickets')
  .upsert(ticketData, { onConflict: 'square_order_id' });
```

