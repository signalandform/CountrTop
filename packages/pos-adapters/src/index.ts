/**
 * POS Adapters Package
 * 
 * Unified interface for multiple POS systems (Square, Toast, Clover).
 * 
 * Usage:
 * ```typescript
 * import { getAdapterForLocation, type POSAdapter, type CanonicalOrder } from '@countrtop/pos-adapters';
 * 
 * // Preferred: Get adapter for a specific location
 * const adapter = getAdapterForLocation(location, vendor);
 * const catalog = await adapter.fetchCatalog(location.externalLocationId);
 * 
 * // Alternative: Manual adapter creation
 * import { createAdapter } from '@countrtop/pos-adapters';
 * const adapter = createAdapter({
 *   provider: 'square',
 *   credentials: { provider: 'square', accessToken: '...' },
 *   environment: 'production'
 * });
 * ```
 */

// Export all canonical types
export * from './types';

// Export adapter interface and factory
export {
  type POSAdapter,
  type POSAdapterConfig,
  type POSCredentials,
  type SquareCredentials,
  type ToastCredentials,
  type CloverCredentials,
  type POSAdapterFactory,
  createAdapter,
  registerAdapter,
  hasAdapter,
} from './adapter';

// Export Square adapter
export { SquareAdapter, createSquareAdapter } from './square';

// Export utility functions
export {
  getAdapterForVendor,
  getAdapterForLocation,
  getPOSEnvironment,
  getProviderFromSource,
  getSourceForProvider,
} from './utils';

// ---------------------------------------------------------------------------
// Auto-register adapters
// ---------------------------------------------------------------------------

import { registerAdapter } from './adapter';
import { createSquareAdapter } from './square';

// Register Square adapter on module load
registerAdapter('square', createSquareAdapter);

// Toast and Clover adapters will be added later:
// registerAdapter('toast', createToastAdapter);
// registerAdapter('clover', createCloverAdapter);

