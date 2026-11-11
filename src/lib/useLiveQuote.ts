import { useEffect, useRef, useState } from 'react';

export type LiveTick = {
  symbol: string;
  price: number;
  timestamp: number;
  volume: number | null;
};

export type LiveStatus = 'connecting' | 'live' | 'fallback' | 'error';

type ProviderMessage = {
  event?: string;
  symbol?: string;
  price?: number | string;
  timestamp?: number;
  day_volume?: number | string;
  status?: string;
  message?: string;
  code?: number;
  success?: Array<{ symbol?: string }>;
  fails?: Array<{ symbol?: string; message?: string; code?: number }>;
};

const API_KEY = process.env.EXPO_PUBLIC_TWELVE_DATA_API_KEY?.trim() ?? '';
const HEARTBEAT_MS = 10_000;

function finiteNumber(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

export function useLiveQuote(symbol: string) {
  const [status, setStatus] = useState<LiveStatus>('connecting');
  const [lastTick, setLastTick] = useState<LiveTick | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const retryCount = useRef(0);

  useEffect(() => {
    let disposed = false;
    let socket: WebSocket | null = null;
    let heartbeat: ReturnType<typeof setInterval> | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    setLastTick(null);
    setStatus('connecting');
    setMessage(null);

    if (!API_KEY) {
      setStatus('fallback');
      setMessage(null);
      return () => { disposed = true; };
    }

    const connect = () => {
      if (disposed) return;
      setStatus(retryCount.current === 0 ? 'connecting' : 'fallback');
      setMessage(null);
      try {
        socket = new WebSocket(`wss://ws.twelvedata.com/v1/quotes/price?apikey=${encodeURIComponent(API_KEY)}`);
      } catch {
        setStatus('error');
        retry = setTimeout(connect, 15_000);
        return;
      }

      socket.onopen = () => {
        if (disposed || !socket) return;
        retryCount.current = 0;
        setStatus('connecting');
        setMessage(null);
        socket.send(JSON.stringify({ action: 'subscribe', params: { symbols: symbol } }));
        heartbeat = setInterval(() => {
          if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ action: 'heartbeat' }));
        }, HEARTBEAT_MS);
      };

      socket.onmessage = (event) => {
        if (disposed || typeof event.data !== 'string') return;
        try {
          const payload = JSON.parse(event.data) as ProviderMessage;
          if (payload.event === 'subscribe-status') {
            const accepted = payload.status === 'ok' && payload.success?.some((item) => item.symbol?.toUpperCase() === symbol.toUpperCase());
            if (accepted) {
              setStatus('live');
              setMessage(null);
            } else {
              const failure = payload.fails?.[0];
              const reason = failure?.message?.trim();
              setStatus('fallback');
              setMessage(reason
                ? `Twelve Data rechazó ${symbol}: ${reason}. Se usa actualización automática cada 15 s.`
                : `La clave de Twelve Data no tiene streaming habilitado para ${symbol}. Se usa actualización automática cada 15 s.`);
            }
            return;
          }
          if (payload.event === 'price') {
            const price = finiteNumber(payload.price);
            const tickSymbol = payload.symbol?.toUpperCase();
            if (price == null || !tickSymbol || tickSymbol !== symbol.toUpperCase()) return;
            setLastTick({
              symbol: tickSymbol,
              price,
              timestamp: finiteNumber(payload.timestamp) ?? Date.now() / 1000,
              volume: finiteNumber(payload.day_volume),
            });
            setStatus('live');
          } else if (payload.status === 'error' || payload.event === 'error') {
            setMessage(payload.message || 'El proveedor rechazó la suscripción de prueba.');
            setStatus('error');
          }
        } catch {
          setMessage('Se recibió una respuesta de streaming no válida.');
        }
      };

      socket.onerror = () => {
        if (!disposed) {
          setStatus('fallback');
          setMessage('Stream desconectado; se usa la lectura periódica.');
        }
      };

      socket.onclose = () => {
        if (heartbeat) clearInterval(heartbeat);
        heartbeat = null;
        if (disposed) return;
        setStatus('fallback');
        retryCount.current += 1;
        const delay = Math.min(30_000, 1_500 * 2 ** Math.min(retryCount.current - 1, 4));
        retry = setTimeout(connect, delay);
      };
    };

    retryCount.current = 0;
    connect();
    return () => {
      disposed = true;
      if (heartbeat) clearInterval(heartbeat);
      if (retry) clearTimeout(retry);
      if (socket) {
        socket.onclose = null;
        socket.close();
      }
    };
  }, [symbol]);

  return { status, lastTick, message, provider: 'Twelve Data' as const };
}
