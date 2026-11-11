package com.rcptrainer.app;

import android.app.Activity;
import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.media.AudioManager;
import android.media.ToneGenerator;
import android.os.Bundle;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import java.util.ArrayList;
import java.util.Locale;

public class MainActivity extends Activity {
    private static final int BG = 0xFF09111F;
    private static final int PANEL = 0xFF142237;
    private static final int MINT = 0xFF63E4C2;
    private static final int MUTED = 0xFF9AAFC1;
    private static final int AMBER = 0xFFF3BD6D;
    private static final long PAUSE_MS = 2500;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final ArrayList<Motion> motions = new ArrayList<>();
    private final ArrayList<Long> pauses = new ArrayList<>();
    private final SensorEngine sensorEngine = new SensorEngine();
    private String page = "welcome";
    private boolean active;
    private boolean soundEnabled = true;
    private int cadenceTarget;
    private int pulseNumber;
    private long pauseOpenAt;
    private long sessionStarted;
    private long lastMotionAt;
    private long pauseStarted;
    private long totalPaused;
    private double averageCadence;
    private String rhythm = "Esperando datos";
    private ToneGenerator toneGenerator;
    private TextView watchStatus;
    private TextView watchCadence;
    private TextView practiceStatus;
    private TextView metrics;
    private TextView timeline;
    private TextView pulseText;
    private MannequinView mannequin;
    private Button sessionToggle;
    private TextView permissionStatus;
    private LinearLayout content;
    private int sampleCounter;
    private final Runnable clock = new Runnable() {
        @Override public void run() {
            if (!active) return;
            long now = System.currentTimeMillis();
            if (lastMotionAt > 0 && now - lastMotionAt >= PAUSE_MS && pauseOpenAt == 0) {
                pauseOpenAt = lastMotionAt + PAUSE_MS;
                rhythm = "Pausa detectada";
                pulseTextIfPresent();
                refreshPractice();
            }
            handler.postDelayed(this, 200);
        }
    };
    private final Runnable pulse = new Runnable() {
        @Override public void run() {
            if (!active || cadenceTarget <= 0) return;
            pulseNumber++;
            if (soundEnabled && toneGenerator != null) toneGenerator.startTone(ToneGenerator.TONE_PROP_BEEP, 65);
            refreshWatch();
            refreshPractice();
            handler.postDelayed(this, Math.round(60_000f / cadenceTarget));
        }
    };

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        Window window = getWindow();
        window.setStatusBarColor(BG);
        window.setNavigationBarColor(BG);
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        toneGenerator = new ToneGenerator(AudioManager.STREAM_MUSIC, 35);
        showWelcome();
    }

    private int dp(float value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private TextView text(String value, float size, int color, boolean bold) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextSize(size);
        view.setTextColor(color);
        if (bold) view.setTypeface(android.graphics.Typeface.DEFAULT, android.graphics.Typeface.BOLD);
        return view;
    }

    private LinearLayout column() {
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setPadding(dp(20), dp(18), dp(20), dp(24));
        layout.setBackgroundColor(BG);
        return layout;
    }

    private void addGap(LinearLayout parent, int height) {
        View gap = new View(this);
        parent.addView(gap, new LinearLayout.LayoutParams(1, dp(height)));
    }

    private void addText(LinearLayout parent, String value, float size, int color, boolean bold, int top) {
        TextView view = text(value, size, color, bold);
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, -2);
        params.topMargin = dp(top);
        parent.addView(view, params);
    }

    private Button button(String label, Runnable action) {
        Button button = new Button(this);
        button.setText(label);
        button.setTextColor(0xFF08221D);
        button.setTextSize(14);
        button.setAllCaps(false);
        button.setBackgroundTintList(android.content.res.ColorStateList.valueOf(MINT));
        button.setOnClickListener(v -> action.run());
        return button;
    }

    private Button secondaryButton(String label, Runnable action) {
        Button button = button(label, action);
        button.setTextColor(0xFFE2EDF4);
        button.setBackgroundTintList(android.content.res.ColorStateList.valueOf(PANEL));
        return button;
    }

    private void addButton(LinearLayout parent, String label, Runnable action, boolean secondary) {
        Button button = secondary ? secondaryButton(label, action) : button(label, action);
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, dp(50));
        params.topMargin = dp(10);
        parent.addView(button, params);
    }

    private void showWelcome() {
        page = "welcome";
        content = column();
        addText(content, "RCP TRAINER  ·  PRÁCTICA EDUCATIVA", 11, MINT, true, 16);
        addText(content, "Practica el ritmo.\nExplora el movimiento.", 31, 0xFFEAF2F8, true, 24);
        addText(content, "Un simulador local para marcar movimientos en un maniquí virtual y seguir un pulso en pantalla.", 16, MUTED, false, 16);
        WatchView watch = new WatchView(this);
        LinearLayout.LayoutParams watchParams = new LinearLayout.LayoutParams(dp(210), dp(240));
        watchParams.gravity = Gravity.CENTER_HORIZONTAL;
        watchParams.topMargin = dp(18);
        content.addView(watch, watchParams);
        addButton(content, "Encender reloj y comenzar", this::showSetup, false);
        addText(content, "Sin Bluetooth, conexión ni un reloj real.", 12, MUTED, false, 12);
        addSafety(content);
        setContentView(scroll(content));
    }

    private void showSetup() {
        page = "setup";
        content = column();
        addText(content, "PREPARACIÓN", 11, MINT, true, 6);
        addText(content, "Configura la práctica", 27, 0xFFEAF2F8, true, 12);
        addText(content, "Permisos solo simulados: no se leen sensores del teléfono.", 13, MUTED, false, 8);
        addText(content, "Meta de ritmo del instructor", 17, 0xFFEAF2F8, true, 25);
        addText(content, "Usa el valor indicado por el material del curso o el instructor. Déjalo vacío para observar sin pulsos ni valoración de técnica.", 13, MUTED, false, 8);
        EditText cadenceInput = new EditText(this);
        cadenceInput.setSingleLine(true);
        cadenceInput.setInputType(android.text.InputType.TYPE_CLASS_NUMBER);
        cadenceInput.setText(cadenceTarget > 0 ? String.valueOf(cadenceTarget) : "");
        cadenceInput.setTextColor(0xFFEAF2F8);
        cadenceInput.setHint("Cadencia en movimientos por minuto");
        cadenceInput.setHintTextColor(MUTED);
        cadenceInput.setPadding(dp(12), dp(6), dp(12), dp(6));
        cadenceInput.setBackgroundTintList(android.content.res.ColorStateList.valueOf(0xFF385168));
        LinearLayout.LayoutParams inputParams = new LinearLayout.LayoutParams(-1, dp(54));
        inputParams.topMargin = dp(14);
        content.addView(cadenceInput, inputParams);
        CheckBox sound = new CheckBox(this);
        sound.setText("Tono sonoro en cada pulso");
        sound.setTextColor(0xFFEAF2F8);
        sound.setButtonTintList(android.content.res.ColorStateList.valueOf(MINT));
        sound.setChecked(soundEnabled);
        content.addView(sound);
        addText(content, "En la práctica, sigue el pulso visual o sonoro y marca un movimiento por señal. Esto solo guía el ritmo; no evalúa la técnica.", 12, MUTED, false, 8);
        permissionStatus = text("Permisos pendientes de simulación", 12, MUTED, false);
        content.addView(permissionStatus);
        addButton(content, "Conceder permisos simulados", () ->
                permissionStatus.setText("✓ Acelerómetro y giroscopio simulados listos"), true);
        addButton(content, "Continuar al reloj", () -> {
            String value = cadenceInput.getText().toString().trim();
            if (!value.isEmpty()) {
                try {
                    int parsed = Integer.parseInt(value);
                    if (parsed < 1 || parsed > 300) {
                        cadenceInput.setError("Usa un valor entre 1 y 300.");
                        return;
                    }
                    cadenceTarget = parsed;
                } catch (NumberFormatException exception) {
                    cadenceInput.setError("Introduce un número válido.");
                    return;
                }
            } else {
                cadenceTarget = 0;
            }
            soundEnabled = sound.isChecked();
            showWatch();
        }, false);
        addSafety(content);
        setContentView(scroll(content));
    }

    private void showWatch() {
        page = "watch";
        content = column();
        addText(content, "DISPOSITIVO VIRTUAL", 11, MINT, true, 6);
        addText(content, "Abre RCP Trainer en el reloj", 24, 0xFFEAF2F8, true, 12);
        WatchView watch = new WatchView(this);
        LinearLayout.LayoutParams watchParams = new LinearLayout.LayoutParams(dp(225), dp(255));
        watchParams.gravity = Gravity.CENTER_HORIZONTAL;
        watchParams.topMargin = dp(10);
        content.addView(watch, watchParams);
        addText(content, "Conexión simulada · batería 86%", 12, MUTED, false, 4);
        addButton(content, "Abrir menú de aplicaciones", () -> addButton(content, "♥  RCP Trainer", this::startSession, false), true);
        addSafety(content);
        setContentView(scroll(content));
    }

    private void startSession() {
        page = "practice";
        active = true;
        motions.clear();
        pauses.clear();
        pulseNumber = 0;
        sampleCounter = 0;
        pauseOpenAt = 0;
        totalPaused = 0;
        averageCadence = 0;
        rhythm = "Esperando datos";
        sensorEngine.reset();
        sessionStarted = System.currentTimeMillis();
        lastMotionAt = sessionStarted;
        refreshPracticeScreen();
        handler.removeCallbacks(pulse);
        if (cadenceTarget > 0) handler.post(pulse);
        handler.removeCallbacks(clock);
        handler.post(clock);
    }

    private void pauseSession() {
        if (!active) return;
        active = false;
        pauseStarted = System.currentTimeMillis();
        handler.removeCallbacks(pulse);
        handler.removeCallbacks(clock);
        rhythm = "Sesión en pausa";
        refreshPractice();
    }

    private void resumeSession() {
        if (active) return;
        active = true;
        long now = System.currentTimeMillis();
        if (pauseStarted > 0) {
            totalPaused += now - pauseStarted;
            pauses.add(now - pauseStarted);
            pauseStarted = 0;
        }
        lastMotionAt = now;
        rhythm = "Esperando datos";
        if (cadenceTarget > 0) handler.post(pulse);
        handler.post(clock);
        refreshPractice();
    }

    private void finishSession() {
        active = false;
        handler.removeCallbacks(pulse);
        handler.removeCallbacks(clock);
        if (pauseOpenAt > 0) {
            pauses.add(Math.max(0, System.currentTimeMillis() - pauseOpenAt));
            pauseOpenAt = 0;
        }
        if (pauseStarted > 0) {
            long pausedDuration = System.currentTimeMillis() - pauseStarted;
            pauses.add(pausedDuration);
            totalPaused += pausedDuration;
            pauseStarted = 0;
        }
        showSummary();
    }

    private void markMovement() {
        if (!active) return;
        mannequin.flash();
        boolean found = false;
        long timestamp = System.currentTimeMillis();
        for (int i = 0; i < 13; i++) {
            double progress = i / 12.0;
            double lift = Math.sin(Math.PI * progress) * (0.46 + Math.sin((sampleCounter + 1) * 2.17) * 0.035);
            double wobble = Math.sin((sampleCounter + i) * 1.73) * 0.012;
            SensorReading reading = new SensorReading(
                    timestamp + Math.round(progress * 312),
                    lift * 0.22 + wobble, lift * 0.12 - wobble, 1 + lift + wobble * 0.5,
                    0.18 * Math.sin(progress * Math.PI), (1.15 + wobble) * Math.sin(progress * Math.PI), 0.26 * Math.sin(progress * Math.PI));
            if (sensorEngine.accept(reading)) found = true;
        }
        sampleCounter++;
        if (found) {
            if (lastMotionAt > sessionStarted) {
                long interval = timestamp - lastMotionAt;
                if (interval >= PAUSE_MS) {
                    pauses.add(Math.max(0, interval - PAUSE_MS));
                    pauseOpenAt = 0;
                    rhythm = "Pausa detectada";
                    alertHaptic();
                }
                if (interval < PAUSE_MS && interval > 0) {
                    double cadence = 60_000.0 / interval;
                    motions.add(new Motion(timestamp, cadence));
                    double sum = 0;
                    int count = 0;
                    for (Motion motion : motions) {
                        if (motion.cadence > 0) {
                            sum += motion.cadence;
                            count++;
                        }
                    }
                    averageCadence = count > 0 ? sum / count : cadence;
                    rhythm = rhythmForLatest();
                    if (cadenceTarget > 0 && Math.abs(cadence - cadenceTarget) / cadenceTarget > .12) alertHaptic();
                } else {
                    motions.add(new Motion(timestamp, 0));
                }
            } else {
                motions.add(new Motion(timestamp, 0));
            }
            lastMotionAt = timestamp;
        }
        refreshPractice();
    }

    private String rhythmForLatest() {
        if (motions.size() < 3) return "Ritmo observado";
        int start = Math.max(1, motions.size() - 4);
        double mean = 0;
        int count = 0;
        for (int i = start; i < motions.size(); i++) {
            if (motions.get(i).cadence > 0) {
                mean += motions.get(i).cadence;
                count++;
            }
        }
        if (count < 2) return "Ritmo observado";
        mean /= count;
        double variance = 0;
        for (int i = start; i < motions.size(); i++) {
            if (motions.get(i).cadence > 0) variance += Math.pow(motions.get(i).cadence - mean, 2);
        }
        return Math.sqrt(variance / count) / Math.max(1, mean) > .2 ? "Ritmo variable" : "Ritmo regular";
    }

    private void alertHaptic() {
        try {
            Vibrator vibrator = (Vibrator) getSystemService(VIBRATOR_SERVICE);
            if (vibrator != null && vibrator.hasVibrator()) {
                if (Build.VERSION.SDK_INT >= 26) {
                    vibrator.vibrate(VibrationEffect.createOneShot(90, VibrationEffect.DEFAULT_AMPLITUDE));
                } else {
                    vibrator.vibrate(90);
                }
            }
        } catch (RuntimeException ignored) {
            // The visual alert remains available when the device has no vibrator.
        }
    }

    private void runExample(String pattern) {
        if (!active) return;
        long[] intervals = pattern.equals("regular")
                ? new long[]{545, 545, 545, 545, 545, 545, 545}
                : pattern.equals("variable")
                ? new long[]{450, 1200, 620, 1400, 520, 980, 1320}
                : new long[]{545, 545, 545, 3600, 545, 545};
        long elapsed = 200;
        for (int i = 0; i < intervals.length; i++) {
            if (i > 0) elapsed += intervals[i];
            handler.postDelayed(() -> {
                if (active) markMovement();
            }, elapsed);
        }
    }

    private void refreshPracticeScreen() {
        page = "practice";
        content = column();
        addText(content, "PRÁCTICA GUIADA", 11, MINT, true, 4);
        addText(content, "Sigue cada pulso", 26, 0xFFEAF2F8, true, 10);
        addText(content, cadenceTarget > 0
                ? "Guía " + cadenceTarget + "/min · marca un movimiento por señal"
                : "Metrónomo apagado · mediciones observadas", 13, MUTED, false, 6);
        pulseText = text("Pulso visual activo", 12, MINT, true);
        content.addView(pulseText);
        mannequin = new MannequinView(this, this::markMovement);
        LinearLayout.LayoutParams sceneParams = new LinearLayout.LayoutParams(-1, dp(225));
        sceneParams.topMargin = dp(13);
        content.addView(mannequin, sceneParams);
        addButton(content, "＋  Marcar movimiento", this::markMovement, false);
        addButton(content, "Secuencia de ejemplo: regular", () -> runExample("regular"), true);
        addButton(content, "Secuencia de ejemplo: variable", () -> runExample("variable"), true);
        addButton(content, "Secuencia de ejemplo: con pausa", () -> runExample("pause"), true);
        metrics = text("", 15, 0xFFEAF2F8, true);
        LinearLayout.LayoutParams metricParams = new LinearLayout.LayoutParams(-1, -2);
        metricParams.topMargin = dp(18);
        content.addView(metrics, metricParams);
        watchStatus = text("", 12, MINT, true);
        content.addView(watchStatus);
        watchCadence = text("", 13, MUTED, false);
        content.addView(watchCadence);
        timeline = text("", 12, MUTED, false);
        LinearLayout.LayoutParams timelineParams = new LinearLayout.LayoutParams(-1, -2);
        timelineParams.topMargin = dp(9);
        content.addView(timeline, timelineParams);
        sessionToggle = secondaryButton("Pausar práctica", this::pauseSession);
        LinearLayout.LayoutParams toggleParams = new LinearLayout.LayoutParams(-1, dp(50));
        toggleParams.topMargin = dp(10);
        content.addView(sessionToggle, toggleParams);
        addButton(content, "Terminar y ver resumen", this::finishSession, false);
        addSafety(content);
        setContentView(scroll(content));
        refreshPractice();
    }

    private void refreshPractice() {
        if (page.equals("practice")) {
            if (metrics != null) {
                long elapsed = (System.currentTimeMillis() - sessionStarted - totalPaused) / 1000;
                metrics.setText("Tiempo: " + formatTime(elapsed) + "     Movimientos: " + motions.size());
            }
            if (watchStatus != null) {
                watchStatus.setText(active ? rhythm : "Sesión en pausa");
                watchStatus.setTextColor(rhythm.equals("Pausa detectada") ? AMBER : MINT);
            }
            if (sessionToggle != null) {
                sessionToggle.setText(active ? "Pausar práctica" : "Continuar práctica");
                sessionToggle.setOnClickListener(v -> {
                    if (active) pauseSession();
                    else resumeSession();
                });
            }
            if (watchCadence != null) {
                watchCadence.setText(averageCadence > 0
                        ? String.format(Locale.getDefault(), "Cadencia observada: %.0f/min · guía: %s", averageCadence,
                        cadenceTarget > 0 ? cadenceTarget + "/min" : "apagada")
                        : "Cadencia observada: esperando movimientos");
            }
            if (timeline != null) {
                StringBuilder result = new StringBuilder("Línea de tiempo\n");
                int start = Math.max(0, motions.size() - 10);
                for (int i = start; i < motions.size(); i++) result.append("●  Movimiento reconocido\n");
                for (int i = 0; i < pauses.size(); i++) result.append("Ⅱ  Pausa detectada: ").append(formatTime(pauses.get(i) / 1000)).append('\n');
                timeline.setText(result.toString());
            }
        }
        refreshWatch();
    }

    private void refreshWatch() {
        if (page.equals("practice") && pulseText != null) {
            pulseText.setText("●  Pulso " + pulseNumber + (active ? " · marca ahora" : " · en pausa"));
        }
    }

    private void pulseTextIfPresent() {
        if (pulseText != null) pulseText.setText("Ⅱ  Pausa detectada · reinicia tu secuencia al marcar");
    }

    private void showSummary() {
        page = "summary";
        content = column();
        addText(content, "SESIÓN COMPLETADA", 11, MINT, true, 6);
        addText(content, "Resumen de práctica", 26, 0xFFEAF2F8, true, 12);
        long duration = Math.max(0, (System.currentTimeMillis() - sessionStarted - totalPaused) / 1000);
        addText(content, "Duración activa: " + formatTime(duration), 16, 0xFFEAF2F8, true, 20);
        addText(content, "Movimientos reconocidos: " + motions.size(), 15, MUTED, false, 12);
        addText(content, averageCadence > 0
                ? String.format(Locale.getDefault(), "Cadencia promedio observada: %.0f/min", averageCadence)
                : "Cadencia promedio observada: sin datos suficientes", 15, MUTED, false, 8);
        addText(content, "Pausas detectadas: " + pauses.size(), 15, MUTED, false, 8);
        long totalPauseMillis = 0;
        for (long pause : pauses) totalPauseMillis += pause;
        double totalPauseSeconds = totalPauseMillis / 1000.0;
        addText(content, String.format(Locale.getDefault(), "Duración acumulada de pausas: %.1f s", totalPauseSeconds), 15, MUTED, false, 8);
        addText(content, "Cadencia observada durante la sesión", 15, 0xFFEAF2F8, true, 23);
        content.addView(new CadenceChart(this, motions), new LinearLayout.LayoutParams(-1, dp(160)));
        addText(content, "Este resumen refleja movimientos simulados; no certifica ni evalúa calidad de RCP.", 13, AMBER, false, 18);
        addButton(content, "Repetir práctica", this::showSetup, false);
        addSafety(content);
        setContentView(scroll(content));
    }

    private void addSafety(LinearLayout parent) {
        addText(parent, "GUÍA EDUCATIVA DE RITMO PARA ADULTOS. No es un curso ni una herramienta médica. No evalúa profundidad, fuerza ni calidad. En una emergencia, llama al servicio local de emergencias y sigue sus instrucciones.", 11, AMBER, false, 22);
    }

    private ScrollView scroll(View child) {
        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setBackgroundColor(BG);
        scroll.addView(child);
        return scroll;
    }

    private String formatTime(long seconds) {
        return String.format(Locale.getDefault(), "%02d:%02d", seconds / 60, seconds % 60);
    }

    @Override protected void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        if (toneGenerator != null) toneGenerator.release();
        super.onDestroy();
    }

    private static final class Motion {
        final long timestamp;
        final double cadence;
        Motion(long timestamp, double cadence) { this.timestamp = timestamp; this.cadence = cadence; }
    }

    private static final class SensorReading {
        final long timestamp;
        final double ax, ay, az, gx, gy, gz;
        SensorReading(long timestamp, double ax, double ay, double az, double gx, double gy, double gz) {
            this.timestamp = timestamp;
            this.ax = ax;
            this.ay = ay;
            this.az = az;
            this.gx = gx;
            this.gy = gy;
            this.gz = gz;
        }
    }

    private static final class SensorEngine {
        private double filtered;
        private boolean armed = true;
        private long lastRecognized;

        boolean accept(SensorReading reading) {
            double acceleration = Math.sqrt(reading.ax * reading.ax + reading.ay * reading.ay + Math.pow(reading.az - 1, 2));
            double rotation = Math.sqrt(reading.gx * reading.gx + reading.gy * reading.gy + reading.gz * reading.gz);
            double signal = acceleration + rotation * .08;
            filtered = filtered == 0 ? signal : filtered + .42 * (signal - filtered);
            if (!armed && filtered < .075) armed = true;
            if (armed && filtered > .16 && reading.timestamp - lastRecognized > 350) {
                armed = false;
                lastRecognized = reading.timestamp;
                return true;
            }
            return false;
        }

        void reset() { filtered = 0; armed = true; lastRecognized = 0; }
    }

    private static final class WatchView extends View {
        private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        WatchView(Context context) { super(context); }

        @Override protected void onDraw(Canvas canvas) {
            super.onDraw(canvas);
            float scale = getResources().getDisplayMetrics().density;
            float cx = getWidth() / 2f, cy = getHeight() / 2f;
            paint.setColor(0xFF263A50);
            canvas.drawRoundRect(cx - 50 * scale, cy - 115 * scale, cx + 50 * scale, cy + 115 * scale, 24 * scale, 24 * scale, paint);
            paint.setColor(0xFF64778B);
            canvas.drawRoundRect(cx - 78 * scale, cy - 70 * scale, cx + 78 * scale, cy + 70 * scale, 32 * scale, 32 * scale, paint);
            paint.setColor(0xFF091522);
            canvas.drawRoundRect(cx - 66 * scale, cy - 59 * scale, cx + 66 * scale, cy + 59 * scale, 24 * scale, 24 * scale, paint);
            paint.setColor(MINT);
            paint.setTextAlign(Paint.Align.CENTER);
            paint.setTextSize(10 * scale);
            canvas.drawText("● ENLACE LOCAL    ◒ 86%", cx, cy - 35 * scale, paint);
            paint.setColor(0xFFEAF2F8);
            paint.setTextSize(31 * scale);
            canvas.drawText("09:41", cx, cy + 2 * scale, paint);
            paint.setColor(MINT);
            paint.setTextSize(8 * scale);
            canvas.drawText("RCP TRAINER", cx, cy + 23 * scale, paint);
        }
    }

    private static final class MannequinView extends View {
        private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Runnable onPress;
        private boolean flash;
        MannequinView(Context context, Runnable onPress) { super(context); this.onPress = onPress; setFocusable(true); }
        void flash() {
            flash = true;
            invalidate();
            postDelayed(() -> { flash = false; invalidate(); }, 220);
        }
        @Override public boolean onTouchEvent(MotionEvent event) {
            if (event.getAction() == MotionEvent.ACTION_DOWN) {
                return true;
            }
            if (event.getAction() == MotionEvent.ACTION_UP) performClick();
            return true;
        }
        @Override public boolean performClick() {
            super.performClick();
            onPress.run();
            return true;
        }
        @Override protected void onDraw(Canvas canvas) {
            super.onDraw(canvas);
            float scale = getResources().getDisplayMetrics().density;
            float width = getWidth(), height = getHeight(), cx = width / 2;
            paint.setColor(0xFF0C1728);
            canvas.drawRoundRect(0, 0, width, height, 20 * scale, 20 * scale, paint);
            paint.setColor(0xFF1B2D43);
            canvas.drawRoundRect(cx - 95 * scale, 35 * scale, cx + 95 * scale, height - 14 * scale, 28 * scale, 28 * scale, paint);
            paint.setColor(0xFF526B82);
            canvas.drawRoundRect(cx - 78 * scale, 58 * scale, cx + 78 * scale, height - 36 * scale, 22 * scale, 22 * scale, paint);
            paint.setColor(flash ? MINT : 0xFF8CA5BB);
            canvas.drawCircle(cx, height * .55f, 24 * scale, paint);
            paint.setColor(0xFF243C53);
            canvas.drawCircle(cx, height * .55f, 14 * scale, paint);
            paint.setTextAlign(Paint.Align.CENTER);
            paint.setTextSize(10 * scale);
            paint.setColor(MUTED);
            canvas.drawText("MANIQUÍ DE PRÁCTICA · TOCA EL TORSO", cx, height - 14 * scale, paint);
        }
    }

    private static final class CadenceChart extends View {
        private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final ArrayList<Motion> values;
        CadenceChart(Context context, ArrayList<Motion> values) { super(context); this.values = values; }
        @Override protected void onDraw(Canvas canvas) {
            super.onDraw(canvas);
            float width = getWidth(), height = getHeight(), scale = getResources().getDisplayMetrics().density;
            paint.setColor(PANEL);
            canvas.drawRoundRect(0, 0, width, height, 14 * scale, 14 * scale, paint);
            for (int line = 1; line < 4; line++) {
                paint.setColor(0xFF2A3A4C);
                paint.setStrokeWidth(1 * scale);
                canvas.drawLine(14 * scale, height * line / 4f, width - 14 * scale, height * line / 4f, paint);
            }
            if (values.size() < 2) {
                paint.setColor(MUTED);
                paint.setTextSize(12 * scale);
                paint.setTextAlign(Paint.Align.CENTER);
                canvas.drawText("Marca al menos dos movimientos", width / 2, height / 2, paint);
                return;
            }
            paint.setColor(MINT);
            paint.setStrokeWidth(2.5f * scale);
            paint.setStyle(Paint.Style.STROKE);
            Motion first = values.get(0), last = values.get(values.size() - 1);
            double max = 150;
            float usableWidth = width - 28 * scale, usableHeight = height - 28 * scale;
            for (int i = 1; i < values.size(); i++) {
                Motion a = values.get(i - 1), b = values.get(i);
                float x1 = 14 * scale + (i - 1) * usableWidth / (values.size() - 1);
                float x2 = 14 * scale + i * usableWidth / (values.size() - 1);
                float y1 = height - 14 * scale - (float) Math.min(max, a.cadence) / (float) max * usableHeight;
                float y2 = height - 14 * scale - (float) Math.min(max, b.cadence) / (float) max * usableHeight;
                canvas.drawLine(x1, y1, x2, y2, paint);
            }
            paint.setStyle(Paint.Style.FILL);
        }
    }
}
