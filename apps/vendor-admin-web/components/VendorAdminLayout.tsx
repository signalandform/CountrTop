import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { getBrowserSupabaseClient } from '../lib/supabaseBrowser';
import type { BillingPlanId } from '@countrtop/models';
import { canUseCrm } from '../lib/planCapabilities';

type VendorAdminLayoutProps = {
  vendorSlug: string;
  vendorName: string;
  vendorLogoUrl?: string | null;
  children: React.ReactNode;
};

type NavItem = {
  id: string;
  label: string;
  href: string;
  icon: string;
  isExternal?: boolean;
  isActive: (path: string) => boolean;
};

export function VendorAdminLayout({
  vendorSlug,
  vendorName,
  vendorLogoUrl,
  children
}: VendorAdminLayoutProps) {
  const router = useRouter();
  const [supabase] = useState(() => getBrowserSupabaseClient());
  const [collapsed, setCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [planId, setPlanId] = useState<BillingPlanId | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.innerWidth < 900) {
      setCollapsed(true);
    }
  }, []);

  useEffect(() => {
    if (!vendorSlug) return;
    let cancelled = false;
    fetch(`/api/vendors/${vendorSlug}/billing`, { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => {
        if (cancelled || !data.success || !data.data) return;
        const id = (data.data.planId as BillingPlanId) ?? 'beta';
        setPlanId(id);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [vendorSlug]);

  const closeMobileMenu = () => setMobileMenuOpen(false);

  const basePath = `/vendors/${vendorSlug}`;
  const currentPath = router.asPath.split('?')[0];

  const navItems = useMemo<NavItem[]>(() => {
    const isExact = (target: string) => (path: string) => path === target || path === `${target}/`;
    const isPrefix = (target: string) => (path: string) => path.startsWith(target);

    const items: NavItem[] = [
      {
        id: 'dashboard',
        label: 'Dashboard',
        href: basePath,
        icon: '🏠',
        isActive: isExact(basePath)
      },
      {
        id: 'analytics',
        label: 'Analytics',
        href: `${basePath}/analytics`,
        icon: '📊',
        isActive: isPrefix(`${basePath}/analytics`)
      },
      {
        id: 'orders',
        label: 'Orders',
        href: `${basePath}/orders`,
        icon: '📦',
        isActive: isPrefix(`${basePath}/orders`)
      },
      {
        id: 'locations',
        label: 'Locations',
        href: `${basePath}/locations`,
        icon: '📍',
        isActive: isPrefix(`${basePath}/locations`)
      },
      {
        id: 'settings',
        label: 'Settings',
        href: `${basePath}/settings`,
        icon: '⚙️',
        isActive: isPrefix(`${basePath}/settings`)
      },
      {
        id: 'reports',
        label: 'Time Sheet',
        href: `${basePath}/reports`,
        icon: '📋',
        isActive: isPrefix(`${basePath}/reports`)
      },
      {
        id: 'billing',
        label: 'Billing',
        href: `${basePath}/billing`,
        icon: '💳',
        isActive: isPrefix(`${basePath}/billing`)
      },
      {
        id: 'support',
        label: 'Support',
        href: `${basePath}/support`,
        icon: '📧',
        isActive: isPrefix(`${basePath}/support`)
      },
      {
        id: 'help',
        label: 'Help',
        href: `${basePath}/help`,
        icon: '❓',
        isActive: isPrefix(`${basePath}/help`)
      },
      {
        id: 'kds',
        label: 'KDS',
        href: 'https://kds.countrtop.com',
        icon: '🖥️',
        isExternal: true,
        isActive: () => false
      },
      {
        id: 'store',
        label: 'View Store',
        href: `https://${vendorSlug}.countrtop.com`,
        icon: '🌐',
        isExternal: true,
        isActive: () => false
      }
    ];

    if (planId && canUseCrm(planId)) {
      items.splice(items.length - 1, 0, {
        id: 'crm',
        label: 'CRM',
        href: `${basePath}/crm`,
        icon: '✉️',
        isActive: isPrefix(`${basePath}/crm`)
      });
    }

    return items;
  }, [basePath, vendorSlug, planId]);

  const handleSignOut = async () => {
    if (!supabase) return;
    try {
      await supabase.auth.signOut();
      window.location.href = '/login';
    } catch (err) {
      console.error('Sign out error:', err);
    }
  };

  return (
    <div className={`vendor-admin-layout ${collapsed ? 'collapsed' : ''} ${mobileMenuOpen ? 'mobile-menu-open' : ''}`}>
      {/* Mobile top bar: hamburger + vendor name */}
      <header className="mobile-topbar" aria-hidden="true">
        <button
          type="button"
          className="mobile-menu-btn"
          onClick={() => setMobileMenuOpen(true)}
          aria-label="Open menu"
        >
          ☰
        </button>
        <div className="mobile-topbar-title">
          {vendorLogoUrl && (
            <img src={vendorLogoUrl} alt="" className="mobile-topbar-logo" />
          )}
          <span>{vendorName}</span>
        </div>
      </header>

      {/* Backdrop when mobile drawer is open */}
      <div
        className="sidebar-backdrop"
        role="button"
        tabIndex={0}
        onClick={closeMobileMenu}
        onKeyDown={(e) => e.key === 'Escape' && closeMobileMenu()}
        aria-label="Close menu"
      />

      <aside className="sidebar">
        <div className="sidebar-header">
          <button
            type="button"
            className="sidebar-toggle"
            onClick={() => setCollapsed((prev) => !prev)}
            aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
          >
            ☰
          </button>
          <button
            type="button"
            className="sidebar-close-mobile"
            onClick={closeMobileMenu}
            aria-label="Close menu"
          >
            ✕
          </button>
          <div className="vendor-meta">
            {vendorLogoUrl && (
              <img src={vendorLogoUrl} alt="" className="vendor-logo" />
            )}
            <div className="vendor-name">{vendorName}</div>
            <div className="vendor-subtitle">Vendor Admin</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          {navItems.map((item) => {
            const isActive = item.isActive(currentPath);
            return (
              <a
                key={item.id}
                href={item.href}
                className={`nav-item ${isActive ? 'active' : ''}`}
                onClick={item.isExternal ? undefined : closeMobileMenu}
                {...(item.isExternal
                  ? { target: '_blank', rel: 'noopener noreferrer' }
                  : {})}
              >
                <span className="nav-icon" aria-hidden="true">
                  {item.icon}
                </span>
                <span className="nav-label">{item.label}</span>
              </a>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <button type="button" className="signout-button" onClick={handleSignOut}>
            Sign out
          </button>
        </div>
      </aside>

      <div className="layout-content">{children}</div>

      <style jsx>{`
        .vendor-admin-layout {
          min-height: 100vh;
          background: var(--ct-bg-primary);
          color: var(--ct-text);
          font-family: var(--ct-font-body);
          display: flex;
        }

        .sidebar {
          position: sticky;
          top: 0;
          height: 100vh;
          width: 240px;
          background: var(--ct-bg-surface);
          border-right: 1px solid var(--ct-card-border);
          box-shadow: var(--ct-card-shadow);
          padding: 20px 16px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .layout-content {
          flex: 1;
          min-width: 0;
          padding: 32px 36px 48px;
        }

        .sidebar-header {
          display: flex;
          align-items: flex-start;
          gap: 12px;
        }

        .sidebar-toggle {
          border: 1px solid var(--ct-card-border);
          background: var(--ct-bg-surface-warm);
          color: var(--ct-text);
          border-radius: 10px;
          width: 36px;
          height: 36px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
        }

        .vendor-meta {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .vendor-logo {
          width: 40px;
          height: 40px;
          border-radius: 12px;
          object-fit: cover;
          border: 1px solid var(--ct-card-border);
        }

        .vendor-name {
          font-weight: 700;
          font-size: 16px;
        }

        .vendor-subtitle {
          font-size: 12px;
          color: var(--ct-text-muted);
          text-transform: uppercase;
          letter-spacing: 1px;
        }

        .sidebar-nav {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .nav-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 12px;
          border-radius: 12px;
          color: var(--ct-text);
          text-decoration: none;
          border: 1px solid transparent;
          transition: all 0.2s ease;
          font-weight: 500;
        }

        .nav-item:hover {
          background: var(--ct-bg-surface-warm);
          border-color: rgba(232, 93, 4, 0.18);
        }

        .nav-item.active {
          background: rgba(232, 93, 4, 0.12);
          border-color: rgba(232, 93, 4, 0.3);
          color: var(--color-primary);
        }

        .nav-icon {
          width: 24px;
          text-align: center;
          font-size: 16px;
        }

        .sidebar-footer {
          margin-top: auto;
          padding-top: 12px;
          border-top: 1px solid var(--ct-card-border);
        }

        .signout-button {
          width: 100%;
          padding: 10px 12px;
          border-radius: 12px;
          border: 1px solid var(--ct-card-border);
          background: var(--ct-bg-surface-warm);
          color: var(--ct-text);
          font-weight: 600;
        }

        .vendor-admin-layout.collapsed .sidebar {
          width: 76px;
          padding: 20px 12px;
        }

        .vendor-admin-layout.collapsed .vendor-meta,
        .vendor-admin-layout.collapsed .nav-label {
          display: none;
        }

        .vendor-admin-layout.collapsed .sidebar-toggle {
          margin: 0 auto;
        }

        /* Mobile: top bar + drawer */
        .mobile-topbar {
          display: none;
        }

        .sidebar-backdrop {
          display: none;
        }

        .sidebar-close-mobile {
          display: none;
        }

        @media (max-width: 768px) {
          .vendor-admin-layout {
            flex-direction: column;
          }

          .mobile-topbar {
            display: flex;
            align-items: center;
            gap: 12px;
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            height: 56px;
            padding: 0 16px;
            background: var(--ct-bg-surface);
            border-bottom: 1px solid var(--ct-card-border);
            z-index: 100;
            box-shadow: var(--ct-card-shadow);
          }

          .mobile-menu-btn {
            width: 44px;
            height: 44px;
            min-width: 44px;
            min-height: 44px;
            display: flex;
            align-items: center;
            justify-content: center;
            border: 1px solid var(--ct-card-border);
            background: var(--ct-bg-surface-warm);
            color: var(--ct-text);
            border-radius: 10px;
            font-size: 20px;
            cursor: pointer;
          }

          .mobile-topbar-title {
            display: flex;
            align-items: center;
            gap: 10px;
            min-width: 0;
          }

          .mobile-topbar-title span {
            font-weight: 700;
            font-size: 16px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }

          .mobile-topbar-logo {
            width: 32px;
            height: 32px;
            border-radius: 8px;
            object-fit: cover;
            flex-shrink: 0;
          }

          .sidebar-backdrop {
            display: block;
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.4);
            z-index: 101;
            opacity: 0;
            pointer-events: none;
            transition: opacity 0.2s ease;
          }

          .vendor-admin-layout.mobile-menu-open .sidebar-backdrop {
            opacity: 1;
            pointer-events: auto;
          }

          .sidebar {
            position: fixed;
            top: 0;
            left: 0;
            bottom: 0;
            width: 280px;
            max-width: 85vw;
            z-index: 102;
            transform: translateX(-100%);
            transition: transform 0.25s ease;
            box-shadow: none;
          }

          .vendor-admin-layout.mobile-menu-open .sidebar {
            transform: translateX(0);
            box-shadow: 4px 0 24px rgba(0, 0, 0, 0.15);
          }

          .vendor-admin-layout.collapsed .sidebar {
            width: 280px;
            max-width: 85vw;
          }

          .vendor-admin-layout.collapsed .vendor-meta,
          .vendor-admin-layout.collapsed .nav-label {
            display: flex;
          }

          .vendor-admin-layout.collapsed .sidebar-toggle {
            margin: 0;
          }

          .sidebar-toggle {
            display: none;
          }

          .sidebar-close-mobile {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 36px;
            height: 36px;
            min-width: 36px;
            min-height: 36px;
            border: 1px solid var(--ct-card-border);
            background: var(--ct-bg-surface-warm);
            color: var(--ct-text);
            border-radius: 10px;
            font-size: 18px;
            cursor: pointer;
            margin-left: auto;
          }

          .layout-content {
            padding: 56px 16px 32px;
            width: 100%;
          }
        }

        @media (max-width: 900px) and (min-width: 769px) {
          .layout-content {
            padding: 24px 20px 40px;
          }
        }
      `}</style>
    </div>
  );
}
