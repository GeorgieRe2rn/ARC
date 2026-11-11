package com.arcmarket.wear;

import android.app.Activity;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.Typeface;
import android.os.Bundle;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.view.MotionEvent;
import android.view.View;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.WebSocket;
import okhttp3.WebSocketListener;

public class WatchActivity extends Activity {
    private static final String[] SYMBOLS = {"AAPL", "NVDA", "MSFT", "AMZN", "TSLA"};
    private static final int BACKGROUND = 0xFF000000;
    private static final int TEXT = 0xFFF2F4F3;
    private static final int ACCENT = 0xFF00E5A0;
    private static final int MUTED = 0xFF929A98;
    private static final int TRACK = 0xFF28302D;
    private static final int NEGATIVE = 0xFFFF796F;
    private static final long REFRESH_INTERVAL_MS = 15_000L;
    private static final String NOTIFICATION_CHANNEL_ID = "arc-market-price-updates";

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final Runnable refreshTicker = new Runnable() {
        @Override public void run() {
            if (!resumed) return;
            if (!streamAccepted) load();
            if (liveSocket == null) connectStream();
            handler.postDelayed(this, REFRESH_INTERVAL_MS);
        }
    };
    private final OkHttpClient liveClient = new OkHttpClient.Builder().build();
    private final Runnable streamHeartbeat = new Runnable() {
        @Override public void run() {
            WebSocket socket = liveSocket;
            if (!resumed || socket == null) return;
            socket.send("{\"action\":\"heartbeat\"}");
            handler.postDelayed(this, 10_000L);
        }
    };
    private Dial dial;
    private Vibrator vibrator;
    private Future<?> request;
    private WebSocket liveSocket;
    private boolean streamAccepted;
    private int streamGeneration;
    private LiveTick latestTick;
    private int index;
    private int requestId;
    private Quote quote;
    private String status = "CARGANDO";
    private boolean resumed;

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(BACKGROUND);
        getWindow().setNavigationBarColor(BACKGROUND);
        vibrator = (Vibrator) getSystemService(VIBRATOR_SERVICE);
        dial = new Dial();
        setContentView(dial);
        ensureNotificationChannel();
        requestNotificationPermissionIfNeeded();
    }

    @Override protected void onResume() {
        super.onResume();
        resumed = true;
        load();
        connectStream();
        handler.removeCallbacks(refreshTicker);
        handler.postDelayed(refreshTicker, REFRESH_INTERVAL_MS);
    }

    @Override protected void onPause() {
        resumed = false;
        handler.removeCallbacks(refreshTicker);
        closeStream();
        cancelRequest();
        super.onPause();
    }

    @Override protected void onDestroy() {
        cancelRequest();
        closeStream();
        liveClient.dispatcher().executorService().shutdown();
        liveClient.connectionPool().evictAll();
        executor.shutdownNow();
        super.onDestroy();
    }

    private void cancelRequest() {
        requestId++;
        if (request != null) {
            request.cancel(true);
            request = null;
        }
    }

    private void connectStream() {
        if (!resumed || liveSocket != null) return;
        if (BuildConfig.TWELVE_DATA_API_KEY.trim().isEmpty()) {
            streamAccepted = false;
            status = "AUTO · 15 S";
            dial.invalidate();
            return;
        }
        final int generation = ++streamGeneration;
        final String symbol = SYMBOLS[index];
        String url = android.net.Uri.parse("wss://ws.twelvedata.com/v1/quotes/price")
                .buildUpon()
                .appendQueryParameter("apikey", BuildConfig.TWELVE_DATA_API_KEY)
                .build()
                .toString();
        Request request = new Request.Builder().url(url).build();
        liveSocket = liveClient.newWebSocket(request, new WebSocketListener() {
            @Override public void onOpen(WebSocket webSocket, Response response) {
                webSocket.send("{\"action\":\"subscribe\",\"params\":{\"symbols\":\"" + symbol + "\"}}");
                handler.post(() -> {
                    if (generation != streamGeneration) return;
                    status = "CONECTANDO";
                    handler.removeCallbacks(streamHeartbeat);
                    handler.postDelayed(streamHeartbeat, 10_000L);
                    dial.invalidate();
                });
            }

            @Override public void onMessage(WebSocket webSocket, String text) {
                try {
                    JSONObject payload = new JSONObject(text);
                    String event = payload.optString("event", "");
                    if ("subscribe-status".equals(event)) {
                        JSONArray success = payload.optJSONArray("success");
                        boolean accepted = "ok".equals(payload.optString("status")) && containsSymbol(success, symbol);
                        handler.post(() -> {
                            if (generation != streamGeneration) return;
                            streamAccepted = accepted;
                            status = accepted ? "STREAM" : "AUTO · 15 S";
                            if (!accepted) load();
                            dial.invalidate();
                        });
                    } else if ("price".equals(event) && symbol.equalsIgnoreCase(payload.optString("symbol"))) {
                        double price = payload.optDouble("price", Double.NaN);
                        if (!Double.isFinite(price)) return;
                        long timestamp = payload.optLong("timestamp", System.currentTimeMillis() / 1000L);
                        double volume = payload.optDouble("day_volume", Double.NaN);
                        handler.post(() -> {
                            if (generation != streamGeneration) return;
                            latestTick = new LiveTick(symbol, price, timestamp, volume);
                            streamAccepted = true;
                            if (quote != null && symbol.equals(quote.symbol)) {
                                Quote previous = quote;
                                quote = applyTick(quote, latestTick);
                                notifyPriceChange(previous, quote);
                            }
                            status = "STREAM";
                            dial.invalidate();
                        });
                    } else if ("error".equals(event) || "error".equals(payload.optString("status"))) {
                        handler.post(() -> {
                            if (generation != streamGeneration) return;
                            streamAccepted = false;
                            status = "AUTO · 15 S";
                            dial.invalidate();
                        });
                    }
                } catch (Exception ignored) {
                    handler.post(() -> {
                        if (generation == streamGeneration) status = "AUTO · 15 S";
                    });
                }
            }

            @Override public void onFailure(WebSocket webSocket, Throwable error, Response response) {
                handler.post(() -> {
                    if (generation != streamGeneration) return;
                    liveSocket = null;
                    streamAccepted = false;
                    status = "AUTO · 15 S";
                    dial.invalidate();
                });
            }

            @Override public void onClosed(WebSocket webSocket, int code, String reason) {
                handler.post(() -> {
                    if (generation != streamGeneration) return;
                    liveSocket = null;
                    streamAccepted = false;
                    status = "AUTO · 15 S";
                    dial.invalidate();
                });
            }
        });
    }

    private static boolean containsSymbol(JSONArray symbols, String expected) {
        if (symbols == null) return false;
        for (int i = 0; i < symbols.length(); i++) {
            if (expected.equalsIgnoreCase(symbols.optJSONObject(i) == null ? "" : symbols.optJSONObject(i).optString("symbol"))) return true;
        }
        return false;
    }

    private void closeStream() {
        streamGeneration++;
        streamAccepted = false;
        handler.removeCallbacks(streamHeartbeat);
        WebSocket socket = liveSocket;
        liveSocket = null;
        if (socket != null) socket.close(1000, "screen inactive or symbol changed");
    }

    private static Quote applyTick(Quote source, LiveTick tick) {
        double change = source.previousClose > 0 ? tick.price - source.previousClose : source.changePercent;
        double changePercent = source.previousClose > 0 ? change / source.previousClose * 100 : source.changePercent;
        ArrayList<Double> closes = new ArrayList<>(source.closes);
        if (!closes.isEmpty()) closes.set(closes.size() - 1, tick.price);
        return new Quote(source.symbol, tick.price, changePercent, source.previousClose, source.session, closes);
    }

    private void load() {
        cancelRequest();
        final int thisRequest = requestId;
        final String symbol = SYMBOLS[index];
        status = "CARGANDO";
        dial.invalidate();
        request = executor.submit(() -> {
            try {
                Quote next = fetch(symbol);
                handler.post(() -> {
                    if (!isCurrent(thisRequest, symbol)) return;
                    Quote previous = quote;
                    quote = latestTick != null && symbol.equals(latestTick.symbol) ? applyTick(next, latestTick) : next;
                    notifyPriceChange(previous, quote);
                    status = streamAccepted ? "STREAM" : "AUTO · 15 S";
                    dial.invalidate();
                });
            } catch (Exception error) {
                handler.post(() -> {
                    if (!isCurrent(thisRequest, symbol)) return;
                    status = describeError(error);
                    dial.invalidate();
                });
            }
        });
    }

    private static String describeError(Exception error) {
        String message = error.getMessage();
        if (message == null || message.trim().isEmpty()) return "ERROR DE RED";
        if (message.contains("UnknownHostException")) return "SIN INTERNET";
        if (message.contains("HTTP 401") || message.contains("HTTP 403")) return "ACCESO BLOQUEADO";
        if (message.contains("HTTP 429")) return "LÍMITE DE CONSULTAS";
        if (message.contains("HTTP 5")) return "MERCADO NO DISPONIBLE";
        if (message.toLowerCase(Locale.ROOT).contains("api key") || message.toLowerCase(Locale.ROOT).contains("apikey") || message.toLowerCase(Locale.ROOT).contains("invalid api")) return "CLAVE TWELVE INVÁLIDA";
        if (message.toLowerCase(Locale.ROOT).contains("quota") || message.toLowerCase(Locale.ROOT).contains("credits") || message.toLowerCase(Locale.ROOT).contains("trial")) return "CUOTA TWELVE AGOTADA";
        if (message.toLowerCase(Locale.ROOT).contains("symbol") || message.toLowerCase(Locale.ROOT).contains("instrument")) return "SÍMBOLO NO DISPONIBLE";
        if (message.contains("HTTP ")) return "ERROR TWELVE DATA";
        if (message.contains("chart") || message.contains("finance")) return "RESPUESTA INVÁLIDA";
        return "ERROR DE RED";
    }

    private boolean isCurrent(int id, String symbol) {
        return resumed && id == requestId && symbol.equals(SYMBOLS[index]);
    }

    private void ensureNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager == null) return;
        NotificationChannel channel = new NotificationChannel(
                NOTIFICATION_CHANNEL_ID,
                "Cambios de cotización",
                NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription("Avisos cuando cambia una cotización de ARC Market.");
        channel.enableVibration(true);
        manager.createNotificationChannel(channel);
    }

    private void requestNotificationPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT >= 33
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 7001);
        }
    }

    private void notifyPriceChange(Quote previous, Quote updated) {
        if (previous == null || updated == null || !previous.symbol.equals(updated.symbol)
                || Math.abs(previous.price - updated.price) < 0.0000001) return;
        if (Build.VERSION.SDK_INT >= 33
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return;
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager == null) return;
        Intent intent = new Intent(this, WatchActivity.class);
        PendingIntent contentIntent = PendingIntent.getActivity(
                this, index, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(this, NOTIFICATION_CHANNEL_ID)
                : new Notification.Builder(this);
        Notification notification = builder
                .setSmallIcon(android.R.drawable.ic_menu_info_details)
                .setContentTitle(updated.symbol + " · cotización actualizada")
                .setContentText(String.format(Locale.US, "$%.2f · %+.2f%%", updated.price, updated.changePercent))
                .setContentIntent(contentIntent)
                .setCategory(Notification.CATEGORY_STATUS)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setAutoCancel(true)
                .setOnlyAlertOnce(false)
                .setVibrate(new long[]{0, 140})
                .build();
        manager.notify(7000 + index, notification);
    }

    private Quote fetch(String symbol) throws Exception {
        if (BuildConfig.TWELVE_DATA_API_KEY.trim().isEmpty() || "demo".equalsIgnoreCase(BuildConfig.TWELVE_DATA_API_KEY.trim())) {
            throw new IllegalStateException("Twelve Data API key is not configured");
        }
        android.net.Uri uri = android.net.Uri.parse("https://api.twelvedata.com/time_series")
                .buildUpon()
                .appendQueryParameter("symbol", symbol)
                .appendQueryParameter("interval", "1day")
                .appendQueryParameter("outputsize", "30")
                .appendQueryParameter("apikey", BuildConfig.TWELVE_DATA_API_KEY)
                .build();
        Request request = new Request.Builder().url(uri.toString()).header("Accept", "application/json").build();
        try (Response response = liveClient.newCall(request).execute()) {
            String body = response.body() == null ? "" : response.body().string();
            if (!response.isSuccessful()) throw new IllegalStateException("HTTP " + response.code());
            JSONObject payload = new JSONObject(body);
            if ("error".equalsIgnoreCase(payload.optString("status")) || payload.has("code") && !payload.has("values")) {
                String message = payload.optString("message", "Twelve Data rechazó la solicitud");
                throw new IllegalStateException(message);
            }
            JSONObject meta = payload.optJSONObject("meta");
            JSONArray values = payload.optJSONArray("values");
            if (values == null || values.length() == 0) throw new IllegalStateException("Twelve Data no devolvió precios");
            ArrayList<Double> closes = new ArrayList<>();
            for (int i = values.length() - 1; i >= 0; i--) {
                JSONObject item = values.optJSONObject(i);
                if (item == null) continue;
                double close = parseNumber(item.opt("close"));
                if (Double.isFinite(close)) closes.add(close);
            }
            JSONObject latest = values.optJSONObject(0);
            double price = latest == null ? Double.NaN : parseNumber(latest.opt("close"));
            if (!Double.isFinite(price) || price <= 0) throw new IllegalStateException("Twelve Data devolvió un precio inválido");
            double previousClose = closes.size() > 1 ? closes.get(closes.size() - 2) : 0;
            double changePercent = previousClose > 0 ? (price - previousClose) / previousClose * 100 : 0;
            String session = "CLOSED";
            if (meta != null && "open".equalsIgnoreCase(meta.optString("status"))) session = "REGULAR";
            return new Quote(symbol, price, changePercent, previousClose, session, closes);
        }
    }

    private static double parseNumber(Object value) {
        if (value instanceof Number) return ((Number) value).doubleValue();
        if (value instanceof String) {
            try { return Double.parseDouble(((String) value).trim()); }
            catch (NumberFormatException ignored) { return Double.NaN; }
        }
        return Double.NaN;
    }

    private static String sessionLabel(String session) {
        if ("REGULAR".equals(session)) return "ABIERTO";
        if ("PRE".equals(session)) return "PREMERCADO";
        if ("POST".equals(session)) return "AFTER HOURS";
        return "CERRADO";
    }

    private void advance() {
        closeStream();
        index = (index + 1) % SYMBOLS.length;
        quote = null;
        latestTick = null;
        if (vibrator != null && vibrator.hasVibrator()) {
            vibrator.vibrate(VibrationEffect.createOneShot(18, VibrationEffect.DEFAULT_AMPLITUDE));
        }
        load();
        connectStream();
    }

    private final class Dial extends View {
        private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        private float downX;
        private float downY;
        private long downAt;

        Dial() {
            super(WatchActivity.this);
            setFocusable(true);
            setContentDescription("ARC Market. Toca para cambiar símbolo. Mantén pulsado para actualizar.");
        }

        @Override public boolean onTouchEvent(MotionEvent event) {
            if (event.getAction() == MotionEvent.ACTION_DOWN) {
                downX = event.getX();
                downY = event.getY();
                downAt = System.currentTimeMillis();
                return true;
            }
            if (event.getAction() == MotionEvent.ACTION_UP) {
                float dx = event.getX() - downX;
                float dy = event.getY() - downY;
                if (Math.abs(dx) > 30 || Math.abs(dy) > 30) return true;
                if (System.currentTimeMillis() - downAt > 550) load();
                else advance();
                performClick();
                return true;
            }
            return true;
        }

        @Override public boolean performClick() {
            super.performClick();
            return true;
        }

        @Override protected void onDraw(Canvas canvas) {
            super.onDraw(canvas);
            float scale = Math.min(getWidth(), getHeight()) / 240f;
            canvas.save();
            canvas.translate(getWidth() / 2f - 120 * scale, getHeight() / 2f - 120 * scale);
            canvas.scale(scale, scale);
            canvas.drawColor(BACKGROUND);
            paint.setStyle(Paint.Style.STROKE);
            paint.setStrokeWidth(2);
            paint.setColor(TRACK);
            canvas.drawCircle(120, 120, 108, paint);
            if (quote != null && quote.symbol.equals(SYMBOLS[index]) && quote.closes.size() > 1) {
                float sweep = (index + 1) * 360f / SYMBOLS.length;
                paint.setColor(ACCENT);
                paint.setStrokeCap(Paint.Cap.ROUND);
                canvas.drawArc(12, 12, 228, 228, -90, sweep, false, paint);
            } else {
                paint.setColor(ACCENT);
                paint.setStrokeCap(Paint.Cap.ROUND);
                canvas.drawArc(12, 12, 228, 228, -90, (index + 1) * 360f / SYMBOLS.length, false, paint);
            }
            paint.setStyle(Paint.Style.FILL);
            text(canvas, "ARC  ·  " + new SimpleDateFormat("HH:mm", Locale.getDefault()).format(new Date()), 120, 43, 9, MUTED, false);
            text(canvas, streamAccepted ? "● STREAM" : "○ AUTO · 15 S", 120, 59, 7, streamAccepted ? ACCENT : MUTED, true);
            text(canvas, SYMBOLS[index], 120, 77, 15, TEXT, true);
            if (quote != null && quote.symbol.equals(SYMBOLS[index])) {
                int tone = quote.changePercent < 0 ? NEGATIVE : ACCENT;
                textFit(canvas, String.format(Locale.US, "%.2f", quote.price), 120, 113, 30, TEXT, true, 172);
                text(canvas, String.format(Locale.US, "%+.2f%%", quote.changePercent), 120, 137, 13, tone, true);
                text(canvas, sessionLabel(quote.session), 120, 156, 8, MUTED, true);
                drawSeries(canvas, quote.closes, tone);
            } else {
                text(canvas, "—", 120, 116, 28, MUTED, true);
                boolean failed = !"CARGANDO".equals(status);
                text(canvas, status, 120, 143, 8, failed ? NEGATIVE : MUTED, true);
                if (failed) text(canvas, "MANTÉN PARA REINTENTAR", 120, 162, 7, MUTED, false);
            }
            text(canvas, "TOCA · SIGUIENTE", 120, 211, 8, MUTED, false);
            canvas.restore();
        }

        private void drawSeries(Canvas canvas, ArrayList<Double> closes, int color) {
            int start = Math.max(0, closes.size() - 22);
            int count = closes.size() - start;
            if (count < 2) return;
            double min = closes.get(start);
            double max = min;
            for (int i = start; i < closes.size(); i++) {
                min = Math.min(min, closes.get(i));
                max = Math.max(max, closes.get(i));
            }
            double span = Math.max(0.0001, max - min);
            Path path = new Path();
            for (int i = 0; i < count; i++) {
                float x = 52 + i * 136f / (count - 1);
                float y = (float) (191 - ((closes.get(start + i) - min) / span) * 25);
                if (i == 0) path.moveTo(x, y);
                else path.lineTo(x, y);
            }
            paint.setStyle(Paint.Style.STROKE);
            paint.setStrokeWidth(2f);
            paint.setColor(color);
            paint.setStrokeCap(Paint.Cap.ROUND);
            paint.setStrokeJoin(Paint.Join.ROUND);
            canvas.drawPath(path, paint);
            paint.setStyle(Paint.Style.FILL);
        }

        private void text(Canvas canvas, String value, float x, float y, float size, int color, boolean bold) {
            paint.setColor(color);
            paint.setTextSize(size);
            paint.setTextAlign(Paint.Align.CENTER);
            paint.setTypeface(Typeface.create(bold ? "sans-serif-medium" : "sans-serif", bold ? Typeface.BOLD : Typeface.NORMAL));
            canvas.drawText(value, x, y, paint);
        }

        private void textFit(Canvas canvas, String value, float x, float y, float size, int color, boolean bold, float maxWidth) {
            paint.setTypeface(Typeface.create("sans-serif-medium", bold ? Typeface.BOLD : Typeface.NORMAL));
            paint.setTextSize(size);
            paint.setTextAlign(Paint.Align.CENTER);
            float measured = paint.measureText(value);
            if (measured > maxWidth) paint.setTextSize(size * maxWidth / measured);
            paint.setColor(color);
            canvas.drawText(value, x, y, paint);
        }
    }

    private static final class Quote {
        final String symbol;
        final double price;
        final double changePercent;
        final double previousClose;
        final String session;
        final ArrayList<Double> closes;

        Quote(String symbol, double price, double changePercent, double previousClose, String session, ArrayList<Double> closes) {
            this.symbol = symbol;
            this.price = price;
            this.changePercent = changePercent;
            this.previousClose = previousClose;
            this.session = session;
            this.closes = closes;
        }
    }

    private static final class LiveTick {
        final String symbol;
        final double price;
        final long timestamp;
        final double volume;

        LiveTick(String symbol, double price, long timestamp, double volume) {
            this.symbol = symbol;
            this.price = price;
            this.timestamp = timestamp;
            this.volume = volume;
        }
    }
}
