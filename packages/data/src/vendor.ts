const BASE_DOMAINS = ['countrtop.com', 'countrtop.local'];

const normalizeHost = (host: string) => host.split(':')[0].trim().toLowerCase();

export const resolveVendorSlugFromHost = (
  host: string | null | undefined,
  fallbackSlug?: string
): string | null => {
  if (!host) return fallbackSlug ?? null;

  const normalized = normalizeHost(host);

  const matchedBase = BASE_DOMAINS.find((base) => normalized === base || normalized.endsWith(`.${base}`));
  if (!matchedBase) {
    return fallbackSlug ?? null;
  }

  const parts = normalized.split('.');
  if (parts.length >= 3) {
    return parts[0];
  }

  return fallbackSlug ?? null;
};
