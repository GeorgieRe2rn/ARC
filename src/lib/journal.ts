import { readJson, writeJson } from './storage';

export type Lot = {
  id: string;
  symbol: string;
  quantity: number;
  entryPrice: number;
  currency: string;
  recordedAt: string;
};

const KEY = 'arc.book';

export async function readJournal(): Promise<Lot[]> {
  const data = await readJson<Lot[]>(KEY, null);
  if (!Array.isArray(data)) return [];
  return data.filter((lot) => lot && typeof lot.symbol === 'string' && lot.quantity > 0 && lot.entryPrice > 0);
}

export async function writeJournal(lots: Lot[]): Promise<void> {
  await writeJson(KEY, lots);
}
