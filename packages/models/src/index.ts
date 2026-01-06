export type AuthProvider = 'apple' | 'google';

export type VendorStatus = 'active' | 'inactive';

export type Vendor = {
  id: string;
  slug: string;
  displayName: string;
  squareLocationId: string;
  squareCredentialRef?: string;
  status?: VendorStatus;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  phone?: string | null;
  timezone?: string | null;
  pickupInstructions?: string | null;
  kdsActiveLimitTotal?: number | null;
  kdsActiveLimitCt?: number | null;
  // Theming fields
  logoUrl?: string | null;
  primaryColor?: string | null;
  accentColor?: string | null;
  fontFamily?: string | null;
};

export type Employee = {
  id: string;
  vendorId: string;
  name: string;
  pin: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type TimeEntry = {
  id: string;
  vendorId: string;
  employeeId: string;
  clockInAt: string;
  clockOutAt: string | null;
  locationId: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type User = {
  id: string;
  provider: AuthProvider;
  providerUserId: string;
  displayName?: string;
};

export type OrderSnapshot = {
  id: string;
  vendorId: string;
  userId?: string | null;
  squareOrderId: string;
  placedAt: string;
  snapshotJson: Record<string, unknown>;
  fulfillmentStatus?: string | null;
  readyAt?: string | null;
  completedAt?: string | null;
  updatedAt?: string | null;
  customerDisplayName?: string | null;
  pickupLabel?: string | null;
};

export type LoyaltyLedgerEntry = {
  id: string;
  vendorId: string;
  userId: string;
  orderId: string;
  pointsDelta: number;
  createdAt: string;
};

export type PushPlatform = 'ios' | 'android' | 'web';

export type PushDevice = {
  id: string;
  userId: string;
  deviceToken: string;
  platform: PushPlatform;
  createdAt: string;
  updatedAt?: string | null;
};

export type VendorInsights = {
  orders: number;
  uniqueCustomers: number;
  repeatCustomers: number;
  pointsIssued: number;
  topReorderedItems: { label: string; count: number }[];
};

// Menu and Catalog Types
export type MenuItem = {
  id: string;
  name: string;
  description?: string;
  price: number;
  currency: string;
  variationId: string;
  imageUrl?: string | null;
};

export type CartItem = MenuItem & {
  quantity: number;
};

// Re-export analytics types
export * from './analytics';

// Order Types
export type OrderItem = {
  name: string;
  quantity: number;
  price: number;
};

export type OrderHistoryEntry = {
  id: string;
  placedAt: string;
  squareOrderId: string;
  snapshotJson: Record<string, unknown>;
  fulfillmentStatus?: string | null;
  readyAt?: string | null;
  completedAt?: string | null;
};

export type OpsOrder = {
  id: string;
  squareOrderId: string;
  placedAt: string;
  status: 'new' | 'ready';
  items: OrderItem[];
  total: number;
  currency: string;
  userId: string | null;
};

// KDS Types
export type SquareOrder = {
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

export type KitchenTicketStatus = 'placed' | 'preparing' | 'ready' | 'completed' | 'canceled';

export type CustomerTrackingState = 'queued_up' | 'working' | 'ready' | 'enjoy';

export type KitchenTicket = {
  id: string;
  squareOrderId: string;
  locationId: string;
  ctReferenceId?: string | null;
  customerUserId?: string | null;
  source: 'countrtop_online' | 'square_pos';
  status: KitchenTicketStatus;
  shortcode?: string | null;
  promotedAt?: string | null;
  placedAt: string;
  readyAt?: string | null;
  completedAt?: string | null;
  canceledAt?: string | null;
  lastUpdatedByVendorUserId?: string | null;
  updatedAt: string;
};

export type KitchenTicketWithOrder = {
  ticket: KitchenTicket;
  order: SquareOrder;
};

// Environment validation exports
export {
  validateEnv,
  validateEnvOrThrow,
  validateEnvProduction,
  validateUrl,
  validateNonEmpty,
  validateBoolean,
  customerWebEnvSchema,
  vendorAdminWebEnvSchema,
  customerMobileEnvSchema,
  vendorOpsMobileEnvSchema
} from './env';
export type { EnvValidationResult, EnvSchema } from './env';
