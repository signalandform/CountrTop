export type AuthProvider = 'apple' | 'google';

export type VendorStatus = 'active' | 'inactive';

// =============================================================================
// POS Provider Types
// =============================================================================

/**
 * Supported POS providers
 */
export type POSProvider = 'square' | 'toast' | 'clover';

/**
 * Order source - where the order originated
 */
export type OrderSource = 
  | 'countrtop_online'  // Order placed through CountrTop customer web/mobile
  | 'pos'               // Order placed directly at POS terminal (generic)
  | 'square_pos'        // Legacy: Square POS (deprecated, use 'pos' + posProvider)
  | 'toast_pos'         // Legacy: Toast POS  
  | 'clover_pos';       // Legacy: Clover POS

// =============================================================================
// Vendor Types
// =============================================================================

export type Vendor = {
  id: string;
  slug: string;
  displayName: string;
  /** @deprecated Use VendorLocation.externalLocationId instead */
  squareLocationId: string;
  /** POS location ID (POS-agnostic alias for squareLocationId) */
  externalLocationId?: string;
  /** @deprecated Use VendorLocation.posProvider instead */
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

export type VendorLocation = {
  id: string;
  vendorId: string;
  /** POS location ID (external ID from Square/Toast/Clover) */
  externalLocationId: string;
  /** @deprecated Use externalLocationId */
  squareLocationId: string;
  /** POS provider for this location */
  posProvider: POSProvider;
  name: string;
  isPrimary: boolean;
  isActive: boolean;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  phone?: string | null;
  timezone?: string | null;
  pickupInstructions?: string | null;
  onlineOrderingEnabled: boolean;
  kdsActiveLimitTotal?: number | null;
  kdsActiveLimitCt?: number | null;
  /** Auto-complete ready orders after X minutes (null = disabled) */
  kdsAutoBumpMinutes?: number | null;
  /** Play sound for new orders */
  kdsSoundAlertsEnabled?: boolean;
  /** KDS display mode: grid or list view */
  kdsDisplayMode?: 'grid' | 'list';
  /** Minimum minutes before pickup */
  onlineOrderingLeadTimeMinutes?: number;
  /** Operating hours JSON (day of week -> open/close times) */
  onlineOrderingHoursJson?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type PairingToken = {
  id: string;
  vendorId: string;
  locationId?: string | null;
  tokenHash: string;
  expiresAt: string;
  usedAt?: string | null;
  createdAt: string;
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
  /** POS order ID (external ID from Square/Toast/Clover) */
  externalOrderId: string;
  /** @deprecated Use externalOrderId */
  squareOrderId: string;
  posProvider?: POSProvider;
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
  /** POS order ID */
  externalOrderId: string;
  /** @deprecated Use externalOrderId */
  squareOrderId: string;
  snapshotJson: Record<string, unknown>;
  fulfillmentStatus?: string | null;
  readyAt?: string | null;
  completedAt?: string | null;
};

export type OpsOrder = {
  id: string;
  /** POS order ID */
  externalOrderId: string;
  /** @deprecated Use externalOrderId */
  squareOrderId: string;
  placedAt: string;
  status: 'new' | 'ready';
  items: OrderItem[];
  total: number;
  currency: string;
  userId: string | null;
};

// =============================================================================
// KDS Types
// =============================================================================

/**
 * POS Order data - canonical representation of order from any POS
 */
export type POSOrder = {
  /** POS order ID (external ID from Square/Toast/Clover) */
  externalOrderId: string;
  /** @deprecated Use externalOrderId */
  squareOrderId: string;
  /** POS provider that owns this order */
  posProvider?: POSProvider;
  locationId: string;
  state: string;
  createdAt: string;
  updatedAt: string;
  referenceId?: string | null;
  metadata?: Record<string, unknown> | null;
  lineItems?: unknown[] | null;
  fulfillment?: Record<string, unknown> | null;
  source: OrderSource;
  raw?: Record<string, unknown> | null;
};

/** @deprecated Use POSOrder instead */
export type SquareOrder = POSOrder;

export type KitchenTicketStatus = 'placed' | 'preparing' | 'ready' | 'completed' | 'canceled';

export type CustomerTrackingState = 'queued_up' | 'working' | 'ready' | 'enjoy';

export type KitchenTicket = {
  id: string;
  /** POS order ID */
  externalOrderId: string;
  /** @deprecated Use externalOrderId */
  squareOrderId: string;
  /** POS provider for this ticket's order */
  posProvider?: POSProvider;
  locationId: string;
  ctReferenceId?: string | null;
  customerUserId?: string | null;
  source: OrderSource;
  status: KitchenTicketStatus;
  shortcode?: string | null;
  promotedAt?: string | null;
  placedAt: string;
  readyAt?: string | null;
  completedAt?: string | null;
  canceledAt?: string | null;
  lastUpdatedByVendorUserId?: string | null;
  updatedAt: string;
  // Hold/notes/reorder features
  heldAt?: string | null;
  heldReason?: string | null;
  staffNotes?: string | null;
  customLabel?: string | null;
  priorityOrder?: number;
};

export type KitchenTicketWithOrder = {
  ticket: KitchenTicket;
  order: POSOrder;
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
