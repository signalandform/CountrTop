import React, { useState } from 'react';

/**
 * Optimized image component for React Native using expo-image.
 * Supports blurhash placeholders, lazy loading, and caching.
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
  style?: any;
  contentFit?: 'cover' | 'contain' | 'fill' | 'none' | 'scaleDown';
  transition?: number;
  cachePolicy?: 'none' | 'disk' | 'memory' | 'memory-disk';
  priority?: 'low' | 'normal' | 'high';
  onLoad?: () => void;
  onError?: (error: any) => void;
  accessibilityLabel?: string;
  testID?: string;
};

/**
 * Optimized Image component that uses expo-image when available,
 * falls back to React Native Image otherwise.
 */
export function OptimizedImage(props: OptimizedImageProps) {
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

  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  // Try to use expo-image if available
  try {
    // Dynamic import to avoid breaking if expo-image is not installed
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
        onError={(error: any) => {
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
        onError={(error: any) => {
          setIsLoading(false);
          setHasError(true);
          onError?.(error);
        }}
        accessibilityLabel={accessibilityLabel}
        testID={testID}
      />
    );
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
  const { threshold = 0.1, rootMargin = '50px', fallback, ...imageProps } = props;
  const [shouldLoad, setShouldLoad] = React.useState(false);
  const imageRef = React.useRef<any>(null);

  React.useEffect(() => {
    if (shouldLoad) return;

    // For React Native, we'll use a simpler approach - load immediately
    // In a web environment, you could use Intersection Observer
    // For true lazy loading in React Native, consider using libraries like react-native-lazy-load
    const isWeb = typeof window !== 'undefined' && typeof window.IntersectionObserver !== 'undefined';
    
    if (isWeb) {
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              setShouldLoad(true);
              observer.disconnect();
            }
          });
        },
        { threshold, rootMargin }
      );

      if (imageRef.current) {
        observer.observe(imageRef.current);
      }

      return () => {
        observer.disconnect();
      };
    } else {
      // React Native: Load immediately or use a viewport detection library
      setShouldLoad(true);
    }
  }, [shouldLoad, threshold, rootMargin]);

  if (!shouldLoad) {
    // Use React Native View for React Native, div for web
    const isWeb = typeof window !== 'undefined';
    if (isWeb) {
      const { default: ReactDOM } = require('react-dom');
      return (
        <div ref={imageRef} style={imageProps.style}>
          {fallback || <div style={{ backgroundColor: '#f0f0f0', ...imageProps.style }} />}
        </div>
      );
    } else {
      const { View } = require('react-native');
      return (
        <View ref={imageRef} style={imageProps.style}>
          {fallback || <View style={{ backgroundColor: '#f0f0f0', ...imageProps.style }} />}
        </View>
      );
    }
  }

  return <OptimizedImage {...imageProps} />;
}

