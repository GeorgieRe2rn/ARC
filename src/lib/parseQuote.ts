export type Session = 'REGULAR' | 'PRE' | 'POST' | 'CLOSED';

export type Bar = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type Quote = {
  symbol: string;
  name: string;
  exchange: string;
  currency: string;
  price: number;
  previousClose: number | null;
  change: number;
  changePercent: number;
  dayHigh: number | null;
  dayLow: number | null;
  sessionOpen: number | null;
  volume: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  priceHint: number;
  marketTime: number;
  timezone: string;
  tzAbbrev: string;
  session: Session;
  bars: Bar[];
};

export type SearchHit = {
  symbol: string;
  name: string;
  exchange: string;
  type: string;
};

type TradingWindow = { start?: number; end?: number };

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function num(value: unknown, fallback: number): number {
  return finite(value) ?? fallback;
}

function numberFromProvider(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function providerTimestamp(value: unknown, timeZone: string): number | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}):(\d{2}))?$/.exec(value);
  if (!match) return null;
  const parts = match.slice(1).map((part) => Number(part || 0));
  const [year, month, day, hour, minute, second] = parts;
  const localAsUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  try {
    const formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    });
    let utc = localAsUtc;
    for (let i = 0; i < 2; i++) {
      const zoned = Object.fromEntries(formatter.formatToParts(new Date(utc)).map((part) => [part.type, Number(part.value)]));
      const zonedAsUtc = Date.UTC(zoned.year, zoned.month - 1, zoned.day, zoned.hour, zoned.minute, zoned.second);
      utc = localAsUtc - (zonedAsUtc - utc);
    }
    return Math.floor(utc / 1000);
  } catch {
    return Math.floor(localAsUtc / 1000);
  }
}

export function parseTimeSeries(payload: unknown): Quote {
  const data = payload as {
    status?: string;
    message?: string;
    code?: number;
    meta?: Record<string, unknown>;
    values?: Array<Record<string, unknown>>;
  } | null;
  if (data?.status === 'error') {
    throw new Error(data.message || `Twelve Data rechazó la solicitud (${data.code ?? 'sin código'}).`);
  }
  if (!data || !Array.isArray(data.values) || data.values.length === 0) {
    throw new Error(data?.message || 'Twelve Data no devolvió cotizaciones para ese símbolo.');
  }

  const meta = data.meta ?? {};
  const values = data.values;
  const timezone = typeof meta.exchange_timezone === 'string' ? meta.exchange_timezone : 'UTC';
  const bars = values.flatMap((item) => {
    const close = numberFromProvider(item.close);
    const time = providerTimestamp(item.datetime, timezone);
    if (close == null || time == null) return [];
    return [{
      time,
      open: numberFromProvider(item.open) ?? close,
      high: numberFromProvider(item.high) ?? close,
      low: numberFromProvider(item.low) ?? close,
      close,
      volume: numberFromProvider(item.volume) ?? 0,
    }];
  }).reverse();
  const latest = bars[bars.length - 1];
  if (!latest) throw new Error('Twelve Data devolvió una serie sin precios válidos.');
  const previousClose = bars.length > 1 ? bars[bars.length - 2].close : null;
  const change = previousClose == null ? 0 : latest.close - previousClose;
  const currency = typeof meta.currency === 'string' ? meta.currency : 'USD';
  const symbol = String(meta.symbol || '').toUpperCase();
  const volume = numberFromProvider(values[0].volume);

  return {
    symbol,
    name: String(meta.name || meta.instrument_name || symbol),
    exchange: String(meta.exchange || meta.mic_code || ''),
    currency,
    price: latest.close,
    previousClose,
    change,
    changePercent: previousClose ? (change / previousClose) * 100 : 0,
    dayHigh: numberFromProvider(values[0].high),
    dayLow: numberFromProvider(values[0].low),
    sessionOpen: numberFromProvider(values[0].open),
    volume,
    fiftyTwoWeekHigh: null,
    fiftyTwoWeekLow: null,
    priceHint: 2,
    marketTime: latest.time,
    timezone,
    tzAbbrev: '',
    session: 'CLOSED',
    bars,
  };
}

function dayKey(unix: number, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(unix * 1000));
  } catch {
    return new Date(unix * 1000).toISOString().slice(0, 10);
  }
}

function sessionOf(meta: Record<string, unknown>, now = Date.now() / 1000): Session {
  const period = meta.currentTradingPeriod as { regular?: TradingWindow; pre?: TradingWindow; post?: TradingWindow } | undefined;
  const within = (window: TradingWindow | undefined) =>
    !!window && typeof window.start === 'number' && typeof window.end === 'number' && now >= window.start && now < window.end;
  if (within(period?.regular)) return 'REGULAR';
  if (within(period?.pre)) return 'PRE';
  if (within(period?.post)) return 'POST';
  return 'CLOSED';
}

export function parseChart(payload: unknown): Quote {
  const chart = (payload as { chart?: { result?: unknown[] | null; error?: { description?: string } } } | null)?.chart;
  const result = chart?.result?.[0] as {
    meta?: Record<string, unknown>;
    timestamp?: number[];
    indicators?: { quote?: Array<Record<string, unknown[]>> };
  } | undefined;
  if (!result?.meta) {
    throw new Error(chart?.error?.description || 'Sin datos para ese símbolo.');
  }
  const meta = result.meta;
  const timestamps = Array.isArray(result.timestamp) ? result.timestamp : [];
  const series = result.indicators?.quote?.[0] ?? {};
  const opens = series.open ?? [];
  const highs = series.high ?? [];
  const lows = series.low ?? [];
  const closes = series.close ?? [];
  const volumes = series.volume ?? [];
  const bars: Bar[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const close = finite(closes[i]);
    if (close == null || typeof timestamps[i] !== 'number') continue;
    bars.push({
      time: timestamps[i],
      open: num(opens[i], close),
      high: num(highs[i], close),
      low: num(lows[i], close),
      close,
      volume: num(volumes[i], 0),
    });
  }

  const session = sessionOf(meta);
  const regular = finite(meta.regularMarketPrice) ?? bars[bars.length - 1]?.close ?? null;
  if (regular == null) throw new Error('La cotización no trajo precio.');
  const previousClose = finite(meta.previousClose) ?? finite(meta.chartPreviousClose);
  const regularMarketTime = finite(meta.regularMarketTime) ?? 0;
  const latestBar = bars[bars.length - 1];
  const latestExtendedBar = latestBar && latestBar.time > regularMarketTime ? latestBar : null;
  let price = regular;
  let change = finite(meta.fulldayChange) ?? (previousClose == null ? 0 : regular - previousClose);
  let changePercent = finite(meta.regularMarketChangePercent) ?? finite(meta.fulldayChangePercent) ?? (previousClose ? ((regular / previousClose) - 1) * 100 : 0);
  if (session === 'PRE' && finite(meta.preMarketPrice) != null) {
    price = finite(meta.preMarketPrice)!;
    changePercent = finite(meta.preMarketChangePercent) ?? changePercent;
    change = previousClose == null ? price - regular : price - previousClose;
  } else if (session === 'PRE' && latestExtendedBar) {
    price = latestExtendedBar.close;
    change = previousClose == null ? price - regular : price - previousClose;
    changePercent = previousClose ? (change / previousClose) * 100 : changePercent;
  } else if (session === 'POST' && finite(meta.postMarketPrice) != null) {
    price = finite(meta.postMarketPrice)!;
    changePercent = finite(meta.postMarketChangePercent) ?? changePercent;
    change = previousClose == null ? price - regular : price - previousClose;
    changePercent = previousClose ? (change / previousClose) * 100 : changePercent;
  } else if (session === 'POST' && latestExtendedBar) {
    price = latestExtendedBar.close;
    change = previousClose == null ? price - regular : price - previousClose;
    changePercent = previousClose ? (change / previousClose) * 100 : changePercent;
  } else if (session === 'CLOSED' && latestExtendedBar) {
    price = latestExtendedBar.close;
    change = previousClose == null ? price - regular : price - previousClose;
    changePercent = previousClose ? (change / previousClose) * 100 : changePercent;
  }

  const timezone = typeof meta.exchangeTimezoneName === 'string' ? meta.exchangeTimezoneName : 'UTC';
  const extendedMarketTime = session === 'PRE'
    ? finite(meta.preMarketTime) ?? latestExtendedBar?.time
    : session === 'POST'
      ? finite(meta.postMarketTime) ?? latestExtendedBar?.time
      : session === 'CLOSED'
        ? latestExtendedBar?.time
        : null;
  const marketTime = extendedMarketTime ?? (regularMarketTime || latestBar?.time || Math.floor(Date.now() / 1000));
  const sessionDay = dayKey(marketTime, timezone);
  const sessionBars = bars.filter((bar) => dayKey(bar.time, timezone) === sessionDay);
  const symbol = String(meta.symbol || '').toUpperCase();
  return {
    symbol,
    name: String(meta.longName || meta.shortName || symbol),
    exchange: String(meta.fullExchangeName || meta.exchangeName || ''),
    currency: String(meta.currency || 'USD'),
    price,
    previousClose,
    change,
    changePercent,
    dayHigh: finite(meta.regularMarketDayHigh),
    dayLow: finite(meta.regularMarketDayLow),
    sessionOpen: sessionBars[0]?.open ?? null,
    volume: finite(meta.regularMarketVolume),
    fiftyTwoWeekHigh: finite(meta.fiftyTwoWeekHigh),
    fiftyTwoWeekLow: finite(meta.fiftyTwoWeekLow),
    priceHint: Math.min(4, Math.max(2, finite(meta.priceHint) ?? 2)),
    marketTime,
    timezone,
    tzAbbrev: typeof meta.timezone === 'string' ? meta.timezone : '',
    session,
    bars,
  };
}

export function parseSearch(payload: unknown): SearchHit[] {
  const quotes = (payload as { quotes?: Array<Record<string, unknown>> } | null)?.quotes ?? [];
  const allowed = new Set(['EQUITY', 'ETF', 'INDEX']);
  const hits: SearchHit[] = [];
  for (const quote of quotes) {
    const type = String(quote.quoteType || '');
    const symbol = String(quote.symbol || '').trim().toUpperCase();
    if (!allowed.has(type) || !symbol || symbol.length > 16) continue;
    hits.push({
      symbol,
      name: String(quote.longname || quote.shortname || symbol),
      exchange: String(quote.exchDisp || quote.exchange || ''),
      type: String(quote.typeDisp || type),
    });
    if (hits.length === 8) break;
  }
  return hits;
}
