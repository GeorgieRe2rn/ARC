import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import MarketChart from '../components/MarketChart';
import { clockLabel, compact, exchangeStamp, localClock, money, sessionLabel, signedNumber, signedPercent } from '../lib/format';
import type { Quote } from '../lib/parseQuote';
import type { Swing } from '../lib/stats';
import { PERIODS, type PeriodId } from '../lib/yahoo';
import { down, hairline, ink, mono, muted, paper, serif, sheet, stamp, up } from '../theme';

type TapeItem = { symbol: string; quote?: Quote };

export default function QuoteView({
  symbol,
  quote,
  chart,
  swing,
  loadingChart,
  error,
  period,
  tape,
  readAt,
  onPeriod,
  onSelect,
  onRetry,
}: {
  symbol: string;
  quote: Quote | null;
  chart: Quote | null;
  swing: Swing | null;
  loadingChart: boolean;
  error: string | null;
  period: PeriodId;
  tape: TapeItem[];
  readAt: number | null;
  onPeriod: (period: PeriodId) => void;
  onSelect: (symbol: string) => void;
  onRetry: () => void;
}) {
  const tone = !quote ? ink : quote.change > 0 ? up : quote.change < 0 ? down : ink;
  const closes = chart?.bars.map((bar) => bar.close) ?? [];
  const rising = closes.length > 1 ? closes[closes.length - 1] >= closes[0] : (quote?.change ?? 0) >= 0;
  return (
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tape}>
        {tape.map((item) => {
          const active = item.symbol === symbol;
          const change = item.quote?.changePercent;
          return (
            <Pressable key={item.symbol} onPress={() => onSelect(item.symbol)} style={[styles.tapeItem, active && styles.tapeItemOn]} accessibilityRole="button" accessibilityLabel={`${item.symbol}, ${change == null ? 'sin variación' : signedPercent(change)}`}>
              <Text style={[styles.tapeSymbol, active && styles.tapeSymbolOn]}>{item.symbol}</Text>
              <Text style={[styles.tapeChange, change == null ? styles.quiet : change > 0 ? styles.up : change < 0 ? styles.down : styles.quiet]}>
                {change == null ? '…' : signedPercent(change)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.identity}>
        <View style={{ flex: 1 }}>
          <Text style={styles.kicker}>COTIZACIÓN  /  EN VIVO</Text>
          <Text style={styles.name}>{quote?.name ?? symbol}</Text>
          <Text style={styles.symbolLine}>{quote?.symbol ?? symbol}{quote?.exchange ? `   ${quote.exchange}` : ''}</Text>
        </View>
        {quote && (
          <View style={[styles.session, quote.session === 'REGULAR' ? styles.sessionOpen : styles.sessionShut]}>
            <Text style={[styles.sessionText, quote.session === 'REGULAR' ? styles.up : styles.stamp]}>{sessionLabel(quote.session)}</Text>
          </View>
        )}
      </View>

      <View style={styles.quoteCard}>
      {quote ? (
        <>
          <Text style={[styles.price, { color: tone }]} adjustsFontSizeToFit numberOfLines={1}>{money(quote.price, quote.currency, quote.priceHint)}</Text>
          <Text style={[styles.change, { color: tone }]}>{signedNumber(quote.change, quote.priceHint)} {quote.currency}    {signedPercent(quote.changePercent)}</Text>
          <Text style={styles.asof}>
            Último cambio {exchangeStamp(quote.marketTime, quote.timezone)} {quote.tzAbbrev}
            {readAt ? ` · leído ${localClock(new Date(readAt))}` : ''}
          </Text>
        </>
      ) : (
        <Text style={styles.waiting}>{error ? error : 'Leyendo la cotización…'}</Text>
      )}
      </View>

      {error && quote && (
        <Pressable onPress={onRetry} style={styles.retry}><Text style={styles.retryText}>{error} Reintentar.</Text></Pressable>
      )}

      <View style={styles.chartBlock}>
        {closes.length > 1 ? (
          <MarketChart closes={closes} rising={rising} />
        ) : (
          <View style={styles.chartEmpty}><Text style={styles.quiet}>{loadingChart ? 'Leyendo el tramo…' : error || 'Este plazo no trajo historia.'}</Text></View>
        )}
        {chart && chart.bars.length > 1 && (
          <View style={styles.axis}>
            <Text style={styles.axisText}>{clockLabel(chart.bars[0].time, chart.timezone)}</Text>
            <Text style={styles.axisText}>Mínimo y máximo del tramo</Text>
            <Text style={styles.axisText}>{clockLabel(chart.bars[chart.bars.length - 1].time, chart.timezone)}</Text>
          </View>
        )}
        <View style={styles.periods}>
          {PERIODS.map((item) => (
            <Pressable key={item.id} onPress={() => onPeriod(item.id)} style={styles.period} accessibilityRole="button" accessibilityState={{ selected: period === item.id }}>
              <Text style={[styles.periodText, period === item.id && styles.periodOn]}>{item.id}</Text>
              {period === item.id && <View style={styles.periodRule} />}
            </Pressable>
          ))}
        </View>
      </View>

      {!quote && error && (
        <Pressable onPress={onRetry} style={styles.retryButton}><Text style={styles.retryButtonText}>Reintentar</Text></Pressable>
      )}

      {quote && (
        <View style={styles.grid}>
          <Cell label="Apertura" value={quote.sessionOpen == null ? '—' : money(quote.sessionOpen, quote.currency, quote.priceHint)} />
          <Cell label="Máximo del día" value={quote.dayHigh == null ? '—' : money(quote.dayHigh, quote.currency, quote.priceHint)} />
          <Cell label="Mínimo del día" value={quote.dayLow == null ? '—' : money(quote.dayLow, quote.currency, quote.priceHint)} />
          <Cell label="Volumen" value={quote.volume == null ? '—' : compact(quote.volume)} />
          <Cell label="Cierre previo" value={quote.previousClose == null ? '—' : money(quote.previousClose, quote.currency, quote.priceHint)} />
          <Cell label="52 semanas" value={quote.fiftyTwoWeekLow == null || quote.fiftyTwoWeekHigh == null ? '—' : `${money(quote.fiftyTwoWeekLow, quote.currency, 0)} – ${money(quote.fiftyTwoWeekHigh, quote.currency, 0)}`} />
        </View>
      )}

      <View style={styles.swing}>
        <Text style={styles.kicker}>Oscilación realizada</Text>
        {swing?.dailyMove != null && quote ? (
          <>
            <View style={styles.swingRow}><Text style={styles.swingLabel}>Volatilidad {swing.sessions} sesiones</Text><Text style={styles.swingValue}>{swing.annualizedVol!.toFixed(1)}% anual</Text></View>
            <View style={styles.swingRow}><Text style={styles.swingLabel}>Día típico, 1σ</Text><Text style={styles.swingValue}>±{money(swing.dailyMove, quote.currency, quote.priceHint)}</Text></View>
            <View style={styles.swingRow}><Text style={styles.swingLabel}>Banda de un día</Text><Text style={styles.swingValue}>{money(swing.low!, quote.currency, quote.priceHint)} – {money(swing.high!, quote.currency, quote.priceHint)}</Text></View>
            <Text style={styles.note}>Desviación de los últimos {swing.sessions} cierres diarios, anualizada con √252. La banda es el último cierre ± un día típico. Es historia medida, no un pronóstico.</Text>
          </>
        ) : (
          <Text style={styles.note}>{loadingChart ? 'Calculando con los cierres diarios…' : 'Aún no hay suficientes cierres diarios para medir la oscilación.'}</Text>
        )}
      </View>
    </View>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.cell}>
      <Text style={styles.cellLabel}>{label}</Text>
      <Text style={styles.cellValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tape: { paddingTop: 12, paddingBottom: 8, gap: 8 },
  tapeItem: { minWidth: 76, minHeight: 48, paddingHorizontal: 12, justifyContent: 'center', borderRadius: 12, backgroundColor: sheet },
  tapeItemOn: { borderWidth: 1, borderColor: stamp },
  tapeSymbol: { fontFamily: mono, fontSize: 12, color: muted, letterSpacing: 0.6 },
  tapeSymbolOn: { color: ink },
  tapeChange: { fontFamily: mono, fontSize: 11, marginTop: 2 },
  kicker: { fontFamily: mono, fontSize: 10, letterSpacing: 1.2, color: stamp, textTransform: 'uppercase', marginTop: 18 },
  identity: { flexDirection: 'row', alignItems: 'flex-end', gap: 12, marginTop: 10 },
  name: { fontFamily: serif, fontSize: 25, lineHeight: 30, color: ink, marginTop: 4 },
  symbolLine: { fontFamily: mono, fontSize: 11, color: muted, marginTop: 5, letterSpacing: 0.4 },
  session: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6, marginBottom: 2 },
  sessionOpen: { borderColor: up },
  sessionShut: { borderColor: stamp },
  sessionText: { fontFamily: mono, fontSize: 10, letterSpacing: 0.8, textTransform: 'uppercase' },
  quoteCard: { backgroundColor: sheet, borderRadius: 20, paddingHorizontal: 18, paddingVertical: 16, marginTop: 14, borderWidth: 1, borderColor: hairline },
  price: { fontFamily: mono, fontSize: 46, marginTop: 0, letterSpacing: -1 },
  change: { fontFamily: mono, fontSize: 15, marginTop: 5 },
  asof: { fontFamily: serif, fontSize: 12, color: muted, marginTop: 8, lineHeight: 17 },
  waiting: { fontFamily: serif, fontSize: 18, color: ink, marginTop: 18 },
  chartBlock: { marginTop: 16 },
  chartEmpty: { height: 176, borderWidth: 1, borderColor: hairline, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: sheet },
  axis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  axisText: { fontFamily: mono, fontSize: 10, color: muted },
  periods: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, borderTopWidth: 1, borderTopColor: hairline, paddingTop: 8 },
  period: { paddingVertical: 8, minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  periodText: { fontFamily: mono, fontSize: 13, color: muted },
  periodOn: { color: ink },
  periodRule: { display: 'none' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 16, backgroundColor: sheet, borderRadius: 18, paddingHorizontal: 12, borderWidth: 1, borderColor: hairline },
  cell: { width: '33.33%', minHeight: 68, paddingTop: 12, paddingRight: 8, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: hairline },
  cellLabel: { fontFamily: mono, fontSize: 10, color: muted, letterSpacing: 0.4, textTransform: 'uppercase' },
  cellValue: { fontFamily: mono, fontSize: 13, color: ink, marginTop: 4 },
  swing: { marginTop: 12, padding: 16, backgroundColor: sheet, borderRadius: 18, borderWidth: 1, borderColor: hairline },
  swingRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: hairline },
  swingLabel: { fontFamily: serif, fontSize: 15, color: ink, flex: 1 },
  swingValue: { fontFamily: mono, fontSize: 14, color: ink },
  note: { fontFamily: serif, fontSize: 13, lineHeight: 19, color: muted, marginTop: 10 },
  retry: { marginTop: 12 },
  retryText: { fontFamily: serif, fontSize: 14, color: down },
  retryButton: { marginTop: 14, alignSelf: 'flex-start', backgroundColor: stamp, borderRadius: 14, minHeight: 48, justifyContent: 'center', paddingHorizontal: 18, paddingVertical: 10 },
  retryButtonText: { fontFamily: mono, color: paper, fontSize: 12, letterSpacing: 0.6 },
  quiet: { color: muted },
  up: { color: up },
  down: { color: down },
  stamp: { color: stamp },
});
