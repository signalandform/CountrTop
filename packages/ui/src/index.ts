export { Section } from './Section';
export { StatCard } from './StatCard';
export { ErrorBoundary } from './ErrorBoundary';
export { brandColors, brandRadii, brandSpacing, brandTypography, brandTheme } from './theme';
// OptimizedImage and LazyImage are React Native only
// Export types for TypeScript, but components should be imported directly in mobile apps
// For web apps, these components are not available (use Next.js Image instead)
export type { OptimizedImageProps, LazyImageProps } from './OptimizedImage';
export { useAuth } from './hooks/useAuth';
export type { AuthUser, AuthStatus, UseAuthOptions, UseAuthReturn } from './hooks/useAuth';
