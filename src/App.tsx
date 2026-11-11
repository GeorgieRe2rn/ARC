import React, { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { mastheadDate } from './lib/format';
import { useDesk } from './lib/useDesk';
import { display, hairline, ink, mono, muted, paper, serif, sheet, stamp } from './theme';
import BookView from './ui/BookView';
import ListView from './ui/ListView';
import QuoteView from './ui/QuoteView';

const TABS = [
  { id: 'cinta', label: 'Cinta' },
  { id: 'lista', label: 'Lista' },
  { id: 'libro', label: 'Libro' },
] as const;

type Tab = (typeof TABS)[number]['id'];

export default function App() {
  const desk = useDesk();
  const [tab, setTab] = useState<Tab>('cinta');
  const header = desk.detail?.symbol === desk.selected ? desk.detail : desk.quotes[desk.selected] ?? null;
  const chart = desk.chartQuote?.symbol === desk.selected ? desk.chartQuote : null;
  const openSymbol = (symbol: string) => {
    desk.choose(symbol);
    setTab('cinta');
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" />
      <View style={styles.shell}>
        <View style={styles.mast}>
          <View style={styles.mastTop}>
            <Text style={styles.wordmark}>ARC</Text>
            <Text style={styles.issue}>{mastheadDate()}</Text>
          </View>
          <Text style={styles.tag}>MARKET  ·  MESA DE COTIZACIONES</Text>
          <View style={styles.nav}>
            {TABS.map((item) => {
              const active = tab === item.id;
              return (
                <Pressable key={item.id} onPress={() => setTab(item.id)} style={[styles.navItem, active && styles.navItemOn]} accessibilityRole="tab" accessibilityState={{ selected: active }}>
                  <Text style={[styles.navText, active && styles.navTextOn]}>{item.label}</Text>
                  {active && <View style={styles.navMark} />}
                </Pressable>
              );
            })}
            <View style={styles.liveBadge} accessibilityRole="text" accessibilityLabel={desk.liveStatus === 'live' ? 'Flujo de cotizaciones en tiempo real conectado' : 'Usando actualización periódica de respaldo'}>
              <View style={[styles.liveDot, desk.liveStatus !== 'live' && styles.liveDotFallback]} />
              <Text style={[styles.liveText, desk.liveStatus !== 'live' && styles.liveTextFallback]}>
                {desk.liveStatus === 'live' ? 'STREAM' : desk.liveStatus === 'connecting' ? 'CONECTANDO' : desk.refreshing ? 'LEYENDO' : 'AUTO · 15 S'}
              </Text>
            </View>
          </View>
          {desk.liveMessage && desk.liveStatus !== 'live' && (
            <Text style={styles.streamNote}>{desk.liveMessage}</Text>
          )}
        </View>

        <ScrollView
          contentContainerStyle={styles.page}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={desk.refreshing} onRefresh={() => desk.refresh(true)} tintColor={stamp} colors={[stamp]} />}
        >
          {tab === 'cinta' && (
            <QuoteView
              symbol={desk.selected}
              quote={header}
              chart={chart}
              swing={desk.swing}
              loadingChart={desk.loadingDetail}
              error={desk.detailError}
              period={desk.period}
              readAt={desk.readAt}
              tape={desk.watchlist.map((symbol) => ({ symbol, quote: desk.quotes[symbol] }))}
              onPeriod={desk.choosePeriod}
              onSelect={desk.choose}
              onRetry={() => desk.refresh(true)}
            />
          )}
          {tab === 'lista' && (
            <ListView
              watchlist={desk.watchlist}
              quotes={desk.quotes}
              failed={desk.failed}
              loading={desk.loadingList}
              error={desk.listError}
              onOpen={openSymbol}
              onAdd={desk.addSymbol}
              onRemove={desk.removeSymbol}
            />
          )}
          {tab === 'libro' && (
            <BookView
              lots={desk.lots}
              quotes={desk.quotes}
              selected={desk.selected}
              onAdd={desk.addLot}
              onRemove={desk.removeLot}
              onOpen={openSymbol}
            />
          )}
          <Text style={styles.colophon}>Los precios salen de Twelve Data en el momento de la lectura. La lista y el libro se guardan en este teléfono. ARC no envía órdenes ni recomienda comprar o vender.</Text>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: paper },
  shell: { flex: 1, backgroundColor: paper, maxWidth: 760, width: '100%', alignSelf: 'center' },
  mast: { paddingHorizontal: 20, paddingTop: 8, backgroundColor: paper },
  mastTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  wordmark: { fontFamily: display, fontSize: 32, lineHeight: 38, fontWeight: '700', color: ink, letterSpacing: 4 },
  issue: { fontFamily: mono, fontSize: 10, color: muted, marginBottom: 2, letterSpacing: 0.4 },
  tag: { fontFamily: mono, fontSize: 9, color: muted, marginTop: 0, letterSpacing: 1.1 },
  nav: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 14, borderBottomWidth: 1, borderBottomColor: hairline },
  navItem: { minWidth: 70, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, borderRadius: 12, marginBottom: 6 },
  navItemOn: { backgroundColor: sheet },
  navText: { fontFamily: mono, fontSize: 12, color: muted, letterSpacing: 0.3 },
  navTextOn: { color: stamp },
  navMark: { display: 'none' },
  liveBadge: { marginLeft: 'auto', marginBottom: 6, minHeight: 38, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 20, backgroundColor: sheet },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: stamp },
  liveText: { fontFamily: mono, fontSize: 9, color: stamp, letterSpacing: 0.7 },
  liveDotFallback: { backgroundColor: muted },
  liveTextFallback: { color: muted },
  streamNote: { fontFamily: mono, color: muted, fontSize: 10, lineHeight: 15, marginTop: 8, paddingHorizontal: 4 },
  page: { paddingHorizontal: 20, paddingBottom: 36 },
  colophon: { fontFamily: serif, fontSize: 12, lineHeight: 18, color: muted, marginTop: 28, paddingTop: 12, borderTopWidth: 1, borderTopColor: hairline },
});
