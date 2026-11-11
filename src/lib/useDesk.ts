import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { readJournal, writeJournal, type Lot } from './journal';
import { readSelected, readWatchlist, writeSelected, writeWatchlist } from './market';
import { swingFromCloses, type Swing } from './stats';
import { dropQuoteCache, fetchQuote, periodById, type PeriodId } from './yahoo';
import type { Quote } from './parseQuote';
import { useLiveQuote, type LiveTick } from './useLiveQuote';
import { initializeMarketNotifications, notifyMarketPriceChange } from './marketNotifications';

function unique(symbols: string[]) {
  return [...new Set(symbols.map((symbol) => symbol.toUpperCase()))];
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : 'No se pudo leer el mercado.';
}

const LIST_REFRESH_MS = 15_000;

function withLiveTick(quote: Quote, tick: LiveTick): Quote {
  if (tick.timestamp < quote.marketTime) return quote;
  const change = quote.previousClose == null ? quote.change : tick.price - quote.previousClose;
  const bars = quote.bars.slice();
  const lastBar = bars[bars.length - 1];
  if (lastBar) {
    bars[bars.length - 1] = {
      ...lastBar,
      close: tick.price,
      high: Math.max(lastBar.high, tick.price),
      low: Math.min(lastBar.low, tick.price),
      volume: tick.volume ?? lastBar.volume,
    };
  }
  return {
    ...quote,
    price: tick.price,
    change,
    changePercent: quote.previousClose ? (change / quote.previousClose) * 100 : quote.changePercent,
    volume: tick.volume ?? quote.volume,
    marketTime: tick.timestamp,
    bars,
  };
}

export function useDesk() {
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [lots, setLots] = useState<Lot[]>([]);
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [failed, setFailed] = useState<string[]>([]);
  const [selected, setSelected] = useState('AAPL');
  const live = useLiveQuote(selected);
  const [period, setPeriod] = useState<PeriodId>('1D');
  const [detail, setDetail] = useState<Quote | null>(null);
  const [chartQuote, setChartQuote] = useState<Quote | null>(null);
  const [swing, setSwing] = useState<Swing | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [readAt, setReadAt] = useState<number | null>(null);
  const detailToken = useRef(0);
  const listToken = useRef(0);
  const detailBusy = useRef(false);
  const listBusy = useRef(false);
  const watchRef = useRef<string[]>([]);
  const lotsRef = useRef<Lot[]>([]);
  const selectedRef = useRef(selected);
  const periodRef = useRef(period);
  const liveTickRef = useRef<LiveTick | null>(null);
  const lastPriceRef = useRef<Record<string, number>>({});
  const currencyRef = useRef<Record<string, string>>({});

  const observePrice = useCallback((symbol: string, price: number, currency: string) => {
    const previous = lastPriceRef.current[symbol];
    lastPriceRef.current[symbol] = price;
    currencyRef.current[symbol] = currency;
    if (previous !== undefined && Math.abs(previous - price) >= 0.0000001) {
      void notifyMarketPriceChange(symbol, price, currency);
    }
  }, []);

  useEffect(() => { watchRef.current = watchlist; }, [watchlist]);
  useEffect(() => { lotsRef.current = lots; }, [lots]);
  useEffect(() => { selectedRef.current = selected; }, [selected]);
  useEffect(() => { periodRef.current = period; }, [period]);
  useEffect(() => {
    const tick = live.lastTick;
    liveTickRef.current = tick;
    if (!tick) return;
    observePrice(tick.symbol, tick.price, currencyRef.current[tick.symbol] ?? 'USD');
    setDetail((current) => current?.symbol === tick.symbol ? withLiveTick(current, tick) : current);
    setChartQuote((current) => current?.symbol === tick.symbol ? withLiveTick(current, tick) : current);
    setQuotes((current) => {
      const quote = current[tick.symbol];
      return quote ? { ...current, [tick.symbol]: withLiveTick(quote, tick) } : current;
    });
    setReadAt(tick.timestamp * 1000);
  }, [live.lastTick, observePrice]);

  const loadDetail = useCallback(async (symbol: string, nextPeriod: PeriodId, force: boolean, replace: boolean) => {
    if (detailBusy.current && !replace) return;
    if (replace) detailToken.current += 1;
    const token = ++detailToken.current;
    detailBusy.current = true;
    setLoadingDetail(true);
    setDetailError(null);
    if (replace) setDetail(null);
    try {
      const spec = periodById(nextPeriod);
      const [quote, chart, daily] = await Promise.all([
        fetchQuote(symbol, '1mo', '1day', force),
        fetchQuote(symbol, spec.range, spec.interval, force),
        fetchQuote(symbol, '6mo', '1day', force),
      ]);
      if (token !== detailToken.current) return;
      const latestTick = liveTickRef.current;
      const visibleQuote = latestTick?.symbol === symbol ? withLiveTick(quote, latestTick) : quote;
      observePrice(visibleQuote.symbol, visibleQuote.price, visibleQuote.currency);
      setDetail(visibleQuote);
      setChartQuote(chart);
      setSwing(swingFromCloses(daily.bars.map((bar) => bar.close)));
      setReadAt(Date.now());
    } catch (error) {
      if (token !== detailToken.current) return;
      setDetailError(messageOf(error));
    } finally {
      detailBusy.current = false;
      if (token === detailToken.current) {
        setLoadingDetail(false);
      }
    }
  }, [observePrice]);

  const loadList = useCallback(async (symbols: string[], force: boolean) => {
    if (listBusy.current) {
      listToken.current += 1;
    }
    const token = ++listToken.current;
    listBusy.current = true;
    if (symbols.length === 0) {
      setQuotes({});
      setFailed([]);
      setListError(null);
      setLoadingList(false);
      listBusy.current = false;
      return;
    }
    setLoadingList(true);
    const results = await Promise.allSettled(symbols.map((symbol) => fetchQuote(symbol, '1mo', '1day', force)));
    if (token !== listToken.current) {
      listBusy.current = false;
      return;
    }
    const nextQuotes: Record<string, Quote> = {};
    const nextFailed: string[] = [];
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        nextQuotes[symbols[index]] = result.value;
        observePrice(result.value.symbol, result.value.price, result.value.currency);
      }
      else nextFailed.push(symbols[index]);
    });
    setQuotes((current) => ({ ...current, ...nextQuotes }));
    setFailed(nextFailed);
    setListError(nextFailed.length === symbols.length ? 'No se pudo leer ninguna cotización.' : null);
    setLoadingList(false);
    listBusy.current = false;
    setReadAt(Date.now());
  }, [observePrice]);

  const symbolsNeeded = useCallback(() => unique([...watchRef.current, ...lotsRef.current.map((lot) => lot.symbol)]), []);

  const refresh = useCallback(async (manual: boolean) => {
    if (manual) {
      dropQuoteCache();
      setRefreshing(true);
    }
    try {
      await Promise.all([
        loadList(symbolsNeeded(), manual),
        loadDetail(selectedRef.current, periodRef.current, manual, false),
      ]);
    } finally {
      if (manual) setRefreshing(false);
    }
  }, [loadDetail, loadList, symbolsNeeded]);

  useEffect(() => {
    let alive = true;
    void initializeMarketNotifications();
    (async () => {
      const [storedWatch, storedLots] = await Promise.all([readWatchlist(), readJournal()]);
      if (!alive) return;
      const storedSelected = await readSelected('AAPL');
      if (!alive) return;
      setWatchlist(storedWatch);
      setLots(storedLots);
      setSelected(storedSelected);
      watchRef.current = storedWatch;
      lotsRef.current = storedLots;
      selectedRef.current = storedSelected;
      setHydrated(true);
      await Promise.all([
        loadList(unique([...storedWatch, ...storedLots.map((lot) => lot.symbol)]), false),
        loadDetail(storedSelected, periodRef.current, false, true),
      ]);
    })();
    return () => { alive = false; };
  }, [loadDetail, loadList]);

  useEffect(() => {
    if (!hydrated) return;
    let stopped = false;
    let polling = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    // Schedule the next refresh after the current network reads finish, so a slow
    // response never causes every subsequent 15-second interval to be skipped.
    const poll = async () => {
      if (stopped || polling) return;
      polling = true;
      try {
        await Promise.all([
          loadList(symbolsNeeded(), true),
          loadDetail(selectedRef.current, periodRef.current, true, false),
        ]);
      } finally {
        polling = false;
        if (!stopped) timer = setTimeout(() => { void poll(); }, LIST_REFRESH_MS);
      }
    };
    timer = setTimeout(() => { void poll(); }, LIST_REFRESH_MS);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        if (timer) clearTimeout(timer);
        void poll();
      }
    });
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      subscription.remove();
    };
  }, [hydrated, loadDetail, loadList, symbolsNeeded]);

  const choose = useCallback((symbol: string) => {
    const next = symbol.toUpperCase();
    setSelected(next);
    selectedRef.current = next;
    setSwing(null);
    setChartQuote(null);
    writeSelected(next);
    loadDetail(next, periodRef.current, false, true);
  }, [loadDetail]);

  const choosePeriod = useCallback((next: PeriodId) => {
    setPeriod(next);
    periodRef.current = next;
    loadDetail(selectedRef.current, next, false, true);
  }, [loadDetail]);

  const addSymbol = useCallback(async (symbol: string) => {
    const nextSymbol = symbol.toUpperCase();
    const next = watchRef.current.includes(nextSymbol) ? watchRef.current : [nextSymbol, ...watchRef.current];
    watchRef.current = next;
    setWatchlist(next);
    await writeWatchlist(next);
    await loadList(symbolsNeeded(), true);
  }, [loadList, symbolsNeeded]);

  const removeSymbol = useCallback(async (symbol: string) => {
    const next = watchRef.current.filter((item) => item !== symbol);
    watchRef.current = next;
    setWatchlist(next);
    await writeWatchlist(next);
    await loadList(symbolsNeeded(), true);
  }, [loadList, symbolsNeeded]);

  const addLot = useCallback(async (input: { symbol: string; quantity: number; entryPrice: number; currency: string }) => {
    const lot: Lot = {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      symbol: input.symbol.toUpperCase(),
      quantity: input.quantity,
      entryPrice: input.entryPrice,
      currency: input.currency,
      recordedAt: new Date().toISOString(),
    };
    const next = [lot, ...lotsRef.current];
    lotsRef.current = next;
    setLots(next);
    await writeJournal(next);
    if (!watchRef.current.includes(lot.symbol)) await addSymbol(lot.symbol);
    else await loadList(symbolsNeeded(), true);
  }, [addSymbol, loadList, symbolsNeeded]);

  const removeLot = useCallback(async (id: string) => {
    const removed = lotsRef.current.find((lot) => lot.id === id);
    const next = lotsRef.current.filter((lot) => lot.id !== id);
    lotsRef.current = next;
    setLots(next);
    await writeJournal(next);
    if (removed) await loadList(symbolsNeeded(), true);
  }, [loadList, symbolsNeeded]);

  return {
    watchlist,
    lots,
    quotes,
    failed,
    selected,
    period,
    detail,
    chartQuote,
    swing,
    detailError,
    listError,
    hydrated,
    loadingList,
    loadingDetail,
    refreshing,
    readAt,
    liveStatus: live.status,
    liveMessage: live.message,
    refresh,
    choose,
    choosePeriod,
    addSymbol,
    removeSymbol,
    addLot,
    removeLot,
  };
}
