import { useEffect, useMemo, useState } from 'react';
import { SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { WebView } from 'react-native-webview';

import {
  ensureNotificationPermissions,
  getStoredPushToken,
  obtainExpoPushToken,
  StoredPushToken
} from './notifications/pushNotifications';

const resolveCustomerUrl = () => {
  const baseUrl = process.env.EXPO_PUBLIC_CUSTOMER_WEB_URL;
  if (baseUrl) return baseUrl;

  const vendorSlug = process.env.EXPO_PUBLIC_DEFAULT_VENDOR_SLUG ?? 'sunset';
  return `https://${vendorSlug}.countrtop.com`;
};

export default function App() {
  const [pushToken, setPushToken] = useState<StoredPushToken | null>(null);
  const [notificationStatus, setNotificationStatus] = useState<'checking' | 'ready' | 'denied' | 'error'>(
    'checking'
  );
  const [notificationError, setNotificationError] = useState<string | null>(null);

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

        const token = await obtainExpoPushToken();
        setPushToken(token);
        setNotificationStatus('ready');
      } catch (error) {
        setNotificationStatus('error');
        setNotificationError(error instanceof Error ? error.message : 'Unknown notification error');
      }
    };

    bootstrapNotifications();
  }, []);

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

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      <View style={styles.statusBar}>
        <Text style={styles.statusText}>{notificationCopy}</Text>
      </View>
      <WebView source={{ uri: resolveCustomerUrl() }} />
    </SafeAreaView>
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
  }
});
