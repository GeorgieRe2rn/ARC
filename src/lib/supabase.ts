import 'react-native-url-polyfill/auto';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { createClient, type SupportedStorage } from '@supabase/supabase-js';
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
export const backendConfigured = Boolean(url && anonKey);
const storage: SupportedStorage = {
  getItem: (key) => {
    const safeKey = key.replace(/[^A-Za-z0-9._-]/g, '_');
    return Platform.OS === 'web' ? Promise.resolve(globalThis.localStorage?.getItem(safeKey) ?? null) : SecureStore.getItemAsync(safeKey);
  },
  setItem: (key, value) => {
    const safeKey = key.replace(/[^A-Za-z0-9._-]/g, '_');
    return Platform.OS === 'web' ? Promise.resolve(globalThis.localStorage?.setItem(safeKey, value)) : SecureStore.setItemAsync(safeKey, value);
  },
  removeItem: (key) => {
    const safeKey = key.replace(/[^A-Za-z0-9._-]/g, '_');
    return Platform.OS === 'web' ? Promise.resolve(globalThis.localStorage?.removeItem(safeKey)) : SecureStore.deleteItemAsync(safeKey);
  },
};
export const supabase = backendConfigured && url && anonKey
  ? createClient(url, anonKey, { auth: { storage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false } })
  : null;
