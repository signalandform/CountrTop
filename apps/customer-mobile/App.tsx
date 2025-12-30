import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import * as WebBrowser from 'expo-web-browser';

import { validateEnvProduction, customerMobileEnvSchema } from '@countrtop/models';
import { ErrorBoundary } from '@countrtop/ui';

import {
  ensureNotificationPermissions,
  getStoredPushToken,
  obtainExpoPushToken,
  StoredPushToken
} from './notifications/pushNotifications';

// Validate environment variables on startup (warn in development, fail in production)
if (__DEV__) {
  try {
    validateEnvProduction(customerMobileEnvSchema, 'customer-mobile');
  } catch (error) {
    console.warn('Environment validation warnings:', error);
  }
}

const resolveCustomerUrl = () => {
  const baseUrl = process.env.EXPO_PUBLIC_CUSTOMER_WEB_URL;
  if (baseUrl) return baseUrl;

  const vendorSlug = process.env.EXPO_PUBLIC_DEFAULT_VENDOR_SLUG ?? 'sunset';
  return `https://${vendorSlug}.countrtop.com`;
};

const resolveAuthRedirect = () => 'countrtop://auth-callback';

const resolveApiBaseUrl = () => {
  const explicit = process.env.EXPO_PUBLIC_API_BASE_URL;
  if (explicit) return explicit;
  try {
    return new URL(resolveCustomerUrl()).origin;
  } catch {
    return resolveCustomerUrl();
  }
};

export default function App() {
  const [pushToken, setPushToken] = useState<StoredPushToken | null>(null);
  const [notificationStatus, setNotificationStatus] = useState<'checking' | 'ready' | 'denied' | 'error'>(
    'checking'
  );
  const [notificationError, setNotificationError] = useState<string | null>(null);
  const [linkedUserId, setLinkedUserId] = useState<string | null>(null);
  const [registrationStatus, setRegistrationStatus] = useState<'idle' | 'sending' | 'ready' | 'error'>(
    'idle'
  );
  const [registrationError, setRegistrationError] = useState<string | null>(null);
  const [authFlowError, setAuthFlowError] = useState<string | null>(null);
  const [webStatus, setWebStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [webError, setWebError] = useState<string | null>(null);
  const lastRegistered = useRef<string | null>(null);
  const webViewRef = useRef<WebView>(null);
  const expoProjectId = process.env.EXPO_PUBLIC_EXPO_PROJECT_ID;
  const webUserAgent = useMemo(() => {
    const platformTag = Platform.OS === 'ios' ? 'CountrTopiOS' : 'CountrTopAndroid';
    return `${platformTag}/1.0 (ngrok-skip)`;
  }, []);

  useEffect(() => {
    const bootstrapNotifications = async () => {
      const cachedToken = await getStoredPushToken();
      if (cachedToken) {
        setPushToken(cachedToken);
        setNotificationStatus('ready');
        return;
      }

      try {
        const permission = await ensureNotificationPermissions();
        if (permission !== 'granted') {
          setNotificationStatus('denied');
          return;
        }

        if (!expoProjectId) {
          setNotificationStatus('error');
          setNotificationError('Missing Expo project ID for push. Set EXPO_PUBLIC_EXPO_PROJECT_ID.');
          return;
        }

        const token = await obtainExpoPushToken(expoProjectId);
        setPushToken(token);
        setNotificationStatus('ready');
      } catch (error) {
        setNotificationStatus('error');
        setNotificationError(error instanceof Error ? error.message : 'Unknown notification error');
      }
    };

    bootstrapNotifications();
  }, []);

  useEffect(() => {
    if (!pushToken || !linkedUserId) return;
    const key = `${linkedUserId}:${pushToken.token}`;
    if (lastRegistered.current === key) return;

    const register = async () => {
      setRegistrationStatus('sending');
      setRegistrationError(null);
      try {
        const response = await fetch(`${resolveApiBaseUrl()}/api/push/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: linkedUserId,
            deviceToken: pushToken.token,
            platform: Platform.OS === 'ios' ? 'ios' : 'android'
          })
        });
        const payload = await response.json();
        if (!response.ok || !payload.ok) {
          throw new Error(payload.error ?? 'Failed to register push token');
        }
        lastRegistered.current = key;
        setRegistrationStatus('ready');
      } catch (error) {
        setRegistrationStatus('error');
        setRegistrationError(error instanceof Error ? error.message : 'Unable to register push token');
      }
    };

    register();
  }, [linkedUserId, pushToken]);

  const notificationCopy = useMemo(() => {
    if (notificationStatus === 'checking') {
      return 'Checking push permissions…';
    }
    if (notificationStatus === 'ready') {
      return pushToken ? `Push ready: ${pushToken.provider.toUpperCase()}` : 'Push notifications are ready.';
    }
    if (notificationStatus === 'denied') {
      return 'Push notifications are disabled on this device.';
    }
    return notificationError ?? 'Unable to configure notifications.';
  }, [notificationError, notificationStatus, pushToken]);

  const registrationCopy = useMemo(() => {
    if (!linkedUserId) return 'Sign in to connect push notifications.';
    if (registrationStatus === 'sending') return 'Registering push token…';
    if (registrationStatus === 'ready') return 'Push token linked to account.';
    if (registrationStatus === 'error') return registrationError ?? 'Push token registration failed.';
    return 'Push token ready to link.';
  }, [linkedUserId, registrationError, registrationStatus]);

  const launchOAuth = async (authUrl: string) => {
    setAuthFlowError(null);
    const redirectUri = resolveAuthRedirect();
    const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);
    if (result.type !== 'success' || !result.url) {
      throw new Error('Sign-in was cancelled or blocked.');
    }

    const hash = result.url.split('#')[1] ?? '';
    const params = new URLSearchParams(hash);
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    const expiresIn = params.get('expires_in');
    const tokenType = params.get('token_type');

    if (!accessToken || !refreshToken) {
      throw new Error('Missing tokens in auth response.');
    }

    const payload = {
      type: 'ct-auth-token',
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: expiresIn,
      token_type: tokenType
    };

    webViewRef.current?.injectJavaScript(
      `window.ctHandleNativeAuth && window.ctHandleNativeAuth(${JSON.stringify(payload)}); true;`
    );
  };

  const handleWebMessage = (event: WebViewMessageEvent) => {
    try {
      const payload = JSON.parse(event.nativeEvent.data);
      if (payload?.type === 'ct-auth-url' && payload?.url) {
        launchOAuth(payload.url).catch((error) => {
          setAuthFlowError(error instanceof Error ? error.message : 'Unable to complete sign-in.');
        });
        return;
      }
      if (payload?.type === 'ct-auth') {
        setLinkedUserId(payload.userId ?? null);
        if (!payload.userId) {
          setRegistrationStatus('idle');
          setRegistrationError(null);
          lastRegistered.current = null;
        }
      }
    } catch {
      // Ignore messages that are not JSON.
    }
  };

  const customerUrl = resolveCustomerUrl();

  useEffect(() => {
    setWebStatus('loading');
    setWebError(null);
  }, [customerUrl]);

  return (
    <ErrorBoundary
      onError={(error, errorInfo) => {
        // Log to console in development
        if (__DEV__) {
          console.error('Application error:', error, errorInfo);
        }
        // In production, send to monitoring service
        // Example: Sentry.captureException(error, { contexts: { react: errorInfo } });
      }}
    >
      <SafeAreaView style={styles.container}>
        <StatusBar style="dark" />
        <View style={styles.statusBar}>
          <Text style={styles.statusText}>{notificationCopy}</Text>
          <Text style={styles.statusText}>{registrationCopy}</Text>
          {authFlowError && <Text style={styles.statusText}>{authFlowError}</Text>}
          {webStatus === 'error' && <Text style={styles.statusText}>{webError}</Text>}
        </View>
        <WebView
          ref={webViewRef}
          source={{
            uri: customerUrl,
            headers: {
              'ngrok-skip-browser-warning': 'true'
            }
          }}
          style={styles.webView}
          userAgent={webUserAgent}
          originWhitelist={['https://*', 'http://*']}
          javaScriptEnabled
          domStorageEnabled
          cacheEnabled={false}
          incognito
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          startInLoadingState
          renderLoading={() => (
            <View style={styles.loadingState}>
              <Text style={styles.loadingText}>Loading customer web…</Text>
            </View>
          )}
          renderError={(errorName, errorDescription) => (
            <View style={styles.loadingState}>
              <Text style={styles.loadingText}>{errorName}</Text>
              <Text style={styles.loadingText}>{errorDescription}</Text>
            </View>
          )}
          onLoadStart={() => {
            setWebStatus('loading');
            setWebError(null);
          }}
          onLoadEnd={() => {
            setWebStatus('ready');
          }}
          onError={(event) => {
            setWebStatus('error');
            setWebError(event.nativeEvent.description ?? 'Unable to load customer web.');
          }}
          onHttpError={(event) => {
            setWebStatus('error');
            setWebError(`HTTP ${event.nativeEvent.statusCode} loading ${event.nativeEvent.url}`);
          }}
          onContentProcessDidTerminate={() => {
            setWebStatus('error');
            setWebError('WebView process terminated. Reloading…');
            webViewRef.current?.reload();
          }}
          onMessage={handleWebMessage}
        />
      </SafeAreaView>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc'
  },
  statusBar: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    backgroundColor: '#fff'
  },
  statusText: {
    color: '#475569',
    fontSize: 12
  },
  webView: {
    flex: 1,
    backgroundColor: '#fff'
  },
  loadingState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff'
  },
  loadingText: {
    color: '#475569',
    fontSize: 14
  }
});
