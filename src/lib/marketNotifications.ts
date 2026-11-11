import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { money } from './format';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

let permissionPromise: Promise<boolean> | null = null;

export function initializeMarketNotifications(): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(false);
  if (permissionPromise) return permissionPromise;
  permissionPromise = (async () => {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('market-price-updates', {
        name: 'Cambios de cotización',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 140],
        lightColor: '#00E5A0',
      });
    }
    const current = await Notifications.getPermissionsAsync();
    const permission = current.granted ? current : await Notifications.requestPermissionsAsync();
    return permission.granted;
  })().catch(() => false);
  return permissionPromise;
}

export async function notifyMarketPriceChange(symbol: string, price: number, currency: string): Promise<void> {
  if (!(await initializeMarketNotifications())) return;
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `${symbol} · cotización actualizada`,
        body: `Precio: ${money(price, currency, 2)}`,
        data: { symbol, price, currency },
        sound: true,
      },
      trigger: null,
    });
  } catch {
    // Keep market refreshes working even if the OS declines to show a notification.
  }
}
