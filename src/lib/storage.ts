import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const CHUNK = 1800;
const VALID_KEY = /^[A-Za-z0-9._-]+$/;

function assertValidKey(key: string): void {
  if (!VALID_KEY.test(key)) throw new Error('La clave de almacenamiento contiene caracteres no permitidos.');
}

async function loadString(key: string): Promise<string | null> {
  assertValidKey(key);
  if (Platform.OS === 'web') return globalThis.localStorage?.getItem(key) ?? null;
  const countKey = `${key}.count`;
  const countRaw = await SecureStore.getItemAsync(countKey);
  if (!countRaw) return SecureStore.getItemAsync(key);
  const count = Number(countRaw);
  if (!Number.isFinite(count) || count < 1) return null;
  let out = '';
  for (let i = 0; i < count; i++) {
    const part = await SecureStore.getItemAsync(`${key}.part${i}`);
    if (part == null) return null;
    out += part;
  }
  return out;
}

async function saveString(key: string, value: string): Promise<void> {
  assertValidKey(key);
  if (Platform.OS === 'web') {
    globalThis.localStorage?.setItem(key, value);
    return;
  }
  if (value.length <= CHUNK) {
    await SecureStore.setItemAsync(key, value);
    const countKey = `${key}.count`;
    const old = await SecureStore.getItemAsync(countKey);
    if (old) {
      const count = Number(old);
      for (let i = 0; i < count; i++) await SecureStore.deleteItemAsync(`${key}.part${i}`);
      await SecureStore.deleteItemAsync(countKey);
    }
    return;
  }
  const count = Math.ceil(value.length / CHUNK);
  for (let i = 0; i < count; i++) {
    await SecureStore.setItemAsync(`${key}.part${i}`, value.slice(i * CHUNK, (i + 1) * CHUNK));
  }
  await SecureStore.setItemAsync(`${key}.count`, String(count));
  await SecureStore.deleteItemAsync(key);
}

export async function readJson<T>(key: string, fallback: T | null): Promise<T | null> {
  try {
    const raw = await loadString(key);
    if (raw == null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function writeJson(key: string, value: unknown): Promise<void> {
  await saveString(key, JSON.stringify(value));
}
