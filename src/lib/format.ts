import type { Session } from './parseQuote';

export function money(value: number, currency: string, digits = 2): string {
  const fraction = Math.min(4, Math.max(0, digits));
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: fraction,
      maximumFractionDigits: fraction,
    }).format(value);
  } catch {
    return `${value.toFixed(fraction)} ${currency}`;
  }
}

export function signedNumber(value: number, digits = 2): string {
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return sign + Math.abs(value).toFixed(digits);
}

export function signedPercent(value: number): string {
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return `${sign}${Math.abs(value).toFixed(2)}%`;
}

export function compact(value: number): string {
  return new Intl.NumberFormat('es', { notation: 'compact', maximumFractionDigits: 2 }).format(value);
}

export function exchangeStamp(unixSeconds: number, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('es', {
      timeZone,
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(unixSeconds * 1000));
  } catch {
    return new Date(unixSeconds * 1000).toLocaleString('es');
  }
}

export function clockLabel(unixSeconds: number, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('es', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(unixSeconds * 1000));
  } catch {
    return '';
  }
}

export function localClock(date = new Date()): string {
  return new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(date);
}

export function mastheadDate(date = new Date()): string {
  return new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}

export function recordedOn(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}

export function sessionLabel(session: Session): string {
  if (session === 'REGULAR') return 'Abierto';
  if (session === 'PRE') return 'Preapertura';
  if (session === 'POST') return 'After hours';
  return 'Cerrado';
}
