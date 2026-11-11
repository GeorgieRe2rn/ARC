import { readJson, writeJson } from './storage';

export { fetchQuote, searchSymbols, PERIODS, periodById, dropQuoteCache } from './yahoo';
export type { PeriodId } from './yahoo';
export type { Quote, Bar, SearchHit, Session } from './parseQuote';

const WATCH_KEY = 'arc.watchlist';
const SELECTED_KEY = 'arc.selected';
export const DEFAULT_WATCHLIST = ['NVDA', 'AAPL', 'MSFT', 'AMZN', 'TSLA'];

export async function readWatchlist(): Promise<string[]> {
  const stored = await readJson<string[]>(WATCH_KEY, null);
  if (stored == null) return [...DEFAULT_WATCHLIST];
  return stored.map((symbol) => symbol.trim().toUpperCase()).filter((symbol) => /^[A-Z0-9.^=-]{1,16}$/.test(symbol));
}

export async function writeWatchlist(symbols: string[]): Promise<void> {
  await writeJson(WATCH_KEY, symbols);
}

export async function readSelected(fallback: string): Promise<string> {
  const stored = await readJson<string>(SELECTED_KEY, null);
  return typeof stored === 'string' && stored ? stored : fallback;
}

export async function writeSelected(symbol: string): Promise<void> {
  await writeJson(SELECTED_KEY, symbol);
}
