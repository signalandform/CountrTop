import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { getBrowserSupabaseClient } from '../lib/supabaseBrowser';

type OpsAdminLayoutProps = {
  userEmail?: string | null;
  children: React.ReactNode;
};

type NavItem = {
  id: string;
  label: string;
  href: string;
  icon: string;
  isActive: (path: string) => boolean;
};

export function OpsAdminLayout({ userEmail, children }: OpsAdminLayoutProps) {
  const router = useRouter();
  const [supabase] = useState(() => getBrowserSupabaseClient());
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.innerWidth < 900) {
      setCollapsed(true);
    }
  }, []);

  const currentPath = router.asPath.split('?')[0];

  const navItems = useMemo<NavItem[]>(() => {
    const isExact = (target: string) => (path: string) => path === target || path === `${target}/`;
    const isPrefix = (target: string) => (path: string) => path.startsWith(target);

    return [
      { id: 'dashboard', label: 'Dashboard', href: '/', icon: '🏠', isActive: isExact('/') },
      { id: 'vendors', label: 'Vendors', href: '/vendors', icon: '🏢', isActive: isPrefix('/vendors') },
      { id: 'support', label: 'Support', href: '/support', icon: '📧', isActive: isPrefix('/support') },
      { id: 'health', label: 'Health', href: '/health', icon: '💚', isActive: isPrefix('/health') },
      { id: 'flags', label: 'Flags', href: '/flags', icon: '🚩', isActive: isPrefix('/flags') }
    ];
  }, []);

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
    <div className={`ops-admin-layout ${collapsed ? 'collapsed' : ''}`}>
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
          <div className="ops-meta">
            <div className="ops-title">CountrTop Ops</div>
            {userEmail ? <div className="ops-user">{userEmail}</div> : null}
          </div>
        </div>

        <nav className="sidebar-nav">
          {navItems.map((item) => {
            const isActive = item.isActive(currentPath);
            return (
              <a key={item.id} href={item.href} className={`nav-item ${isActive ? 'active' : ''}`}>
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
        .ops-admin-layout {
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

        .ops-meta {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .ops-title {
          font-weight: 700;
          font-size: 16px;
        }

        .ops-user {
          font-size: 12px;
          color: var(--ct-text-muted);
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

        .ops-admin-layout.collapsed .sidebar {
          width: 76px;
          padding: 20px 12px;
        }

        .ops-admin-layout.collapsed .ops-meta,
        .ops-admin-layout.collapsed .nav-label {
          display: none;
        }

        .ops-admin-layout.collapsed .sidebar-toggle {
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
