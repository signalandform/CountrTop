import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';

const STORAGE_KEY = 'countrtop:pushToken';

export type PushProvider = 'expo' | 'fcm' | 'apns';

export type StoredPushToken = {
  token: string;
  provider: PushProvider;
  updatedAt: string;
};

export type ExpoPushMessage = {
  to: string;
  title?: string;
  body: string;
  data?: Record<string, unknown>;
  priority?: 'default' | 'normal' | 'high';
  sound?: 'default' | null;
};

export type FcmPushMessage = {
  to: string;
  title?: string;
  body: string;
  data?: Record<string, string>;
  priority?: 'normal' | 'high';
};

const storeToken = async (token: StoredPushToken) => {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(token));
};

export const getStoredPushToken = async (): Promise<StoredPushToken | null> => {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredPushToken;
  } catch (error) {
    console.warn('Unable to read stored push token', error);
    return null;
  }
};

export const clearStoredPushToken = async (): Promise<void> => {
  await AsyncStorage.removeItem(STORAGE_KEY);
};

export const ensureNotificationPermissions = async (): Promise<Notifications.PermissionStatus> => {
  const existing = await Notifications.getPermissionsAsync();
  if (existing.status === 'granted') {
    return existing.status;
  }
  const requested = await Notifications.requestPermissionsAsync();
  return requested.status;
};

export const obtainExpoPushToken = async (projectId?: string): Promise<StoredPushToken> => {
  if (!Device.isDevice) {
    throw new Error('Push notifications require running on a physical device.');
  }

  const permission = await ensureNotificationPermissions();
  if (permission !== 'granted') {
    throw new Error('Notifications are not permitted on this device.');
  }

  const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
  const token: StoredPushToken = {
    token: data,
    provider: 'expo',
    updatedAt: new Date().toISOString()
  };
  await storeToken(token);
  return token;
};

export const obtainDevicePushToken = async (): Promise<StoredPushToken> => {
  if (!Device.isDevice) {
    throw new Error('Push notifications require running on a physical device.');
  }

  const permission = await ensureNotificationPermissions();
  if (permission !== 'granted') {
    throw new Error('Notifications are not permitted on this device.');
  }

  const deviceToken = await Notifications.getDevicePushTokenAsync();
  const provider: PushProvider =
    deviceToken.type === 'fcm' ? 'fcm' : deviceToken.type === 'apns' ? 'apns' : 'expo';
  const token: StoredPushToken = {
    token: deviceToken.data,
    provider,
    updatedAt: new Date().toISOString()
  };
  await storeToken(token);
  return token;
};

export const sendExpoPush = async (
  message: ExpoPushMessage,
  accessToken?: string
): Promise<unknown> => {
  const response = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
    },
    body: JSON.stringify(message)
  });

  if (!response.ok) {
    throw new Error(`Expo push failed with status ${response.status}`);
  }

  return response.json();
};

export const sendFcmPush = async (
  message: FcmPushMessage,
  serverKey: string
): Promise<unknown> => {
  const response = await fetch('https://fcm.googleapis.com/fcm/send', {
    method: 'POST',
    headers: {
      Authorization: `key=${serverKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      to: message.to,
      notification: {
        title: message.title,
        body: message.body
      },
      data: message.data,
      priority: message.priority ?? 'high'
    })
  });

  if (!response.ok) {
    throw new Error(`FCM push failed with status ${response.status}`);
  }

  return response.json();
};
