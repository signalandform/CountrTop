import type { IncomingHttpHeaders } from 'http';

import type { User, UserRole } from './models';

export class AuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthorizationError';
  }
}

const supportedRoles: UserRole[] = ['guest', 'customer', 'vendor', 'admin'];

const normalizeHeader = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

const normalizeRole = (value: string | undefined): UserRole | null =>
  supportedRoles.includes(value as UserRole) ? (value as UserRole) : null;

export type AuthenticatedRequest = {
  headers: IncomingHttpHeaders;
};

export const hasRole = (user: User | null | undefined, role: UserRole): boolean =>
  (user?.role ?? null) === role;

export const hasAnyRole = (user: User | null | undefined, roles: UserRole[]): boolean =>
  !!user && roles.includes(user.role);

export const requireRole = (user: User | null | undefined, roles: UserRole[]): User => {
  if (!user) {
    throw new AuthorizationError('Authentication required.');
  }
  if (!hasAnyRole(user, roles)) {
    throw new AuthorizationError(`Requires one of the following roles: ${roles.join(', ')}`);
  }
  return user;
};

export const requireVendorUser = (user: User | null | undefined): User =>
  requireRole(user, ['vendor', 'admin']);

export const requireAdminUser = (user: User | null | undefined): User => requireRole(user, ['admin']);

export const resolveUserFromHeaders = (headers: IncomingHttpHeaders): User | null => {
  const role = normalizeRole(normalizeHeader(headers['x-user-role']));
  if (!role) return null;

  return {
    id: normalizeHeader(headers['x-user-id']) ?? 'anonymous',
    email: normalizeHeader(headers['x-user-email']) ?? 'user@countrtop.local',
    displayName: normalizeHeader(headers['x-user-name']) ?? undefined,
    role
  };
};

export const resolveUserFromRequest = (request: AuthenticatedRequest): User | null =>
  resolveUserFromHeaders(request.headers);
