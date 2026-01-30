import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { getBrowserSupabaseClient } from '../lib/supabaseBrowser';

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

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.innerWidth < 900) {
      setCollapsed(true);
    }
  }, []);

  const basePath = `/vendors/${vendorSlug}`;
  const currentPath = router.asPath.split('?')[0];

  const navItems = useMemo<NavItem[]>(() => {
    const isExact = (target: string) => (path: string) => path === target || path === `${target}/`;
    const isPrefix = (target: string) => (path: string) => path.startsWith(target);

    return [
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
        id: 'workspace',
        label: 'Team',
        href: `${basePath}/workspace`,
        icon: '👥',
        isActive: isPrefix(`${basePath}/workspace`)
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
  }, [basePath, vendorSlug]);

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
    <div className={`vendor-admin-layout ${collapsed ? 'collapsed' : ''}`}>
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

        @media (max-width: 900px) {
          .layout-content {
            padding: 24px 20px 40px;
          }
        }
      `}</style>
    </div>
  );
}
