import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { resolveVendorSlugFromHost } from '@countrtop/data/src/vendor';

export function middleware(request: NextRequest) {
  const fallback = process.env.DEFAULT_VENDOR_SLUG;
  const vendorSlug = resolveVendorSlugFromHost(request.headers.get('host'), fallback ?? undefined);

  const requestHeaders = new Headers(request.headers);
  if (vendorSlug) {
    requestHeaders.set('x-vendor-slug', vendorSlug);
  }

  return NextResponse.next({
    request: {
      headers: requestHeaders
    }
  });
}

export const config = {
  matcher: ['/((?!_next|favicon.ico).*)']
};
