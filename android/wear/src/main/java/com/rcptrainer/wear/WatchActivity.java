package com.rcptrainer.wear;

import android.app.Activity;
import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.graphics.Typeface;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.media.AudioManager;
import android.media.ToneGenerator;
import android.os.BatteryManager;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.SystemClock;
import android.view.MotionEvent;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Date;
import java.util.Locale;
import java.text.SimpleDateFormat;

public class WatchActivity extends Activity implements SensorEventListener {
    private static final int BACKGROUND = 0xFF07111B;
    private static final int MINT = 0xFF63E4C2;
    private static final int MUTED = 0xFF91A7B8;
    private static final int AMBER = 0xFFF3BD6D;
    private static final int PRESS_COLOR = 0xFFFF8A3D;
    private static final int PRACTICE_MIN_CADENCE = 100;
    private static final int PRACTICE_MAX_CADENCE = 120;
    private static final int TARGET_CADENCE = 110;
    private static final long MIN_MOVEMENT_INTERVAL_MS = 300;
    private static final String[] PROFILES = {"ADULTO", "NIÑO", "PERSONA MAYOR"};

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final ArrayList<Long> movementTimes = new ArrayList<>();
    private final ArrayList<Long> pauseDurations = new ArrayList<>();
    private final Detector detector = new Detector();
    private final Runnable beat = new Runnable() {
        @Override public void run() {
            if (!active) return;
            view.flashBeat();
            pulseCount++;
            vibrateFor(55);
            if (soundOn && tone != null) tone.startTone(ToneGenerator.TONE_PROP_BEEP, 70);
            handler.postDelayed(this, Math.round(60_000f / TARGET_CADENCE));
        }
    };
    private final Runnable pauseCheck = new Runnable() {
        @Override public void run() {
            if (!active) return;
            if (lastMovement > 0
                    && SystemClock.elapsedRealtime() - lastMovement >= 2500) {
                boolean wasDetected = pauseDetected;
                pauseDetected = true;
                latestCadence = 0;
                rhythm = "SIN MOVIMIENTO";
                if (!wasDetected) vibrateFor(80);
                view.invalidate();
            }
            handler.postDelayed(this, 300);
        }
    };
    private final Runnable updateClock = new Runnable() {
        @Override public void run() {
            if (page == WatchView.FACE && view != null) view.invalidate();
            handler.postDelayed(this, 30_000);
        }
    };

    private WatchView view;
    private ToneGenerator tone;
    private Vibrator vibrator;
    private SensorManager sensorManager;
    private Sensor accelerometer;
    private Sensor linearAcceleration;
    private Sensor gyroscope;
    private Sensor movementSensor;
    private int page = WatchView.FACE;
    private int profileIndex;
    private int pulseCount;
    private boolean soundOn = true;
    private boolean hapticsAvailable;
    private boolean active;
    private boolean pauseDetected;
    private boolean awaitingFirstMovement = true;
    private long sessionStarted;
    private long lastMovement;
    private long pausedAt;
    private long totalPaused;
    private double averageCadence;
    private double latestCadence;
    private String rhythm = "ESPERANDO";
    private String sensorMessage = "Sensores del reloj";

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        Window window = getWindow();
        window.setStatusBarColor(BACKGROUND);
        window.setNavigationBarColor(BACKGROUND);
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        tone = new ToneGenerator(AudioManager.STREAM_MUSIC, 35);
        vibrator = (Vibrator) getSystemService(VIBRATOR_SERVICE);
        hapticsAvailable = vibrator != null && vibrator.hasVibrator();
        sensorManager = (SensorManager) getSystemService(SENSOR_SERVICE);
        accelerometer = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER);
        linearAcceleration = sensorManager.getDefaultSensor(Sensor.TYPE_LINEAR_ACCELERATION);
        gyroscope = sensorManager.getDefaultSensor(Sensor.TYPE_GYROSCOPE);
        movementSensor = accelerometer != null ? accelerometer : linearAcceleration;
        sensorMessage = movementSensor != null && gyroscope != null
                ? "ACELERÓMETRO + GIROSCOPIO LISTOS"
                : "SENSORES NO DISPONIBLES";
        view = new WatchView(this);
        view.setOnTouchListener(this::handleTouch);
        setContentView(view);
        view.setFocusable(true);
        view.setContentDescription("RCP Trainer para reloj. Toca la pantalla para continuar.");
        handler.postDelayed(updateClock, 30_000);
    }

    @Override protected void onPause() {
        if (active) pauseSession();
        super.onPause();
    }

    private boolean handleTouch(View source, MotionEvent event) {
        if (event.getAction() != MotionEvent.ACTION_UP) return true;
        float density = getResources().getDisplayMetrics().density;
        float width = source.getWidth() / density;
        float height = source.getHeight() / density;
        float x = event.getX() / density;
        float y = event.getY() / density;
        float centerX = width / 2f;
        if (Math.abs(x - centerX) > width * .44f || y < height * .08f || y > height * .92f) return true;

        if (page == WatchView.FACE) {
            page = WatchView.INTRO;
        } else if (page == WatchView.INTRO) {
            page = WatchView.SETUP;
        } else if (page == WatchView.SETUP) {
            float centerY = height / 2f;
            if (y < centerY - 20) {
                profileIndex = (profileIndex + 1) % PROFILES.length;
            } else if (y < centerY + 65) {
                soundOn = !soundOn;
            } else {
                startSession();
            }
        } else if (page == WatchView.ACTIVE) {
            if (y > height * .78f) pauseSession();
        } else if (page == WatchView.PAUSED) {
            if (y > height * .76f) finishSession();
            else resumeSession();
        } else if (page == WatchView.SUMMARY) {
            page = WatchView.SETUP;
        }
        view.invalidate();
        return true;
    }

    private void startSession() {
        if (movementSensor == null || gyroscope == null) {
            sensorMessage = "Se requieren acelerómetro y giroscopio.";
            view.invalidate();
            vibrateFor(80);
            return;
        }
        page = WatchView.ACTIVE;
        active = true;
        pulseCount = 0;
        movementTimes.clear();
        pauseDurations.clear();
        totalPaused = 0;
        pauseDetected = false;
        averageCadence = 0;
        latestCadence = 0;
        awaitingFirstMovement = true;
        rhythm = "ESPERANDO MOVIMIENTO";
        detector.reset();
        sessionStarted = SystemClock.elapsedRealtime();
        lastMovement = sessionStarted;
        sensorManager.registerListener(this, movementSensor, SensorManager.SENSOR_DELAY_GAME);
        sensorManager.registerListener(this, gyroscope, SensorManager.SENSOR_DELAY_GAME);
        handler.removeCallbacks(beat);
        handler.removeCallbacks(pauseCheck);
        handler.post(beat);
        handler.post(pauseCheck);
    }

    private void recordMovement(long timestamp) {
        boolean firstMovement = awaitingFirstMovement || lastMovement == 0;
        long interval = firstMovement ? 0 : timestamp - lastMovement;
        if (!firstMovement && interval < MIN_MOVEMENT_INTERVAL_MS) return;
        awaitingFirstMovement = false;
        long elapsedSinceMovement = lastMovement > 0 ? timestamp - lastMovement : 0;
        if (elapsedSinceMovement >= 2500) {
            pauseDurations.add(Math.max(0, elapsedSinceMovement - 2500));
        }
        pauseDetected = false;
        movementTimes.add(timestamp);
        if (!firstMovement && interval < 2500 && interval > 0) {
            latestCadence = recentCadence();
            double sum = 0;
            int count = 0;
            for (int i = 1; i < movementTimes.size(); i++) {
                long delta = movementTimes.get(i) - movementTimes.get(i - 1);
                if (delta >= MIN_MOVEMENT_INTERVAL_MS && delta < 2500) {
                    sum += 60_000.0 / delta;
                    count++;
                }
            }
            averageCadence = count == 0 ? latestCadence : sum / count;
            rhythm = rhythmForRecentMovements();
            if (latestCadence < PRACTICE_MIN_CADENCE || latestCadence > PRACTICE_MAX_CADENCE) vibrateFor(80);
        } else {
            latestCadence = 0;
            rhythm = "ESPERANDO INTERVALO";
        }
        lastMovement = timestamp;
        view.flashCompression();
        view.invalidate();
    }

    private double recentCadence() {
        double[] recentCadences = new double[3];
        int count = 0;
        for (int i = movementTimes.size() - 1; i > 0 && count < recentCadences.length; i--) {
            long interval = movementTimes.get(i) - movementTimes.get(i - 1);
            if (interval >= 2500) break;
            if (interval >= MIN_MOVEMENT_INTERVAL_MS) {
                recentCadences[count++] = 60_000.0 / interval;
            }
        }
        if (count == 0) return 0;
        Arrays.sort(recentCadences, 0, count);
        if (count % 2 == 1) return recentCadences[count / 2];
        return (recentCadences[count / 2 - 1] + recentCadences[count / 2]) / 2;
    }

    @Override public void onSensorChanged(SensorEvent event) {
        if (active && detector.accept(event)) recordMovement(event.timestamp / 1_000_000L);
    }

    @Override public void onAccuracyChanged(Sensor sensor, int accuracy) {
        if (accuracy == SensorManager.SENSOR_STATUS_UNRELIABLE) {
            sensorMessage = "SEÑAL DE SENSOR INESTABLE";
            if (view != null) view.invalidate();
        }
    }

    private String rhythmForRecentMovements() {
        if (movementTimes.size() < 4) return "RITMO OBSERVADO";
        double[] cadences = new double[Math.min(4, movementTimes.size() - 1)];
        int count = 0;
        for (int i = movementTimes.size() - cadences.length; i < movementTimes.size(); i++) {
            long delta = movementTimes.get(i) - movementTimes.get(i - 1);
            if (delta > 0 && delta < 2500) cadences[count++] = 60_000.0 / delta;
        }
        if (count < 2) return "RITMO OBSERVADO";
        double mean = 0;
        for (int i = 0; i < count; i++) mean += cadences[i];
        mean /= count;
        double variance = 0;
        for (int i = 0; i < count; i++) variance += Math.pow(cadences[i] - mean, 2);
        return Math.sqrt(variance / count) / Math.max(1, mean) > .2 ? "RITMO VARIABLE" : "RITMO REGULAR";
    }

    private void pauseSession() {
        if (!active) return;
        active = false;
        pausedAt = SystemClock.elapsedRealtime();
        sensorManager.unregisterListener(this);
        page = WatchView.PAUSED;
        handler.removeCallbacks(beat);
        handler.removeCallbacks(pauseCheck);
        view.invalidate();
    }

    private void resumeSession() {
        if (active) return;
        long now = SystemClock.elapsedRealtime();
        if (pausedAt > 0) {
            totalPaused += now - pausedAt;
            pausedAt = 0;
        }
        lastMovement = now;
        awaitingFirstMovement = true;
        latestCadence = 0;
        pauseDetected = false;
        active = true;
        page = WatchView.ACTIVE;
        detector.reset();
        sensorManager.registerListener(this, movementSensor, SensorManager.SENSOR_DELAY_GAME);
        sensorManager.registerListener(this, gyroscope, SensorManager.SENSOR_DELAY_GAME);
        handler.post(beat);
        handler.post(pauseCheck);
        view.invalidate();
    }

    private void finishSession() {
        if (active) {
            handler.removeCallbacks(beat);
            handler.removeCallbacks(pauseCheck);
        } else if (pausedAt > 0) {
            long duration = SystemClock.elapsedRealtime() - pausedAt;
            totalPaused += duration;
            pausedAt = 0;
        }
        sensorManager.unregisterListener(this);
        if (pauseDetected && lastMovement > 0) {
            pauseDurations.add(Math.max(0, SystemClock.elapsedRealtime() - lastMovement - 2500));
            pauseDetected = false;
        }
        active = false;
        page = WatchView.SUMMARY;
        view.invalidate();
    }

    private void vibrateFor(long durationMs) {
        if (!hapticsAvailable) return;
        vibrator.vibrate(VibrationEffect.createOneShot(durationMs, VibrationEffect.DEFAULT_AMPLITUDE));
    }

    private long elapsedSeconds() {
        return Math.max(0, (SystemClock.elapsedRealtime() - sessionStarted - totalPaused) / 1000);
    }

    private static String duration(long seconds) {
        return String.format(Locale.getDefault(), "%02d:%02d", seconds / 60, seconds % 60);
    }

    private String paceStatus() {
        if (latestCadence <= 0) return "ESPERANDO MOVIMIENTO";
        if (latestCadence < PRACTICE_MIN_CADENCE) return "FUERA DE RITMO · LENTO";
        if (latestCadence > PRACTICE_MAX_CADENCE) return "FUERA DE RITMO · RÁPIDO";
        return "DENTRO DEL RITMO";
    }

    @Override protected void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        if (sensorManager != null) sensorManager.unregisterListener(this);
        if (tone != null) tone.release();
        super.onDestroy();
    }

    private static final class Detector {
        private final double[] gravity = new double[3];
        private double accelerationSmooth;
        private double gyroscopeSmooth;
        private boolean accelerationArmed = true;
        private boolean gyroscopeArmed = true;
        private boolean gravityReady;
        private long lastRecognized;

        boolean accept(SensorEvent event) {
            if (event.sensor.getType() == Sensor.TYPE_ACCELEROMETER) {
                float[] values = event.values;
                if (!gravityReady) {
                    for (int i = 0; i < gravity.length; i++) gravity[i] = values[i];
                    gravityReady = true;
                    return false;
                }
                double alpha = .88;
                for (int i = 0; i < 3; i++) gravity[i] = alpha * gravity[i] + (1 - alpha) * values[i];
                double dx = values[0] - gravity[0];
                double dy = values[1] - gravity[1];
                double dz = values[2] - gravity[2];
                accelerationSmooth = smooth(accelerationSmooth, Math.sqrt(dx * dx + dy * dy + dz * dz));
                return detectEdge(accelerationSmooth, .22, .09, event.timestamp, true);
            } else if (event.sensor.getType() == Sensor.TYPE_LINEAR_ACCELERATION) {
                accelerationSmooth = smooth(accelerationSmooth, magnitude(event.values));
                return detectEdge(accelerationSmooth, .22, .09, event.timestamp, true);
            } else if (event.sensor.getType() == Sensor.TYPE_GYROSCOPE) {
                gyroscopeSmooth = smooth(gyroscopeSmooth, magnitude(event.values));
                return detectEdge(gyroscopeSmooth, .18, .07, event.timestamp, false);
            } else {
                return false;
            }
        }

        private boolean detectEdge(double value, double threshold, double releaseThreshold,
                                   long timestamp, boolean accelerationChannel) {
            boolean isArmed = accelerationChannel ? accelerationArmed : gyroscopeArmed;
            if (!isArmed) {
                if (value <= releaseThreshold) {
                    if (accelerationChannel) accelerationArmed = true;
                    else gyroscopeArmed = true;
                }
                return false;
            }
            if (value < threshold) return false;
            if (accelerationChannel) accelerationArmed = false;
            else gyroscopeArmed = false;
            if (timestamp - lastRecognized < MIN_MOVEMENT_INTERVAL_MS * 1_000_000L) return false;
            lastRecognized = timestamp;
            return true;
        }

        private static double magnitude(float[] values) {
            return Math.sqrt(values[0] * values[0] + values[1] * values[1] + values[2] * values[2]);
        }

        private static double smooth(double previous, double value) {
            return previous == 0 ? value : previous + .5 * (value - previous);
        }

        void reset() {
            accelerationSmooth = 0;
            gyroscopeSmooth = 0;
            accelerationArmed = true;
            gyroscopeArmed = true;
            gravityReady = false;
            lastRecognized = 0;
        }
    }

    private final class WatchView extends View {
        static final int FACE = 0;
        static final int INTRO = 1;
        static final int SETUP = 2;
        static final int ACTIVE = 3;
        static final int PAUSED = 4;
        static final int SUMMARY = 5;
        private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Path circle = new Path();
        private float density;
        private float cx;
        private float cy;
        private float radius;
        private float beatScale;
        private float compressionScale;

        WatchView(Context context) {
            super(context);
            density = getResources().getDisplayMetrics().density;
            setLayerType(View.LAYER_TYPE_SOFTWARE, null);
        }

        void flashBeat() {
            beatScale = 1;
            invalidate();
            postDelayed(() -> { beatScale = 0; invalidate(); }, 400);
        }

        void flashCompression() {
            compressionScale = 1;
            invalidate();
            postDelayed(() -> { compressionScale = 0; invalidate(); }, 240);
        }

        private float d(float value) { return value * density; }

        private void centered(Canvas canvas, String text, float y, float size, int color, boolean bold) {
            paint.setColor(color);
            paint.setTextSize(d(size));
            paint.setTextAlign(Paint.Align.CENTER);
            paint.setTypeface(bold ? Typeface.create("sans-serif", Typeface.BOLD) : Typeface.create("sans-serif", Typeface.NORMAL));
            canvas.drawText(text, cx, y, paint);
        }

        private void at(Canvas canvas, String text, float x, float y, float size, int color, boolean bold) {
            paint.setColor(color);
            paint.setTextSize(d(size));
            paint.setTextAlign(Paint.Align.CENTER);
            paint.setTypeface(bold ? Typeface.create("sans-serif", Typeface.BOLD) : Typeface.create("sans-serif", Typeface.NORMAL));
            canvas.drawText(text, x, y, paint);
        }

        private void left(Canvas canvas, String text, float x, float y, float size, int color, boolean bold) {
            paint.setColor(color);
            paint.setTextSize(d(size));
            paint.setTextAlign(Paint.Align.LEFT);
            paint.setTypeface(bold ? Typeface.create("sans-serif", Typeface.BOLD) : Typeface.create("sans-serif", Typeface.NORMAL));
            canvas.drawText(text, x, y, paint);
        }

        private void pill(Canvas canvas, String label, float y, int color) {
            paint.setColor(0xFF142537);
            canvas.drawRoundRect(new RectF(cx - d(67), y - d(17), cx + d(67), y + d(17)), d(17), d(17), paint);
            centered(canvas, label, y + d(4), 9, color, true);
        }

        @Override protected void onDraw(Canvas canvas) {
            super.onDraw(canvas);
            cx = getWidth() / 2f;
            cy = getHeight() / 2f;
            radius = Math.min(getWidth(), getHeight()) / 2f;
            canvas.drawColor(BACKGROUND);
            circle.reset();
            circle.addCircle(cx, cy, radius, Path.Direction.CW);
            canvas.save();
            canvas.clipPath(circle);
            if (page == FACE) drawFace(canvas);
            else if (page == INTRO) drawIntro(canvas);
            else if (page == SETUP) drawSetup(canvas);
            else if (page == ACTIVE) drawSession(canvas, false);
            else if (page == PAUSED) drawSession(canvas, true);
            else drawSummary(canvas);
            canvas.restore();
        }

        private void drawFace(Canvas canvas) {
            BatteryManager batteryManager = (BatteryManager) getSystemService(BATTERY_SERVICE);
            int batteryPct = batteryManager == null ? -1
                    : batteryManager.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY);
            String time = new SimpleDateFormat("HH:mm", Locale.getDefault()).format(new Date());
            String date = new SimpleDateFormat("EEE d MMM", new Locale("es")).format(new Date()).toUpperCase(Locale.getDefault());
            centered(canvas, "● " + (batteryPct < 0 ? "BATERÍA —" : batteryPct + "%") + "    ENLACE", cy - d(39), 8, MINT, true);
            centered(canvas, time, cy + d(8), 33, 0xFFEAF2F8, true);
            centered(canvas, date + " · LOCAL", cy + d(29), 7, MUTED, false);
            paint.setColor(0xFF163D3C);
            canvas.drawCircle(cx, cy + d(62), d(19), paint);
            centered(canvas, "♥", cy + d(68), 19, MINT, true);
            centered(canvas, "TOCA PARA ABRIR", cy + d(97), 8, MUTED, true);
        }

        private void drawIntro(Canvas canvas) {
            centered(canvas, "RCP TRAINER", cy - d(43), 11, MINT, true);
            centered(canvas, "Práctica", cy - d(13), 24, 0xFFEAF2F8, true);
            centered(canvas, "guiada", cy + d(14), 24, 0xFFEAF2F8, true);
            centered(canvas, "Cada pulso = una presión", cy + d(39), 8, MUTED, true);
            centered(canvas, "Guía orientativa · solo ritmo", cy + d(53), 6, MUTED, false);
            pill(canvas, "TOCA PARA CONTINUAR", cy + d(78), MINT);
        }

        private void drawSetup(Canvas canvas) {
            centered(canvas, "GUÍA DE RITMO", cy - d(69), 10, MINT, true);
            centered(canvas, sensorMessage, cy - d(52), 5, sensorMessage.contains("LISTOS") ? MINT : AMBER, true);
            pill(canvas, "PERFIL · " + PROFILES[profileIndex], cy - d(39), MINT);
            centered(canvas, "TOCA PERFIL · GUÍA FIJA 100–120/MIN", cy - d(17), 6, MUTED, false);
            centered(canvas, String.valueOf(TARGET_CADENCE), cy + d(15), 30, 0xFFEAF2F8, true);
            centered(canvas, "PULSOS/MIN · OBJETIVO FIJO", cy + d(32), 6, MUTED, true);
            paint.setColor(0xFF142537);
            canvas.drawRoundRect(new RectF(cx - d(67), cy + d(37), cx + d(67), cy + d(59)), d(11), d(11), paint);
            centered(canvas, (soundOn ? "♪ TONO ON" : "♪ TONO OFF") + (hapticsAvailable ? " · VIBRA ON" : " · SIN VIBRA"), cy + d(51), 7, soundOn ? MINT : MUTED, true);
            pill(canvas, "INICIAR CON PULSOS", cy + d(78), MINT);
        }

        private void drawSession(Canvas canvas, boolean paused) {
            boolean warning = pauseDetected || paceStatus().contains("FUERA");
            boolean movementFlash = compressionScale > 0;
            boolean pulseFlash = beatScale > 0 && !movementFlash;
            centered(canvas, paused ? "SESIÓN EN PAUSA" : "● SESIÓN ACTIVA", cy - d(75), 9, paused ? AMBER : MINT, true);
            if (!paused && (movementFlash || pulseFlash)) {
                if (movementFlash) {
                    paint.setColor(PRESS_COLOR);
                    canvas.drawCircle(cx, cy - d(31), d(27), paint);
                } else {
                    paint.setColor(MINT);
                    paint.setStyle(Paint.Style.STROKE);
                    paint.setStrokeWidth(d(3));
                    canvas.drawCircle(cx, cy - d(31), d(25), paint);
                    paint.setStyle(Paint.Style.FILL);
                }
            }
            centered(canvas, latestCadence > 0
                            ? String.format(Locale.getDefault(), "%.0f", latestCadence) : "—",
                    cy - d(19), 28,
                    movementFlash ? BACKGROUND : pulseFlash ? MINT : 0xFFEAF2F8, true);
            centered(canvas, "MOVIMIENTOS/MIN · MUÑECA", cy + d(3), 7, MUTED, true);
            String prompt = paused ? "PAUSA MANUAL"
                    : movementFlash ? "MOVIMIENTO DETECTADO"
                    : pulseFlash ? "PRESIONA AHORA"
                    : pauseDetected ? "SIN MOVIMIENTO"
                    : "ESPERA EL SIGUIENTE PULSO";
            int promptColor = movementFlash ? PRESS_COLOR
                    : pulseFlash ? MINT : paused ? AMBER : 0xFFEAF2F8;
            centered(canvas, prompt, cy + d(23), 8, promptColor, true);
            String status = paused ? "PAUSA MANUAL"
                    : pauseDetected ? "FUERA DE RITMO"
                    : paceStatus();
            int statusColor = paused || pauseDetected || warning ? AMBER : MINT;
            centered(canvas, status, cy + d(42), 7, statusColor, true);
            if (!paused) {
                centered(canvas, PROFILES[profileIndex] + " · GUÍA " + PRACTICE_MIN_CADENCE + "–" + PRACTICE_MAX_CADENCE + "/MIN", cy + d(57), 7, MUTED, false);
                pill(canvas, "Ⅱ  PAUSAR", cy + d(77), AMBER);
            } else {
                pill(canvas, "TOCA PARA CONTINUAR", cy + d(53), MINT);
                pill(canvas, "TERMINAR PRÁCTICA", cy + d(87), AMBER);
            }
        }

        private void drawSummary(Canvas canvas) {
            centered(canvas, "PRÁCTICA", cy - d(77), 9, MINT, true);
            centered(canvas, "Resumen", cy - d(48), 22, 0xFFEAF2F8, true);
            centered(canvas, "Duración " + duration(elapsedSeconds()), cy - d(22), 10, MUTED, false);
            centered(canvas, movementTimes.size() + " movimientos", cy - d(2), 11, 0xFFEAF2F8, true);
            centered(canvas, averageCadence > 0 ? String.format(Locale.getDefault(), "%.0f mov/min promedio", averageCadence) : "Sin cadencia suficiente", cy + d(17), 9, MUTED, false);
            long detectedPauseMs = 0;
            for (long pauseMs : pauseDurations) detectedPauseMs += pauseMs;
            centered(canvas, String.format(Locale.getDefault(), "Pausas: %d · %s", pauseDurations.size(), duration(detectedPauseMs / 1000)), cy + d(32), 8, MUTED, false);
            centered(canvas, "SIMULACIÓN EDUCATIVA", cy + d(44), 6, AMBER, true);
            centered(canvas, "NO CERTIFICA LA CALIDAD DE RCP", cy + d(52), 6, AMBER, true);
            pill(canvas, "TOCA PARA REPETIR", cy + d(78), MINT);
        }
    }
}
