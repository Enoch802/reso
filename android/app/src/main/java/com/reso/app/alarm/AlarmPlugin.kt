package com.reso.app.alarm

import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import com.getcapacitor.Bridge
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import org.json.JSONObject
import java.util.Calendar

/**
 * AlarmScheduler — makes named alarms RING with the app fully closed.
 *
 * Web contract (lib/alarm.ts):
 *   scheduleAll({ alarms: [{ id, label, time "HH:mm", enabled: 0|1, date? }] })
 *   cancel({ id }) / dismiss() / snooze({ id })
 *   checkExactAlarmPermission() / requestExactAlarmPermission()
 * Event: window "alarmFired" CustomEvent, detail { id, label }.
 */
@CapacitorPlugin(name = "AlarmScheduler")
class AlarmPlugin : Plugin() {

    companion object {
        @Volatile var bridgeRef: Bridge? = null

        const val CHANNEL_RING = "reso_alarm_ring"      // FGS notification — service owns the sound
        const val CHANNEL_FALLBACK = "reso_alarm_fb"    // heads-up with channel sound, if FGS blocked
        const val EXTRA_ID = "reso_alarm_id"
        const val EXTRA_LABEL = "reso_alarm_label"
        const val ACTION_SNOOZE = "com.reso.app.alarm.SNOOZE"
        const val ACTION_STOP = "com.reso.app.alarm.STOP"
        const val RING_TIMEOUT_MS = 5 * 60_000L

        fun notifyJs(id: Int, label: String) {
            val data = JSObject().apply { put("id", id); put("label", label) }
            try { bridgeRef?.triggerJSEvent("alarmFired", "window", data) } catch (_: Exception) {}
        }

        fun ensureChannels(ctx: Context) {
            if (Build.VERSION.SDK_INT < 26) return
            val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            nm.createNotificationChannel(
                NotificationChannel(CHANNEL_RING, "Alarms", NotificationManager.IMPORTANCE_HIGH).apply {
                    setSound(null, null); enableVibration(false) // the service plays sound + vibrates
                }
            )
            nm.createNotificationChannel(
                NotificationChannel(CHANNEL_FALLBACK, "Alarms (fallback)", NotificationManager.IMPORTANCE_HIGH).apply {
                    setSound(
                        RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM),
                        AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_ALARM)
                            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build()
                    )
                    enableVibration(true)
                    vibrationPattern = longArrayOf(400, 220, 400, 220)
                }
            )
        }

        fun openAppIntent(ctx: Context): Intent? =
            ctx.packageManager.getLaunchIntentForPackage(ctx.packageName)?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }

    override fun load() { bridgeRef = bridge }

    @PluginMethod
    fun scheduleAll(call: PluginCall) {
        val arr = call.getArray("alarms") ?: JSArray()
        AlarmStore.saveRaw(context, arr.toString())
        AlarmStore.rescheduleAll(context)
        call.resolve()
    }

    @PluginMethod
    fun cancel(call: PluginCall) {
        val id = call.getInt("id") ?: return call.reject("id is required")
        AlarmStore.cancelAndRemove(context, id)
        call.resolve()
    }

    @PluginMethod
    fun dismiss(call: PluginCall) {
        context.stopService(Intent(context, AlarmService::class.java))
        call.resolve()
    }

    @PluginMethod
    fun snooze(call: PluginCall) {
        val id = call.getInt("id") ?: return call.reject("id is required")
        context.stopService(Intent(context, AlarmService::class.java))
        AlarmStore.snooze(context, id)
        call.resolve()
    }

    @PluginMethod
    fun checkExactAlarmPermission(call: PluginCall) {
        val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val granted = Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms()
        call.resolve(JSObject().apply { put("granted", granted) })
    }

    @PluginMethod
    fun requestExactAlarmPermission(call: PluginCall) {
        if (Build.VERSION.SDK_INT >= 31) {
            try {
                startActivity(
                    Intent(android.provider.Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM)
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                )
            } catch (_: Exception) {}
        }
        call.resolve()
    }

    /* ---------------- The ringer ---------------- */

    class AlarmService : Service() {
        private var player: MediaPlayer? = null
        private var vibrator: Vibrator? = null
        private var wakeLock: PowerManager.WakeLock? = null
        private val handler = Handler(Looper.getMainLooper())

        override fun onBind(intent: Intent?): IBinder? = null

        override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
            val id = intent?.getIntExtra(AlarmStore.EXTRA_ID, -1) ?: -1
            val label = intent?.getStringExtra(AlarmStore.EXTRA_LABEL) ?: "Alarm"
            ensureChannels(this)
            startForeground(3001, buildNotification(id, label))
            playSound()
            startVibration()
            notifyJs(id, label)
            // Safety: never ring forever if the user never acts.
            handler.postDelayed({ stopSelf() }, RING_TIMEOUT_MS)
            return START_NOT_STICKY
        }

        private fun buildNotification(id: Int, label: String): Notification {
            val contentPi = PendingIntent.getActivity(
                this, 700_000 + id,
                openAppIntent(this),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            val stopPi = PendingIntent.getBroadcast(
                this, 2_000_000 + id,
                Intent(this, AlarmActionReceiver::class.java).setAction(ACTION_STOP).putExtra(AlarmStore.EXTRA_ID, id),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            val snoozePi = PendingIntent.getBroadcast(
                this, 3_000_000 + id,
                Intent(this, AlarmActionReceiver::class.java).setAction(ACTION_SNOOZE)
                    .putExtra(AlarmStore.EXTRA_ID, id).putExtra(AlarmStore.EXTRA_LABEL, label),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            return Notification.Builder(this, CHANNEL_RING)
                .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
                .setContentTitle(label)
                .setContentText("Alarm — swipe to dismiss, or use the buttons")
                .setContentIntent(contentPi)
                .setCategory(Notification.CATEGORY_ALARM)
                .setOngoing(true)
                .setFullScreenIntent(contentPi, true)
                .addAction(0, "Stop", stopPi)
                .addAction(0, "Snooze 5 min", snoozePi)
                .build()
        }

        private fun playSound() {
            try {
                player = MediaPlayer().apply {
                    setDataSource(this@AlarmService, RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM))
                    setAudioAttributes(
                        AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_ALARM)
                            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build()
                    )
                    isLooping = true
                    prepare()
                    start()
                }
            } catch (_: Exception) { player = null } // vibration still rings
        }

        private fun startVibration() {
            vibrator = if (Build.VERSION.SDK_INT >= 31) {
                (getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager).defaultVibrator
            } else {
                @Suppress("DEPRECATION") getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
            }
            try { vibrator?.vibrate(VibrationEffect.createWaveform(longArrayOf(0, 400, 220, 400), 0)) } catch (_: Exception) {}
        }

        override fun onCreate() {
            super.onCreate()
            wakeLock = (getSystemService(Context.POWER_SERVICE) as PowerManager)
                .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "reso:alarm")
            wakeLock?.acquire(RING_TIMEOUT_MS)
        }

        override fun onDestroy() {
            handler.removeCallbacksAndMessages(null)
            try { player?.stop(); player?.release() } catch (_: Exception) {}
            player = null
            try { vibrator?.cancel() } catch (_: Exception) {}
            vibrator = null
            wakeLock?.let { if (it.isHeld) it.release() }
            wakeLock = null
            super.onDestroy()
        }
    }

    /* ---------------- Fired by AlarmManager at alarm time ---------------- */

    class AlarmReceiver : BroadcastReceiver() {
        override fun onReceive(ctx: Context, intent: Intent) {
            val id = intent.getIntExtra(AlarmStore.EXTRA_ID, 0)
            val label = intent.getStringExtra(AlarmStore.EXTRA_LABEL) ?: "Alarm"

            // Daily alarm: arm tomorrow now — the process may never run again before then.
            AlarmStore.rearmDaily(ctx, id)

            try {
                val svc = Intent(ctx, AlarmService::class.java)
                    .putExtra(AlarmStore.EXTRA_ID, id).putExtra(AlarmStore.EXTRA_LABEL, label)
                if (Build.VERSION.SDK_INT >= 26) ctx.startForegroundService(svc) else ctx.startService(svc)
            } catch (e: Exception) {
                // FGS start blocked (e.g. inexact fallback path): ring via a
                // full-screen-intent notification whose channel carries the sound.
                postFallbackNotification(ctx, id, label)
            }
        }

        private fun postFallbackNotification(ctx: Context, id: Int, label: String) {
            ensureChannels(ctx)
            val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            val contentPi = PendingIntent.getActivity(
                ctx, 700_000 + id, openAppIntent(ctx),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            val stopPi = PendingIntent.getBroadcast(
                ctx, 2_000_000 + id,
                Intent(ctx, AlarmActionReceiver::class.java).setAction(ACTION_STOP).putExtra(AlarmStore.EXTRA_ID, id),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            val snoozePi = PendingIntent.getBroadcast(
                ctx, 3_000_000 + id,
                Intent(ctx, AlarmActionReceiver::class.java).setAction(ACTION_SNOOZE)
                    .putExtra(AlarmStore.EXTRA_ID, id).putExtra(AlarmStore.EXTRA_LABEL, label),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            nm.notify(id, Notification.Builder(ctx, CHANNEL_FALLBACK)
                .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
                .setContentTitle(label)
                .setContentText("Your alarm is ringing")
                .setContentIntent(contentPi)
                .setCategory(Notification.CATEGORY_ALARM)
                .setAutoCancel(true)
                .setFullScreenIntent(contentPi, true)
                .addAction(0, "Stop", stopPi)
                .addAction(0, "Snooze 5 min", snoozePi)
                .build())
        }
    }

    /* ---------------- Notification buttons — work with the app dead ---------------- */

    class AlarmActionReceiver : BroadcastReceiver() {
        override fun onReceive(ctx: Context, intent: Intent) {
            val id = intent.getIntExtra(AlarmStore.EXTRA_ID, 0)
            ctx.stopService(Intent(ctx, AlarmService::class.java))
            val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            nm.cancel(id)
            if (intent.action == ACTION_SNOOZE) AlarmStore.snooze(ctx, id)
        }
    }

    /* ---------------- Restore after reboot ---------------- */

    class BootReceiver : BroadcastReceiver() {
        override fun onReceive(ctx: Context, intent: Intent) {
            if (intent.action == Intent.ACTION_BOOT_COMPLETED) AlarmStore.rescheduleAll(ctx)
        }
    }
}

/** Scheduling + storage, callable from receivers with no plugin instance. */
internal object AlarmStore {
    const val PREFS = "reso_alarms"
    const val KEY = "alarms"
    const val EXTRA_ID = "reso_alarm_id"
    const val EXTRA_LABEL = "reso_alarm_label"

    data class AlarmRow(
        val id: Int, val label: String, val time: String,
        val enabled: Boolean, val date: String? = null
    )

    private fun prefs(ctx: Context) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun saveRaw(ctx: Context, json: String) { prefs(ctx).edit().putString(KEY, json).apply() }

    fun load(ctx: Context): List<AlarmRow> {
        val raw = prefs(ctx).getString(KEY, "[]") ?: "[]"
        val out = mutableListOf<AlarmRow>()
        try {
            val arr = org.json.JSONArray(raw)
            for (i in 0 until arr.length()) {
                val o = arr.getJSONObject(i)
                // JS sends enabled as 0|1 — never trust optBoolean's fallback.
                val enabled = when (val v = o.opt("enabled")) {
                    is Boolean -> v
                    is Number -> v.toInt() == 1
                    is String -> v == "1" || v.equals("true", true)
                    else -> true
                }
                out.add(
                    AlarmRow(
                        o.optInt("id", -1),
                        o.optString("label", "Alarm"),
                        o.optString("time", "07:00"),
                        enabled,
                        if (o.has("date") && !o.isNull("date") && o.optString("date").isNotEmpty()) o.optString("date") else null
                    )
                )
            }
        } catch (_: Exception) {}
        return out
    }

    fun cancelAndRemove(ctx: Context, id: Int) {
        val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        am.cancel(firePi(ctx, id, ""))
        saveRaw(ctx, serialize(load(ctx).filter { it.id != id }))
    }

    private fun serialize(rows: List<AlarmRow>): String {
        val arr = org.json.JSONArray()
        for (r in rows) {
            val o = JSONObject()
            o.put("id", r.id); o.put("label", r.label); o.put("time", r.time)
            o.put("enabled", if (r.enabled) 1 else 0)
            if (r.date != null) o.put("date", r.date)
            arr.put(o)
        }
        return arr.toString()
    }

    /** Next wall-clock occurrence of "HH:mm" strictly after `after`. */
    fun nextOccurrence(time: String, after: Long = System.currentTimeMillis()): Long {
        val parts = time.split(":")
        val h = parts.getOrNull(0)?.toIntOrNull() ?: 7
        val m = parts.getOrNull(1)?.toIntOrNull() ?: 0
        val cal = Calendar.getInstance().apply {
            timeInMillis = after
            set(Calendar.HOUR_OF_DAY, h); set(Calendar.MINUTE, m)
            set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0)
        }
        if (cal.timeInMillis <= after) cal.add(Calendar.DAY_OF_YEAR, 1)
        return cal.timeInMillis
    }

    fun firePi(ctx: Context, id: Int, label: String): PendingIntent =
        PendingIntent.getBroadcast(
            ctx, id,
            Intent(ctx, AlarmPlugin::class.java.javaClassForReceiver()).putExtra(EXTRA_ID, id).putExtra(EXTRA_LABEL, label),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

    private fun Intent.javaClassForReceiver(): Nothing = throw IllegalStateException()

    /** Arm at an absolute time — setAlarmClock when possible (Doze-proof + grants
     *  the temporary allowlist that lets AlarmReceiver start the FGS on Android 12+). */
    fun scheduleAt(ctx: Context, am: AlarmManager, id: Int, label: String, at: Long) {
        val pi = firePi(ctx, id, label)
        am.cancel(pi)
        val canExact = Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms()
        if (canExact) {
            val show = PendingIntent.getActivity(
                ctx, 700_000 + id,
                ctx.packageManager.getLaunchIntentForPackage(ctx.packageName)?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            am.setAlarmClock(AlarmManager.AlarmClockInfo(at, show), pi)
        } else {
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
        }
    }

    fun rescheduleAll(ctx: Context) {
        val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        for (r in load(ctx)) {
            am.cancel(firePi(ctx, r.id, r.label))
            if (!r.enabled) continue
            val at = if (r.date != null) {
                // One-shot at a specific date+time; skip if already past.
                val d = r.date.split("-"); val t = r.time.split(":")
                val cal = Calendar.getInstance().apply {
                    set(
                        d.getOrNull(0)?.toIntOrNull() ?: continue,
                        (d.getOrNull(1)?.toIntOrNull() ?: 1) - 1,
                        d.getOrNull(2)?.toIntOrNull() ?: 1,
                        t.getOrNull(0)?.toIntOrNull() ?: 9,
                        t.getOrNull(1)?.toIntOrNull() ?: 0, 0
                    )
                    set(Calendar.MILLISECOND, 0)
                }
                cal.timeInMillis
            } else {
                nextOccurrence(r.time)
            }
            if (at <= System.currentTimeMillis()) continue
            scheduleAt(ctx, am, r.id, r.label, at)
        }
    }

    /** After a daily alarm fires: arm the next occurrence (tomorrow). */
    fun rearmDaily(ctx: Context, id: Int) {
        val row = load(ctx).find { it.id == id } ?: return
        if (!row.enabled || row.date != null) return
        val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        scheduleAt(ctx, am, row.id, row.label, nextOccurrence(row.time))
    }

    fun snooze(ctx: Context, id: Int) {
        val row = load(ctx).find { it.id == id }
        val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        scheduleAt(ctx, am, id, row?.label ?: "Alarm", System.currentTimeMillis() + 5 * 60_000L)
    }
}
