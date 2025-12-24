import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import { CSSProperties, useEffect, useMemo, useState } from 'react';

import { resolveVendorSlugFromHost } from '@countrtop/data';
import { getServerDataClient } from '../lib/dataClient';
import { getBrowserSupabaseClient } from '../lib/supabaseBrowser';

type MenuItem = {
  id: string;
  name: string;
  description?: string;
  price: number;
  currency: string;
  variationId: string;
  imageUrl?: string | null;
};

type CartItem = MenuItem & { quantity: number };

type OrderHistoryEntry = {
  id: string;
  placedAt: string;
  squareOrderId: string;
  snapshotJson: {
    items?: Array<{ id: string; name: string; quantity: number; price: number }>;
    total?: number;
    currency?: string;
  };
};

type CustomerHomeProps = {
  vendorSlug: string | null;
  vendorName: string;
};

export const getServerSideProps: GetServerSideProps<CustomerHomeProps> = async ({ req }) => {
  const fallback = process.env.DEFAULT_VENDOR_SLUG;
  const vendorSlug = resolveVendorSlugFromHost(req.headers.host, fallback);
  const dataClient = getServerDataClient();
  const vendor = vendorSlug ? await dataClient.getVendorBySlug(vendorSlug) : null;

  return {
    props: {
      vendorSlug: vendorSlug ?? null,
      vendorName: vendor?.displayName ?? 'CountrTop'
    }
  };
};

const formatCurrency = (value: number, currency: string) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2
  }).format(value / 100);

export default function CustomerHome({ vendorSlug, vendorName }: CustomerHomeProps) {
  const appleEnabled = process.env.NEXT_PUBLIC_APPLE_SIGNIN === 'true';
  const [isClient, setIsClient] = useState(false);
  const [supabase, setSupabase] = useState<ReturnType<typeof getBrowserSupabaseClient>>(null);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [menuStatus, setMenuStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [menuError, setMenuError] = useState<string | null>(null);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [checkingOut, setCheckingOut] = useState(false);
  const [authStatus, setAuthStatus] = useState<'idle' | 'loading' | 'ready'>('idle');
  const [authUser, setAuthUser] = useState<{ id: string; email?: string | null } | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [orderHistory, setOrderHistory] = useState<OrderHistoryEntry[]>([]);
  const [orderStatus, setOrderStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [orderError, setOrderError] = useState<string | null>(null);
  const [loyaltyBalance, setLoyaltyBalance] = useState<number | null>(null);

  const cartTotal = useMemo(() => {
    return cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  }, [cartItems]);

  const cartCurrency = cartItems[0]?.currency ?? 'USD';

  const loadMenu = async () => {
    if (!vendorSlug) return;
    setMenuStatus('loading');
    setMenuError(null);
    try {
      const response = await fetch(`/api/vendors/${vendorSlug}/catalog`);
      const payload = await response.json();
      if (!payload.ok) {
        throw new Error(payload.error ?? 'Failed to load menu');
      }
      setMenuItems(payload.items);
      setMenuStatus('ready');
    } catch (error) {
      setMenuStatus('error');
      setMenuError(error instanceof Error ? error.message : 'Unable to load menu');
    }
  };

  useEffect(() => {
    if (menuStatus === 'idle' && vendorSlug) {
      void loadMenu();
    }
  }, [menuStatus, vendorSlug]);

  useEffect(() => {
    setIsClient(true);
    setSupabase(getBrowserSupabaseClient());
  }, []);

  useEffect(() => {
    if (!supabase) return;
    setAuthStatus('loading');
    supabase.auth
      .getSession()
      .then(({ data }) => {
        const sessionUser = data.session?.user ?? null;
        setAuthUser(sessionUser ? { id: sessionUser.id, email: sessionUser.email } : null);
        setAuthStatus('ready');
      })
      .catch((error) => {
        setAuthError(error instanceof Error ? error.message : 'Unable to load session');
        setAuthStatus('ready');
      });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      const sessionUser = session?.user ?? null;
      setAuthUser(sessionUser ? { id: sessionUser.id, email: sessionUser.email } : null);
    });

    return () => {
      data.subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    if (!authUser || !vendorSlug) return;
    setOrderStatus('loading');
    setOrderError(null);
    fetch(`/api/vendors/${vendorSlug}/orders?userId=${encodeURIComponent(authUser.id)}`)
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok || !payload.ok) {
          throw new Error(payload.error ?? 'Failed to load order history');
        }
        setOrderHistory(payload.orders ?? []);
        setOrderStatus('ready');
      })
      .catch((error) => {
        setOrderStatus('error');
        setOrderError(error instanceof Error ? error.message : 'Unable to load order history');
      });
  }, [authUser, vendorSlug]);

  useEffect(() => {
    if (!authUser || !vendorSlug) return;
    fetch(`/api/vendors/${vendorSlug}/loyalty/${encodeURIComponent(authUser.id)}`)
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok || !payload.ok) {
          throw new Error(payload.error ?? 'Failed to load loyalty');
        }
        setLoyaltyBalance(payload.balance ?? 0);
      })
      .catch(() => {
        setLoyaltyBalance(null);
      });
  }, [authUser, vendorSlug]);

  const addToCart = (item: MenuItem) => {
    setCartItems((current) => {
      const existing = current.find((entry) => entry.id === item.id);
      if (existing) {
        return current.map((entry) =>
          entry.id === item.id ? { ...entry, quantity: entry.quantity + 1 } : entry
        );
      }
      return [...current, { ...item, quantity: 1 }];
    });
  };

  const removeFromCart = (itemId: string) => {
    setCartItems((current) =>
      current
        .map((entry) =>
          entry.id === itemId ? { ...entry, quantity: Math.max(0, entry.quantity - 1) } : entry
        )
        .filter((entry) => entry.quantity > 0)
    );
  };

  const handleCheckout = async () => {
    if (!vendorSlug || cartItems.length === 0) return;
    setCheckoutError(null);
    setCheckingOut(true);
    try {
      const response = await fetch(`/api/vendors/${vendorSlug}/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: authUser?.id ?? null,
          items: cartItems.map((item) => ({
            id: item.id,
            name: item.name,
            price: item.price,
            currency: item.currency,
            quantity: item.quantity,
            variationId: item.variationId
          }))
        })
      });
      const payload = await response.json();
      if (!payload.ok) {
        throw new Error(payload.error ?? 'Checkout failed');
      }
      const snapshot = {
        squareOrderId: payload.squareOrderId,
        items: cartItems.map((item) => ({
          id: item.id,
          name: item.name,
          quantity: item.quantity,
          price: item.price
        })),
        total: cartTotal,
        currency: cartCurrency
      };
      sessionStorage.setItem(`ct_order_${payload.orderId}`, JSON.stringify(snapshot));
      window.location.href = payload.checkoutUrl;
    } catch (error) {
      setCheckoutError(error instanceof Error ? error.message : 'Unable to start checkout');
    } finally {
      setCheckingOut(false);
    }
  };

  const handleReorder = (entry: OrderHistoryEntry) => {
    const items = entry.snapshotJson?.items ?? [];
    if (!items.length) return;
    setCartItems(
      items.map((item) => ({
        id: item.id,
        name: item.name,
        price: item.price,
        currency: entry.snapshotJson?.currency ?? 'USD',
        variationId: item.id,
        quantity: item.quantity
      }))
    );
  };

  const startOAuth = async (provider: 'apple' | 'google') => {
    if (!supabase) {
      setAuthError('Supabase auth is not configured for this environment.');
      return;
    }
    setAuthError(null);
    try {
      await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: window.location.origin
        }
      });
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Unable to start sign-in');
    }
  };

  const signOut = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
  };

  const authReady = isClient && supabase;

  return (
    <>
      <Head>
        <title>{`${vendorName} · CountrTop`}</title>
      </Head>
      <main style={styles.page}>
        <section style={styles.hero}>
          <div style={styles.heroCard}>
            <p style={styles.heroEyebrow}>CountrTop</p>
            <h1 style={styles.heroTitle}>{vendorName}</h1>
            <p style={styles.heroSubtitle}>
              Order fast, earn points, and get notified when it&apos;s ready.
            </p>
            <div style={styles.heroBadgeRow}>
              <span style={styles.heroBadge}>Square checkout</span>
              <span style={styles.heroBadge}>Pickup only</span>
              <span style={styles.heroBadge}>No account needed</span>
            </div>
          </div>
        </section>

        <section style={styles.content} className="ct-grid">
          <div style={styles.menuColumn}>
            <div style={styles.accountCard}>
              <div style={styles.sectionHeader}>
                <h2 style={styles.sectionTitle}>Account</h2>
                {authUser && (
                  <button type="button" onClick={signOut} style={styles.refreshButton}>
                    Sign out
                  </button>
                )}
              </div>
              {!authReady && <p style={styles.helperText}>Loading sign-in…</p>}
              {isClient && !supabase && (
                <p style={{ ...styles.helperText, color: '#b91c1c' }}>
                  Supabase auth is not configured.
                </p>
              )}
              {authUser ? (
                <div style={styles.accountRow}>
                  <div>
                    <div style={styles.accountName}>Signed in</div>
                    <div style={styles.accountMeta}>{authUser.email ?? authUser.id}</div>
                  </div>
                  <div style={styles.pointsChip}>
                    {loyaltyBalance !== null ? `${loyaltyBalance} pts` : '—'}
                  </div>
                </div>
              ) : (
                <div style={styles.authButtons}>
                  {appleEnabled && (
                    <button type="button" style={styles.authButton} onClick={() => startOAuth('apple')}>
                      Sign in with Apple
                    </button>
                  )}
                  <button type="button" style={styles.authButton} onClick={() => startOAuth('google')}>
                    Sign in with Google
                  </button>
                </div>
              )}
              {authError && <p style={{ ...styles.helperText, color: '#b91c1c' }}>{authError}</p>}
              {authUser && (
                <p style={styles.helperText}>
                  Points accumulate automatically after each completed order.
                </p>
              )}
            </div>

            <div style={styles.sectionHeader}>
              <h2 style={styles.sectionTitle}>Menu</h2>
              <button type="button" onClick={loadMenu} style={styles.refreshButton}>
                Refresh
              </button>
            </div>
            {!vendorSlug && (
              <p style={{ ...styles.helperText, color: '#b91c1c' }}>No vendor resolved for this host.</p>
            )}
            {menuStatus === 'loading' && <p style={styles.helperText}>Loading Square catalog…</p>}
            {menuStatus === 'error' && (
              <p style={{ ...styles.helperText, color: '#b91c1c' }}>{menuError}</p>
            )}
            <div style={styles.menuGrid}>
              {menuItems.map((item) => (
                <div key={item.id} style={styles.menuCard}>
                  <div style={styles.menuImage}>
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt={item.name} style={styles.menuImgTag} />
                    ) : (
                      <span style={styles.menuPlaceholder}>☕</span>
                    )}
                  </div>
                  <div style={styles.menuInfo}>
                    <div style={styles.menuTopRow}>
                      <h3 style={styles.menuName}>{item.name}</h3>
                      <span style={styles.menuPrice}>{formatCurrency(item.price, item.currency)}</span>
                    </div>
                    <p style={styles.menuDescription}>{item.description ?? 'Seasonal favorite.'}</p>
                  </div>
                  <button type="button" style={styles.menuButton} onClick={() => addToCart(item)}>
                    Add to cart
                  </button>
                </div>
              ))}
              {menuStatus === 'ready' && menuItems.length === 0 && (
                <p style={styles.helperText}>No menu items available yet.</p>
              )}
            </div>

            {authUser && (
              <div style={styles.historyCard}>
                <div style={styles.sectionHeader}>
                  <h2 style={styles.sectionTitle}>Order history</h2>
                  <span style={styles.cartCount}>{orderHistory.length} orders</span>
                </div>
                {orderStatus === 'loading' && <p style={styles.helperText}>Loading history…</p>}
                {orderStatus === 'error' && (
                  <p style={{ ...styles.helperText, color: '#b91c1c' }}>{orderError}</p>
                )}
                {orderStatus === 'ready' && orderHistory.length === 0 && (
                  <p style={styles.helperText}>No orders yet. Your first order will appear here.</p>
                )}
                {orderHistory.map((order) => (
                  <div key={order.id} style={styles.historyRow}>
                    <div>
                      <div style={styles.historyTitle}>Order {order.squareOrderId.slice(-6)}</div>
                      <div style={styles.historyMeta}>
                        {new Date(order.placedAt).toLocaleString()} ·{' '}
                        {formatCurrency(order.snapshotJson?.total ?? 0, order.snapshotJson?.currency ?? 'USD')}
                      </div>
                    </div>
                    <button
                      type="button"
                      style={styles.historyButton}
                      onClick={() => handleReorder(order)}
                    >
                      Order again
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <aside style={styles.cartColumn} className="ct-cart">
            <div style={styles.cartCard}>
              <div style={styles.sectionHeader}>
                <h2 style={styles.sectionTitle}>Your cart</h2>
                <span style={styles.cartCount}>{cartItems.length} items</span>
              </div>
              {cartItems.length === 0 ? (
                <p style={styles.helperText}>Add items to start your order.</p>
              ) : (
                <div style={styles.cartList}>
                  {cartItems.map((item) => (
                    <div key={item.id} style={styles.cartRow}>
                      <div>
                        <div style={styles.cartName}>{item.name}</div>
                        <div style={styles.cartMeta}>
                          {formatCurrency(item.price, item.currency)} · Qty {item.quantity}
                        </div>
                      </div>
                      <div style={styles.cartActions}>
                        <button
                          type="button"
                          style={styles.cartActionButton}
                          onClick={() => removeFromCart(item.id)}
                        >
                          −
                        </button>
                        <button
                          type="button"
                          style={styles.cartActionButton}
                          onClick={() => addToCart(item)}
                        >
                          +
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div style={styles.cartFooter}>
                <div style={styles.cartTotalRow}>
                  <span>Total</span>
                  <strong>{formatCurrency(cartTotal, cartCurrency)}</strong>
                </div>
                <button
                  type="button"
                  style={{
                    ...styles.checkoutButton,
                    opacity: cartItems.length === 0 || checkingOut ? 0.6 : 1
                  }}
                  disabled={cartItems.length === 0 || checkingOut}
                  onClick={handleCheckout}
                >
                  {checkingOut ? 'Starting checkout…' : 'Checkout with Square'}
                </button>
                {checkoutError && (
                  <p style={{ ...styles.helperText, color: '#b91c1c' }}>{checkoutError}</p>
                )}
              </div>
            </div>
          </aside>
        </section>
        <style jsx>{`
          @media (max-width: 960px) {
            .ct-grid {
              grid-template-columns: 1fr;
            }

            .ct-cart {
              position: static;
            }
          }
        `}</style>
      </main>
    </>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: 'radial-gradient(circle at top, #f1f5f9, #e2e8f0)',
    color: '#0f172a',
    fontFamily: '"Space Grotesk", "Segoe UI", sans-serif'
  },
  hero: {
    padding: '48px 8vw 24px'
  },
  heroCard: {
    background: 'linear-gradient(120deg, #0f172a, #1e293b)',
    color: '#f8fafc',
    padding: '32px',
    borderRadius: 24,
    boxShadow: '0 24px 60px rgba(15, 23, 42, 0.25)'
  },
  heroEyebrow: {
    textTransform: 'uppercase',
    letterSpacing: 2,
    fontSize: 12,
    color: '#94a3b8',
    margin: 0
  },
  heroTitle: {
    fontSize: 36,
    margin: '8px 0 12px'
  },
  heroSubtitle: {
    fontSize: 16,
    maxWidth: 520,
    color: '#cbd5f5',
    margin: 0
  },
  heroBadgeRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 16
  },
  heroBadge: {
    backgroundColor: 'rgba(148, 163, 184, 0.2)',
    borderRadius: 999,
    padding: '6px 12px',
    fontSize: 12
  },
  content: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 2fr) minmax(280px, 1fr)',
    gap: 24,
    padding: '24px 8vw 80px'
  },
  menuColumn: {
    minWidth: 0
  },
  accountCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
    boxShadow: '0 16px 32px rgba(15, 23, 42, 0.08)'
  },
  accountRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12
  },
  accountName: {
    fontWeight: 600
  },
  accountMeta: {
    color: '#64748b',
    fontSize: 13
  },
  authButtons: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 12
  },
  authButton: {
    flex: '1 1 180px',
    padding: '10px 14px',
    borderRadius: 12,
    border: '1px solid #0f172a',
    backgroundColor: '#fff',
    color: '#0f172a',
    fontWeight: 600,
    cursor: 'pointer'
  },
  pointsChip: {
    backgroundColor: '#0f172a',
    color: '#fff',
    borderRadius: 999,
    padding: '6px 12px',
    fontSize: 12,
    fontWeight: 600
  },
  cartColumn: {
    position: 'sticky',
    top: 24,
    alignSelf: 'start'
  },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16
  },
  sectionTitle: {
    fontSize: 20,
    margin: 0
  },
  refreshButton: {
    border: '1px solid #cbd5f5',
    padding: '6px 12px',
    borderRadius: 999,
    backgroundColor: '#f8fafc',
    cursor: 'pointer'
  },
  menuGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: 16
  },
  historyCard: {
    marginTop: 24,
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    boxShadow: '0 16px 32px rgba(15, 23, 42, 0.08)'
  },
  historyRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    border: '1px solid #e2e8f0',
    borderRadius: 16,
    padding: '12px 14px',
    marginBottom: 12
  },
  historyTitle: {
    fontWeight: 600
  },
  historyMeta: {
    fontSize: 12,
    color: '#64748b'
  },
  historyButton: {
    padding: '8px 12px',
    borderRadius: 12,
    border: '1px solid #0f172a',
    backgroundColor: '#fff',
    color: '#0f172a',
    fontWeight: 600,
    cursor: 'pointer'
  },
  menuCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    boxShadow: '0 16px 32px rgba(15, 23, 42, 0.08)'
  },
  menuImage: {
    height: 140,
    borderRadius: 16,
    backgroundColor: '#e2e8f0',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden'
  },
  menuImgTag: {
    width: '100%',
    height: '100%',
    objectFit: 'cover'
  },
  menuPlaceholder: {
    fontSize: 32
  },
  menuInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6
  },
  menuTopRow: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 12
  },
  menuName: {
    fontSize: 16,
    margin: 0
  },
  menuPrice: {
    fontWeight: 600
  },
  menuDescription: {
    margin: 0,
    color: '#64748b',
    fontSize: 13
  },
  menuButton: {
    borderRadius: 12,
    padding: '10px 12px',
    backgroundColor: '#0f172a',
    color: '#fff',
    border: 'none',
    cursor: 'pointer'
  },
  cartCard: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 20,
    boxShadow: '0 20px 40px rgba(15, 23, 42, 0.12)'
  },
  cartCount: {
    fontSize: 12,
    color: '#64748b'
  },
  cartList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12
  },
  cartRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    border: '1px solid #e2e8f0',
    borderRadius: 16,
    padding: '12px 14px'
  },
  cartName: {
    fontWeight: 600
  },
  cartMeta: {
    fontSize: 12,
    color: '#64748b'
  },
  cartActions: {
    display: 'flex',
    gap: 8
  },
  cartActionButton: {
    width: 28,
    height: 28,
    borderRadius: 8,
    border: '1px solid #cbd5f5',
    backgroundColor: '#f8fafc',
    cursor: 'pointer'
  },
  cartFooter: {
    marginTop: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 12
  },
  cartTotalRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: 16
  },
  checkoutButton: {
    padding: '12px 16px',
    borderRadius: 14,
    border: 'none',
    backgroundColor: '#38bdf8',
    color: '#0f172a',
    fontWeight: 700,
    cursor: 'pointer'
  },
  helperText: {
    margin: 0,
    color: '#64748b',
    fontSize: 13
  }
};
