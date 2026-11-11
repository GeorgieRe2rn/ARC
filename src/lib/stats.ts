export type Swing = {
  sessions: number;
  annualizedVol: number | null;
  dailyMove: number | null;
  low: number | null;
  high: number | null;
};

export function swingFromCloses(closes: number[]): Swing {
  const clean = closes.filter((price) => Number.isFinite(price) && price > 0);
  const returns: number[] = [];
  for (let i = 1; i < clean.length; i++) returns.push(Math.log(clean[i] / clean[i - 1]));
  const sample = returns.slice(-21);
  if (sample.length < 8) {
    return { sessions: sample.length, annualizedVol: null, dailyMove: null, low: null, high: null };
  }
  const mean = sample.reduce((sum, value) => sum + value, 0) / sample.length;
  const variance = sample.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (sample.length - 1);
  const daily = Math.sqrt(Math.max(0, variance));
  const last = clean[clean.length - 1];
  const move = last * daily;
  return {
    sessions: sample.length,
    annualizedVol: daily * Math.sqrt(252) * 100,
    dailyMove: move,
    low: last - move,
    high: last + move,
  };
}
