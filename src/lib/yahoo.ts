import { getJson } from './http';
import { parseSearch, parseTimeSeries, type Quote, type SearchHit } from './parseQuote';

const SEARCH = 'https://query2.finance.yahoo.com/v1/finance/search';
const TIME_SERIES = 'https://api.twelvedata.com/time_series';
const API_KEY = process.env.EXPO_PUBLIC_TWELVE_DATA_API_KEY?.trim() ?? '';
const cache = new Map<string, { at: number; quote: Quote }>();
const inFlight = new Map<string, Promise<Quote>>();
const TTL = 5_000;

export type PeriodId = '1D' | '1S' | '1M' | '3M' | '1A' | '5A';

export const PERIODS: { id: PeriodId; range: string; interval: string }[] = [
  { id: '1D', range: '1d', interval: '5min' },
  { id: '1S', range: '5d', interval: '30min' },
  { id: '1M', range: '1mo', interval: '1day' },
  { id: '3M', range: '3mo', interval: '1day' },
  { id: '1A', range: '1y', interval: '1week' },
  { id: '5A', range: '5y', interval: '1month' },
];

export function periodById(id: PeriodId) {
  return PERIODS.find((period) => period.id === id) ?? PERIODS[0];
}

export async function fetchQuote(symbol: string, range: string, interval: string, force = false): Promise<Quote> {
  if (!API_KEY) throw new Error('Configura EXPO_PUBLIC_TWELVE_DATA_API_KEY para consultar cotizaciones.');
  const key = `${symbol.toUpperCase()}|${range}|${interval}`;
  const hit = cache.get(key);
  if (!force && hit && Date.now() - hit.at < TTL) return hit.quote;
  const pending = inFlight.get(key);
  if (pending) return pending;
  const normalizedInterval = interval === '1m' ? '1min' : interval;
  const outputsize = outputSize(range, normalizedInterval);
  const url = `${TIME_SERIES}?symbol=${encodeURIComponent(symbol.toUpperCase())}&interval=${encodeURIComponent(normalizedInterval)}&outputsize=${outputsize}&apikey=${encodeURIComponent(API_KEY)}`;
  const request = getJson(url)
    .then(parseTimeSeries)
    .then((quote) => {
      cache.set(key, { at: Date.now(), quote });
      return quote;
    })
    .finally(() => inFlight.delete(key));
  inFlight.set(key, request);
  return request;
}

function outputSize(range: string, interval: string): number {
  if (range === '1d' && interval === '1min') return 390;
  if (range === '1d') return 78;
  if (range === '5d') return 65;
  if (range === '1mo') return 30;
  if (range === '3mo') return 90;
  if (range === '1y') return 52;
  if (range === '5y') return 60;
  return interval === '1min' ? 390 : 100;
}

export async function searchSymbols(query: string): Promise<SearchHit[]> {
  const q = query.trim();
  if (q.length < 1) return [];
  const url = `${SEARCH}?q=${encodeURIComponent(q)}&quotesCount=10&newsCount=0`;
  return parseSearch(await getJson(url));
}

export function dropQuoteCache() {
  cache.clear();
}
