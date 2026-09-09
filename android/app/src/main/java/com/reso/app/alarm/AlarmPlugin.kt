package com.reso.app.alarm

import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.os.Build
import android.os.Bundle
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
 * Web side (lib/alarm.ts) calls window.Capacitor.Plugins.AlarmScheduler:
 *   scheduleAll({ alarms: [{ id, label, time "HH:mm", enabled }] })  — replaces the schedule
 *   cancel({ id })
 *
 * Mechanics: AlarmManager.setExactAndAllowWhileIdle wakes the device at the
 * next occurrence; AlarmReceiver posts a full-screen, alarm-sound notification
 * with Snooze (+5 min) and Stop actions; BootReceiver restores the schedule
 * after a reboot. Times are mirrored in SharedPreferences so the boot receiver
 * never needs to open the database.
 */
@CapacitorPlugin(name = "AlarmScheduler")
class AlarmPlugin : Plugin() {

    companion object {
        const val PREFS = "reso_alarms"
        const val CHANNEL_ID = "reso_alarms"
        const val EXTRA_ID = "reso_alarm_id"
        const val EXTRA_LABEL = "reso_alarm_label"
        const val ACTION_SNOOZE = "com.reso.app.alarm.SNOOZE"
        const val ACTION_STOP = "com.reso.app.alarm.STOP"
    }

    private val prefs: SharedPreferences by lazy { context.getSharedPreferences(PREFS, Context.MODE_PRIVATE) }

    @PluginMethod
    fun scheduleAll(call: PluginCall) {
        val arr = call.getArray("alarms") ?: JSArray()
        prefs.edit().putString("alarms", arr.toString()).apply()
        rescheduleAll()
        call.resolve()
    }

    @PluginMethod
    fun cancel(call: PluginCall) {
        val id = call.getInt("id") ?: return call.reject("id is required")
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        alarmManager.cancel(pendingFire(context, id, ""))
        val remaining = loadAlarms().filter { it.id != id }
        prefs.edit().putString("alarms", serialize(remaining)).apply()
        call.resolve()
    }

    data class AlarmRow(val id: Int, val label: String, val time: String, val enabled: Boolean, val date: String? = null)

    private fun loadAlarms(): List<AlarmRow> {
        val raw = prefs.getString("alarms", "[]") ?: "[]"
        val out = mutableListOf<AlarmRow>()
        val arr = JSArray(raw)
        for (i in 0 until arr.length()) {
            val o: JSONObject = arr.getJSONObject(i)
            out.add(
                AlarmRow(
                    o.optInt("id"),
                    o.optString("label", "Alarm"),
                    o.optString("time", "07:00"),
                    o.optBoolean("enabled", true),
                    if (o.has("date") && !o.isNull("date") && o.optString("date").isNotEmpty()) o.optString("date") else null
                )
            )
        }
        return out
    }

    private fun serialize(rows: List<AlarmRow>): String {
        val arr = JSArray()
        for (r in rows) {
            val o = JSObject()
            o.put("id", r.id); o.put("label", r.label); o.put("time", r.time); o.put("enabled", r.enabled)
            if (r.date != null) o.put("date", r.date)
            arr.put(o)
        }
        return arr.toString()
    }

    private fun rescheduleAll() {
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        for (r in loadAlarms()) {
            alarmManager.cancel(pendingFire(context, r.id, r.label))
            if (!r.enabled) continue
            val at = if (r.date != null) {
                // One-shot at a specific date+time (e.g. exam countdowns, cycle reminders).
                val dParts = r.date.split("-")
                val tParts = r.time.split(":")
                val cal = Calendar.getInstance().apply {
                    set(
                        dParts.getOrNull(0)?.toIntOrNull() ?: return@rescheduleAll,
                        (dParts.getOrNull(1)?.toIntOrNull() ?: 1) - 1,
                        dParts.getOrNull(2)?.toIntOrNull() ?: 1,
                        tParts.getOrNull(0)?.toIntOrNull() ?: 9,
                        tParts.getOrNull(1)?.toIntOrNull() ?: 0,
                        0
                    )
                    set(Calendar.MILLISECOND, 0)
                }
                if (cal.timeInMillis <= System.currentTimeMillis()) continue
                cal.timeInMillis
            } else {
                nextOccurrence(r.time)
            }
            val pi = pendingFire(context, r.id, r.label)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !alarmManager.canScheduleExactAlarms()) {
                alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
            } else {
                alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
            }
        }
    }

    /** Next wall-clock occurrence of "HH:mm" (today if still ahead, else tomorrow). */
    private fun nextOccurrence(time: String): Long {
        val parts = time.split(":")
        val h = parts.getOrNull(0)?.toIntOrNull() ?: 7
        val m = parts.getOrNull(1)?.toIntOrNull() ?: 0
        val cal = Calendar.getInstance().apply {
            set(Calendar.HOUR_OF_DAY, h); set(Calendar.MINUTE, m); set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0)
        }
        if (cal.timeInMillis <= System.currentTimeMillis()) cal.add(Calendar.DAY_OF_YEAR, 1)
        return cal.timeInMillis
    }

    private fun pendingFire(ctx: Context, id: Int, label: String): PendingIntent =
        PendingIntent.getBroadcast(
            ctx, id,
            Intent(ctx, AlarmReceiver::class.java).putExtra(EXTRA_ID, id).putExtra(EXTRA_LABEL, label),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

    private fun pendingSnooze(ctx: Context, id: Int, label: String, delayMs: Long): PendingIntent {
        val at = System.currentTimeMillis() + delayMs
        val pi = PendingIntent.getBroadcast(
            ctx, 1_000_000 + id,
            Intent(ctx, AlarmReceiver::class.java).putExtra(EXTRA_ID, id).putExtra(EXTRA_LABEL, label)
                .putExtra("snoozed_at", at),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !am.canScheduleExactAlarms()) {
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
        } else {
            am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
        }
        return pi
    }

    /** Fired by AlarmManager at alarm time; posts the ringing notification. */
    class AlarmReceiver : BroadcastReceiver() {
        override fun onReceive(ctx: Context, intent: Intent) {
            val id = intent.getIntExtra(EXTRA_ID, 0)
            val label = intent.getStringExtra(EXTRA_LABEL) ?: "Alarm"
            val snoozedAt = intent.getLongExtra("snoozed_at", -1L)
            if (snoozedAt != -1L) {
                // Snoozed instance: cancel the countdown, ring now.
                (ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager)
                    .cancel(PendingIntent.getBroadcast(ctx, 1_000_000 + id,
                        Intent(ctx, AlarmReceiver::class.java).putExtra(EXTRA_ID, id).putExtra(EXTRA_LABEL, label),
                        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
            }

            val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val channel = NotificationChannel(
                    CHANNEL_ID, "Alarms", NotificationManager.IMPORTANCE_HIGH
                ).apply {
                    setSound(
                        RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM),
                        AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_ALARM)
                            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                            .build()
                    )
                    enableVibration(true)
                    vibrationPattern = longArrayOf(400, 220, 400, 220)
                }
                nm.createNotificationChannel(channel)
            }

            val content = Intent(ctx, ctx.packageManager.getLaunchIntentForPackage(ctx.packageName)!!.javaClass)
            val contentPi = PendingIntent.getActivity(ctx, id, content, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

            val stopPi = PendingIntent.getBroadcast(
                ctx, 2_000_000 + id,
                Intent(ctx, AlarmActionReceiver::class.java).setAction(ACTION_STOP).putExtra(EXTRA_ID, id),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            val snoozePi = PendingIntent.getBroadcast(
                ctx, 3_000_000 + id,
                Intent(ctx, AlarmActionReceiver::class.java).setAction(ACTION_SNOOZE)
                    .putExtra(EXTRA_ID, id).putExtra(EXTRA_LABEL, label),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )

            val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                Notification.Builder(ctx, CHANNEL_ID)
            } else {
                @Suppress("DEPRECATION") Notification.Builder(ctx)
            }
            val notification = builder
                .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
                .setContentTitle(label)
                .setContentText("Your alarm is ringing")
                .setContentIntent(contentPi)
                .setCategory(Notification.CATEGORY_ALARM)
                .setAutoCancel(true)
                .addAction(0, "Snooze 5 min", snoozePi)
                .addAction(0, "Stop", stopPi)
                .build()

            nm.notify(id, notification)
        }
    }

    /** Handles the notification's Snooze / Stop actions. */
    class AlarmActionReceiver : BroadcastReceiver() {
        override fun onReceive(ctx: Context, intent: Intent) {
            val id = intent.getIntExtra(EXTRA_ID, 0)
            val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            nm.cancel(id)
            when (intent.action) {
                ACTION_SNOOZE -> {
                    // Ask AlarmPlugin to reschedule +5 minutes via a one-shot receiver.
                    val label = intent.getStringExtra(EXTRA_LABEL) ?: "Alarm"
                    val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
                    val pi = PendingIntent.getBroadcast(
                        ctx, 1_000_000 + id,
                        Intent(ctx, AlarmReceiver::class.java).putExtra(EXTRA_ID, id)
                            .putExtra(EXTRA_LABEL, label).putExtra("snoozed_at", System.currentTimeMillis() + 5 * 60_000L),
                        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                    )
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !am.canScheduleExactAlarms()) {
                        am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, System.currentTimeMillis() + 5 * 60_000L, pi)
                    } else {
                        am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, System.currentTimeMillis() + 5 * 60_000L, pi)
                    }
                }
                ACTION_STOP -> { /* notification already cancelled */ }
            }
        }
    }

    /** Restores the alarm schedule after a device reboot. */
    class BootReceiver : BroadcastReceiver() {
        override fun onReceive(ctx: Context, intent: Intent) {
            if (intent.action != Intent.ACTION_BOOT_COMPLETED) return
            // Re-arm via the plugin's persisted mirror.
            val prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            val raw = prefs.getString("alarms", "[]") ?: "[]"
            // rescheduleAll lives in the plugin instance; replicate minimal logic here.
            val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            val arr = JSArray(raw)
            for (i in 0 until arr.length()) {
                val o: JSONObject = arr.getJSONObject(i)
                if (!o.optBoolean("enabled", true)) continue
                val id = o.optInt("id"); val time = o.optString("time", "07:00"); val label = o.optString("label", "Alarm")
                val parts = time.split(":")
                val h = parts.getOrNull(0)?.toIntOrNull() ?: 7
                val m = parts.getOrNull(1)?.toIntOrNull() ?: 0
                val cal = Calendar.getInstance().apply {
                    set(Calendar.HOUR_OF_DAY, h); set(Calendar.MINUTE, m); set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0)
                }
                if (cal.timeInMillis <= System.currentTimeMillis()) cal.add(Calendar.DAY_OF_YEAR, 1)
                val pi = PendingIntent.getBroadcast(
                    ctx, id,
                    Intent(ctx, AlarmReceiver::class.java).putExtra(EXTRA_ID, id).putExtra(EXTRA_LABEL, label),
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                )
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !am.canScheduleExactAlarms()) {
                    am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, cal.timeInMillis, pi)
                } else {
                    am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, cal.timeInMillis, pi)
                }
            }
        }
    }
}
