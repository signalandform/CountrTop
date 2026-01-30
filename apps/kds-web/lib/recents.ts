export type RecentVendor = {
  slug: string;
  name?: string;
  lastUsedAt: string;
};

const STORAGE_KEY = 'kds_recent_vendors';
const MAX_RECENTS = 5;

const safeParse = (raw: string | null): RecentVendor[] => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry) => typeof entry?.slug === 'string') as RecentVendor[];
  } catch {
    return [];
  }
};

export const getRecentVendors = (): RecentVendor[] => {
  if (typeof window === 'undefined') return [];
  const items = safeParse(localStorage.getItem(STORAGE_KEY));
  return items
    .sort((a, b) => new Date(b.lastUsedAt).getTime() - new Date(a.lastUsedAt).getTime())
    .slice(0, MAX_RECENTS);
};

export const addRecentVendor = (vendor: { slug: string; name?: string }): void => {
  if (typeof window === 'undefined') return;
  const current = safeParse(localStorage.getItem(STORAGE_KEY));
  const filtered = current.filter((entry) => entry.slug !== vendor.slug);
  const next: RecentVendor[] = [
    { slug: vendor.slug, name: vendor.name, lastUsedAt: new Date().toISOString() },
    ...filtered
  ].slice(0, MAX_RECENTS);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
};

export const clearRecentVendors = (): void => {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
};
