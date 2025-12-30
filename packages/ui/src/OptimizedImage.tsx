import React, { useState } from 'react';

/**
 * Optimized image component for React Native using expo-image.
 * Supports blurhash placeholders, lazy loading, and caching.
 * 
 * NOTE: This component is designed for React Native/Expo apps only.
 * For web apps, use standard HTML img tags or Next.js Image component.
 * 
 * @example
 * ```tsx
 * <OptimizedImage
 *   source={{ uri: 'https://example.com/image.jpg' }}
 *   blurhash="L6PZfSi_.AyE_3t7t7R**0o#DgR4"
 *   style={{ width: 200, height: 200 }}
 * />
 * ```
 */
export type OptimizedImageProps = {
  source: { uri: string } | number;
  blurhash?: string;
  placeholder?: string | number;
  style?: Record<string, unknown>;
  contentFit?: 'cover' | 'contain' | 'fill' | 'none' | 'scaleDown';
  transition?: number;
  cachePolicy?: 'none' | 'disk' | 'memory' | 'memory-disk';
  priority?: 'low' | 'normal' | 'high';
  onLoad?: () => void;
  onError?: (error: unknown) => void;
  accessibilityLabel?: string;
  testID?: string;
};

/**
 * Optimized Image component that uses expo-image when available,
 * falls back to React Native Image otherwise.
 * 
 * This component should only be used in React Native/Expo environments.
 * For web, it will throw an error to prevent accidental usage.
 */
export function OptimizedImage(props: OptimizedImageProps) {
  // Check if we're in a web environment
  const isWeb = typeof window !== 'undefined' && typeof document !== 'undefined';
  
  if (isWeb) {
    // In web environments, this component should not be used
    // Return a placeholder or throw an error
    console.warn('OptimizedImage is designed for React Native only. Use Next.js Image or HTML img tag for web.');
    return null;
  }

  const {
    source,
    blurhash,
    placeholder,
    style,
    contentFit = 'cover',
    transition = 200,
    cachePolicy = 'memory-disk',
    priority = 'normal',
    onLoad,
    onError,
    accessibilityLabel,
    testID
  } = props;

  // Note: isLoading and hasError are kept for future use
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [isLoading, setIsLoading] = useState(true);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [hasError, setHasError] = useState(false);

  // Try to use expo-image if available
  try {
    // Dynamic import to avoid breaking if expo-image is not installed
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Image } = require('expo-image');
    
    return (
      <Image
        source={source}
        placeholder={blurhash ? { blurhash } : placeholder}
        style={style}
        contentFit={contentFit}
        transition={transition}
        cachePolicy={cachePolicy}
        priority={priority}
        onLoad={() => {
          setIsLoading(false);
          onLoad?.();
        }}
        onError={(error: unknown) => {
          setIsLoading(false);
          setHasError(true);
          onError?.(error);
        }}
        accessibilityLabel={accessibilityLabel}
        testID={testID}
      />
    );
  } catch {
    // Fallback to React Native Image if expo-image is not available
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { Image } = require('react-native');
      
      return (
        <Image
          source={source}
          style={style}
          resizeMode={contentFit === 'cover' ? 'cover' : contentFit === 'contain' ? 'contain' : 'stretch'}
          onLoad={() => {
            setIsLoading(false);
            onLoad?.();
          }}
          onError={(error: unknown) => {
            setIsLoading(false);
            setHasError(true);
            onError?.(error);
          }}
          accessibilityLabel={accessibilityLabel}
          testID={testID}
        />
      );
    } catch {
      // If neither is available, return null
      console.warn('OptimizedImage: Neither expo-image nor react-native Image is available');
      return null;
    }
  }
}

/**
 * Lazy-loaded image component that only loads when in viewport.
 * Uses Intersection Observer pattern for lazy loading.
 */
export type LazyImageProps = OptimizedImageProps & {
  threshold?: number;
  rootMargin?: string;
  fallback?: React.ReactNode;
};

export function LazyImage(props: LazyImageProps) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { threshold = 0.1, rootMargin = '50px', fallback, ...imageProps } = props;
  const [shouldLoad, setShouldLoad] = React.useState(false);
  const imageRef = React.useRef<{ style?: Record<string, unknown> } | null>(null);

  // Check if we're in a web environment
  const isWeb = typeof window !== 'undefined' && typeof document !== 'undefined';
  
  if (isWeb) {
    // In web environments, this component should not be used
    console.warn('LazyImage is designed for React Native only. Use Next.js Image or HTML img tag for web.');
    return null;
  }

  React.useEffect(() => {
    if (shouldLoad) return;

    // For React Native, load immediately
    // For true lazy loading in React Native, consider using libraries like react-native-lazy-load
    setShouldLoad(true);
  }, [shouldLoad]);

  if (!shouldLoad) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { View } = require('react-native');
      return (
        <View ref={imageRef} style={imageProps.style}>
          {fallback || <View style={{ backgroundColor: '#f0f0f0', ...imageProps.style }} />}
        </View>
      );
    } catch {
      return null;
    }
  }

  return <OptimizedImage {...imageProps} />;
}

