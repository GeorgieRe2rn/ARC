import { Platform } from 'react-native';

export async function getJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  const target = Platform.OS === 'web' ? `/market-proxy?u=${encodeURIComponent(url)}` : url;
  try {
    const response = await fetch(target, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`El mercado respondió ${response.status}.`);
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new Error('La respuesta del mercado no es válida.');
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw new Error('La cotización tardó demasiado.');
    if (error instanceof Error) throw error;
    throw new Error('No se pudo leer el mercado.');
  } finally {
    clearTimeout(timer);
  }
}
