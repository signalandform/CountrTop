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
  // Correlation ID for request tracing - use incoming or generate
  const requestId = request.headers.get('x-request-id') ?? crypto.randomUUID();
  requestHeaders.set('x-request-id', requestId);

  const response = NextResponse.next({
    request: {
      headers: requestHeaders
    }
  });
  response.headers.set('x-request-id', requestId);
  return response;
}

export const config = {
  matcher: ['/((?!_next|favicon.ico).*)']
};
