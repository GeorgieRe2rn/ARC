import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { money, recordedOn, signedNumber, signedPercent } from '../lib/format';
import type { Lot } from '../lib/journal';
import type { Quote } from '../lib/parseQuote';
import { fetchQuote } from '../lib/yahoo';
import { down, hairline, ink, mono, muted, paper, serif, sheet, stamp, up } from '../theme';

export default function BookView({
  lots,
  quotes,
  selected,
  onAdd,
  onRemove,
  onOpen,
}: {
  lots: Lot[];
  quotes: Record<string, Quote>;
  selected: string;
  onAdd: (input: { symbol: string; quantity: number; entryPrice: number; currency: string }) => Promise<void>;
  onRemove: (id: string) => void;
  onOpen: (symbol: string) => void;
}) {
  const [symbol, setSymbol] = useState(selected);
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const live = quotes[symbol.trim().toUpperCase()];

  useEffect(() => { setSymbol(selected); }, [selected]);

  const groups = new Map<string, { currency: string; cost: number; market: number; count: number }>();
  let pending = 0;
  for (const lot of lots) {
    const quote = quotes[lot.symbol];
    if (!quote || quote.currency !== lot.currency) {
      pending += 1;
      continue;
    }
    const bucket = groups.get(lot.currency) ?? { currency: lot.currency, cost: 0, market: 0, count: 0 };
    bucket.cost += lot.quantity * lot.entryPrice;
    bucket.market += lot.quantity * quote.price;
    bucket.count += 1;
    groups.set(lot.currency, bucket);
  }

  async function submit() {
    const nextSymbol = symbol.trim().toUpperCase();
    const shares = Number(quantity.replace(',', '.'));
    if (!/^[A-Z0-9.^=-]{1,16}$/.test(nextSymbol)) {
      setError('Escribe un símbolo válido.');
      return;
    }
    if (!Number.isFinite(shares) || shares <= 0) {
      setError('Los títulos tienen que ser un número mayor que cero.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      let quote = quotes[nextSymbol];
      if (!quote) quote = await fetchQuote(nextSymbol, '1mo', '1day');
      const typed = price.trim() ? Number(price.replace(',', '.')) : quote.price;
      if (!Number.isFinite(typed) || typed <= 0) {
        setError('El costo tiene que ser un número mayor que cero.');
        return;
      }
      await onAdd({ symbol: nextSymbol, quantity: shares, entryPrice: typed, currency: quote.currency });
      setQuantity('');
      setPrice('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <View>
      <Text style={styles.kicker}>LIBRO  /  POSICIONES</Text>
      <Text style={styles.title}>Lo que anotaste, valorado ahora.</Text>
      <Text style={styles.lead}>Cada línea guarda los títulos y el costo que escribes. El valor de mercado sale de la última cotización, en este teléfono.</Text>

      {[...groups.values()].map((bucket) => {
        const pnl = bucket.market - bucket.cost;
        const pct = bucket.cost ? (pnl / bucket.cost) * 100 : 0;
        const tone = pnl > 0 ? up : pnl < 0 ? down : ink;
        return (
          <View key={bucket.currency} style={styles.totals}>
            <Row label="Costo anotado" value={money(bucket.cost, bucket.currency)} />
            <Row label="Valor de mercado" value={money(bucket.market, bucket.currency)} />
            <Row label="Resultado no realizado" value={`${signedNumber(pnl, 2)} ${bucket.currency}   ${signedPercent(pct)}`} tone={tone} />
            <Text style={styles.bucketNote}>{bucket.count} {bucket.count === 1 ? 'posición' : 'posiciones'} en {bucket.currency}</Text>
          </View>
        );
      })}
      {lots.length === 0 && <Text style={styles.empty}>Todavía no hay posiciones. Anota la primera con el precio que pagaste, o con el último precio si acabas de mirarlo.</Text>}
      {pending > 0 && <Text style={styles.warn}>{pending} {pending === 1 ? 'posición espera' : 'posiciones esperan'} cotización y no entran en el total.</Text>}

      <Text style={styles.formTitle}>Anotar posición</Text>
      <Field label="Símbolo" value={symbol} onChangeText={setSymbol} autoCapitalize="characters" />
      <Field label="Títulos" value={quantity} onChangeText={setQuantity} keyboardType="decimal-pad" placeholder="10" />
      <Field label="Precio de costo" value={price} onChangeText={setPrice} keyboardType="decimal-pad" placeholder={live ? String(live.price) : 'Último precio'} />
      <Text style={styles.hint}>{live ? `Último precio real de ${live.symbol}: ${money(live.price, live.currency, live.priceHint)}. Si dejas el costo vacío, se anota ese.` : 'Si el símbolo no está leído todavía, escribe el costo a mano.'}</Text>
      {error && <Text style={styles.warn}>{error}</Text>}
      <Pressable onPress={submit} disabled={saving} style={styles.save} accessibilityRole="button"><Text style={styles.saveText}>{saving ? 'Guardando…' : 'Anotar en el libro'}</Text></Pressable>

      {lots.map((lot) => {
        const quote = quotes[lot.symbol];
        const valued = quote && quote.currency === lot.currency;
        const market = valued ? lot.quantity * quote.price : null;
        const cost = lot.quantity * lot.entryPrice;
        const pnl = market == null ? null : market - cost;
        const pct = pnl == null || cost === 0 ? null : (pnl / cost) * 100;
        const tone = pnl == null ? muted : pnl > 0 ? up : pnl < 0 ? down : ink;
        return (
      <View key={lot.id} style={styles.lot}>
            <Pressable onPress={() => onOpen(lot.symbol)} style={styles.lotMain}>
              <Text style={styles.lotSymbol}>{lot.symbol}<Text style={styles.lotShares}>   {formatShares(lot.quantity)} títulos</Text></Text>
              <Text style={styles.lotMeta}>Costo {money(lot.entryPrice, lot.currency)} · anotado {recordedOn(lot.recordedAt)}</Text>
              <Text style={styles.lotMeta}>{valued ? `Ahora ${money(quote.price, quote.currency, quote.priceHint)} · valor ${money(market!, quote.currency)}` : 'Sin cotización para valorar'}</Text>
            </Pressable>
            <View style={styles.lotSide}>
              <Text style={[styles.lotPnl, { color: tone }]}>{pnl == null || pct == null ? '—' : signedPercent(pct)}</Text>
            <Pressable onPress={() => onRemove(lot.id)} style={styles.removeButton} accessibilityRole="button" accessibilityLabel={`Quitar posición ${lot.symbol}`}><Text style={styles.remove}>Quitar</Text></Pressable>
            </View>
          </View>
        );
      })}
    </View>
  );
}

function Row({ label, value, tone = ink }: { label: string; value: string; tone?: string }) {
  return (
    <View style={styles.totalRow}>
      <Text style={styles.totalLabel}>{label}</Text>
      <Text style={[styles.totalValue, { color: tone }]}>{value}</Text>
    </View>
  );
}

function Field(props: React.ComponentProps<typeof TextInput> & { label: string }) {
  const { label, style, ...input } = props;
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput {...input} placeholderTextColor={muted} style={styles.input} />
    </View>
  );
}

function formatShares(value: number) {
  return Number.isInteger(value) ? String(value) : value.toLocaleString('es', { maximumFractionDigits: 4 });
}

const styles = StyleSheet.create({
  kicker: { fontFamily: mono, fontSize: 10, letterSpacing: 1.2, color: stamp, textTransform: 'uppercase', marginTop: 22 },
  title: { fontFamily: serif, fontSize: 27, color: ink, marginTop: 7 },
  lead: { fontFamily: serif, fontSize: 14, lineHeight: 21, color: muted, marginTop: 8 },
  totals: { marginTop: 16, borderWidth: 1, borderColor: hairline, borderRadius: 18, backgroundColor: sheet, paddingHorizontal: 15, paddingVertical: 7 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: hairline },
  totalLabel: { fontFamily: serif, fontSize: 15, color: ink, flex: 1 },
  totalValue: { fontFamily: mono, fontSize: 14 },
  bucketNote: { fontFamily: mono, fontSize: 11, color: muted, marginBottom: 6 },
  empty: { fontFamily: serif, fontSize: 15, lineHeight: 22, color: muted, marginTop: 16 },
  warn: { fontFamily: serif, fontSize: 14, color: down, marginTop: 10 },
  formTitle: { fontFamily: serif, fontSize: 22, color: ink, marginTop: 26 },
  field: { marginTop: 12 },
  fieldLabel: { fontFamily: mono, fontSize: 10, letterSpacing: 0.8, color: muted, textTransform: 'uppercase', marginBottom: 6 },
  input: { minHeight: 50, borderWidth: 1, borderColor: hairline, borderRadius: 14, backgroundColor: sheet, color: ink, fontFamily: mono, fontSize: 16, paddingHorizontal: 14, paddingVertical: 10 },
  hint: { fontFamily: serif, fontSize: 13, lineHeight: 18, color: muted, marginTop: 8 },
  save: { marginTop: 14, minHeight: 50, backgroundColor: stamp, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', borderRadius: 15, paddingHorizontal: 16, paddingVertical: 12 },
  saveText: { fontFamily: mono, color: paper, fontSize: 13, letterSpacing: 0.4 },
  lot: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginTop: 8, paddingHorizontal: 14, paddingVertical: 14, borderRadius: 15, backgroundColor: sheet },
  lotMain: { flex: 1, minWidth: 0 },
  lotSymbol: { fontFamily: mono, fontSize: 16, color: ink },
  lotShares: { fontFamily: serif, fontSize: 14, color: muted },
  lotMeta: { fontFamily: serif, fontSize: 12, color: muted, marginTop: 4, lineHeight: 17 },
  lotSide: { flexShrink: 0, alignItems: 'flex-end', justifyContent: 'space-between', gap: 8 },
  lotPnl: { fontFamily: mono, fontSize: 14 },
  removeButton: { minHeight: 44, minWidth: 52, justifyContent: 'center', alignItems: 'flex-end' },
  remove: { fontFamily: mono, fontSize: 11, color: muted },
});
