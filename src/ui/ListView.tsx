import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Spark } from '../components/MarketChart';
import { money, signedPercent } from '../lib/format';
import type { Quote, SearchHit } from '../lib/parseQuote';
import { searchSymbols } from '../lib/yahoo';
import { down, hairline, ink, mono, muted, sheet, serif, stamp, up } from '../theme';

export default function ListView({
  watchlist,
  quotes,
  failed,
  loading,
  error,
  onOpen,
  onAdd,
  onRemove,
}: {
  watchlist: string[];
  quotes: Record<string, Quote>;
  failed: string[];
  loading: boolean;
  error: string | null;
  onOpen: (symbol: string) => void;
  onAdd: (symbol: string) => void;
  onRemove: (symbol: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setHits([]);
      setSearchError(null);
      setSearching(false);
      return;
    }
    let alive = true;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const found = await searchSymbols(q);
        if (!alive) return;
        setHits(found);
        setSearchError(found.length ? null : 'Ningún resultado en el mercado.');
      } catch (caught) {
        if (!alive) return;
        setHits([]);
        setSearchError(caught instanceof Error ? caught.message : 'La búsqueda falló.');
      } finally {
        if (alive) setSearching(false);
      }
    }, 320);
    return () => { alive = false; clearTimeout(timer); };
  }, [query]);

  return (
    <View>
      <Text style={styles.kicker}>LISTA  /  MERCADO</Text>
      <Text style={styles.title}>Lo que estás siguiendo.</Text>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Buscar empresa, ETF o índice"
        placeholderTextColor={muted}
        autoCapitalize="characters"
        autoCorrect={false}
        style={styles.input}
        accessibilityLabel="Buscar empresa, ETF o índice"
      />
      {searching && <ActivityIndicator color={ink} style={{ marginTop: 12, alignSelf: 'flex-start' }} />}
      {searchError && query.trim().length >= 2 && <Text style={styles.searchNote}>{searchError}</Text>}
      {hits.map((hit) => {
        const saved = watchlist.includes(hit.symbol);
        return (
          <View key={hit.symbol} style={styles.hit}>
            <Pressable style={{ flex: 1 }} onPress={() => onOpen(hit.symbol)}>
              <Text style={styles.hitName}>{hit.name}</Text>
              <Text style={styles.hitMeta}>{hit.symbol}  ·  {hit.exchange}  ·  {hit.type}</Text>
            </Pressable>
            <Pressable onPress={() => onAdd(hit.symbol)} disabled={saved} style={styles.actionButton} accessibilityRole="button">
              <Text style={[styles.action, saved && styles.actionMuted]}>{saved ? 'En lista' : '+ Añadir'}</Text>
            </Pressable>
          </View>
        );
      })}

      <View style={styles.tableHead}>
        <Text style={[styles.headText, { flex: 1 }]}>Símbolo</Text>
        <Text style={[styles.headText, styles.right]}>Último</Text>
      </View>
      {watchlist.length === 0 && <Text style={styles.empty}>La lista está vacía. Busca un símbolo y añádelo.</Text>}
      {watchlist.map((symbol) => {
        const quote = quotes[symbol];
        const broken = failed.includes(symbol);
        const closes = quote?.bars.map((bar) => bar.close) ?? [];
        const rising = (quote?.change ?? 0) >= 0;
        return (
          <Pressable key={symbol} onPress={() => onOpen(symbol)} style={styles.row} accessibilityRole="button" accessibilityLabel={`${symbol}, ${quote ? money(quote.price, quote.currency, quote.priceHint) : 'cotización pendiente'}`}>
            <View style={styles.rowMain}>
              <Text style={styles.rowSymbol}>{symbol}</Text>
              <Text style={styles.rowName} numberOfLines={1}>{quote?.name ?? (broken ? 'Sin cotización' : 'Leyendo…')}</Text>
            </View>
            <Spark closes={closes} rising={rising} />
            <View style={styles.priceCol}>
              <Text style={styles.rowPrice}>{quote ? money(quote.price, quote.currency, quote.priceHint) : '—'}</Text>
              <Text style={[styles.rowChange, quote ? (quote.change > 0 ? styles.up : quote.change < 0 ? styles.down : styles.quiet) : styles.quiet]}>
                {quote ? signedPercent(quote.changePercent) : broken ? 'error' : '…'}
              </Text>
            </View>
            <Pressable onPress={() => onRemove(symbol)} hitSlop={10} style={styles.removeButton} accessibilityRole="button" accessibilityLabel={`Quitar ${symbol}`}><Text style={styles.remove}>×</Text></Pressable>
          </Pressable>
        );
      })}
      {error && <Text style={styles.searchNote}>{error}</Text>}
      {loading && watchlist.length > 0 && <Text style={styles.foot}>Actualizando la lista…</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  kicker: { fontFamily: mono, fontSize: 10, letterSpacing: 1.2, color: stamp, textTransform: 'uppercase', marginTop: 22 },
  title: { fontFamily: serif, fontSize: 27, color: ink, marginTop: 7, marginBottom: 14 },
  input: { minHeight: 52, borderWidth: 1, borderColor: hairline, borderRadius: 15, backgroundColor: sheet, color: ink, fontFamily: serif, fontSize: 16, paddingHorizontal: 15, paddingVertical: 11 },
  searchNote: { fontFamily: serif, fontSize: 14, color: down, marginTop: 10 },
  hit: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: hairline },
  hitName: { fontFamily: serif, fontSize: 16, color: ink },
  hitMeta: { fontFamily: mono, fontSize: 11, color: muted, marginTop: 3 },
  actionButton: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 12, backgroundColor: sheet },
  action: { fontFamily: mono, fontSize: 11, color: stamp, letterSpacing: 0.4 },
  actionMuted: { color: muted },
  tableHead: { flexDirection: 'row', marginTop: 18, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: hairline },
  headText: { fontFamily: mono, fontSize: 10, color: muted, letterSpacing: 0.8, textTransform: 'uppercase' },
  right: { width: 92, textAlign: 'right' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 76, paddingVertical: 10, paddingHorizontal: 8, marginTop: 6, borderRadius: 15, backgroundColor: sheet },
  rowMain: { flex: 1, minWidth: 0 },
  rowSymbol: { fontFamily: mono, fontSize: 15, color: ink },
  rowName: { fontFamily: serif, fontSize: 13, color: muted, marginTop: 2 },
  priceCol: { width: 86, alignItems: 'flex-end' },
  rowPrice: { fontFamily: mono, fontSize: 13, color: ink },
  rowChange: { fontFamily: mono, fontSize: 12, marginTop: 2 },
  removeButton: { width: 42, height: 48, alignItems: 'center', justifyContent: 'center' },
  remove: { fontFamily: mono, fontSize: 22, color: muted },
  empty: { fontFamily: serif, fontSize: 15, color: muted, marginTop: 16 },
  foot: { fontFamily: serif, fontSize: 13, color: muted, marginTop: 12 },
  up: { color: up },
  down: { color: down },
  quiet: { color: muted },
});
