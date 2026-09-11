package com.reso.app.screentime

import android.app.AppOpsManager
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.os.Build
import android.os.Process
import android.provider.Settings
import android.util.Base64
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone

/**
 * ScreenTime — native bridge over Android's UsageStatsManager.
 *
 * Two sources, fused per app by MAX:
 *   1. Event stream (primary — proven per-app accurate). Sessions close on:
 *      background events, ANY new foreground event (single-window assumption
 *      for OEMs that skip PAUSED on task switch), SCREEN_NON_INTERACTIVE
 *      (nothing stays foreground once the screen is off), or "now".
 *   2. Bucket stats totalTimeInForeground (floor — rescues apps whose events
 *      this OEM fails to emit/flush, e.g. recent sessions). Stats are real
 *      accumulated foreground and cannot dangle; each app is capped at the
 *      elapsed time in the day, and the total likewise.
 */
@CapacitorPlugin(name = "ScreenTime")
class ScreenTimePlugin : Plugin() {

    private fun hasUsageAccess(): Boolean {
        val appOps = context.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
        val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            appOps.unsafeCheckOpNoThrow(
                AppOpsManager.OPSTR_GET_USAGE_STATS,
                Process.myUid(),
                context.packageName
            )
        } else {
            @Suppress("DEPRECATION")
            appOps.checkOpNoThrow(
                AppOpsManager.OPSTR_GET_USAGE_STATS,
                Process.myUid(),
                context.packageName
            )
        }
        return mode == AppOpsManager.MODE_ALLOWED
    }

    /** System components that aren't real "app usage" — matches Digital Wellbeing's spirit. */
    private fun isJunkPackage(pkg: String): Boolean {
        if (pkg == context.packageName) return true                    // Reso itself
        if (pkg == "com.android.systemui") return true
        if (pkg.startsWith("com.android.launcher")) return true
        if (pkg.endsWith(".launcher")) return true                     // Nova, Microsoft, etc.
        if (pkg.contains("inputmethod") || pkg.contains("keyboard")) return true
        if (pkg == "com.google.android.webview" || pkg == "com.android.webview") return true
        return false
    }

    /** App icon as a downscaled base64 PNG. */
    private fun encodeIcon(pkg: String, size: Int = 96): String? = try {
        val d = context.packageManager.getApplicationIcon(pkg)
        val bmp = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
        val c = Canvas(bmp)
        d.setBounds(0, 0, size, size)
        d.draw(c)
        val out = ByteArrayOutputStream()
        bmp.compress(Bitmap.CompressFormat.PNG, 90, out)
        bmp.recycle()
        Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
    } catch (e: Exception) {
        null
    }

    @PluginMethod
    fun checkPermission(call: PluginCall) {
        val ret = JSObject()
        ret.put("granted", hasUsageAccess())
        call.resolve(ret)
    }

    @PluginMethod
    fun openPermissionSettings(call: PluginCall) {
        val intent = Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS)
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
        call.resolve()
    }

    @PluginMethod
    fun getScreenTimeMinutes(call: PluginCall) {
        val empty = JSObject().apply {
            put("minutes", null)
            put("top_app", null)
            put("apps", JSArray())
        }

        if (!hasUsageAccess()) {
            call.resolve(empty)
            return
        }
        val dateStr = call.getString("date") ?: run {
            call.reject("date is required")
            return
        }

        try {
            val fmt = SimpleDateFormat("yyyy-MM-dd", Locale.US)
            fmt.timeZone = TimeZone.getDefault()
            val dayStart = fmt.parse(dateStr)!!.time
            val dayEnd = dayStart + 86_400_000L

            // Never count time that hasn't happened yet (live "today" reads).
            val countEnd = minOf(dayEnd, System.currentTimeMillis())
            val elapsedInDay = countEnd - dayStart
            if (elapsedInDay <= 0) {
                call.resolve(empty)
                return
            }

            val includeIcons = call.getBoolean("icons", true) ?: true
            val only: Set<String>? = call.getString("only")
                ?.split(",")?.map { it.trim() }?.filter { it.isNotEmpty() }?.toSet()

            val usm = context.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager

            /* ---- Source 1: event pairing (primary) ---- */

            // Look back one day so sessions crossing midnight into this day
            // (opened 23:50, closed 00:10) get their in-day portion counted.
            val windowStart = dayStart - 86_400_000L
            val events = usm.queryEvents(windowStart, dayEnd)
            val event = UsageEvents.Event()

            val openedAt = mutableMapOf<String, Long>()
            val eventsMs = mutableMapOf<String, Long>()

            fun isForeground(type: Int) =
                type == UsageEvents.Event.MOVE_TO_FOREGROUND ||
                (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && type == UsageEvents.Event.ACTIVITY_RESUMED)

            fun isBackground(type: Int) =
                type == UsageEvents.Event.MOVE_TO_BACKGROUND ||
                (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && type == UsageEvents.Event.ACTIVITY_PAUSED) ||
                (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && type == UsageEvents.Event.ACTIVITY_STOPPED)

            fun isScreenOff(type: Int) =
                Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q &&
                type == UsageEvents.Event.SCREEN_NON_INTERACTIVE

            fun addEvents(pkg: String, rawStart: Long, rawEnd: Long) {
                val s = maxOf(rawStart, dayStart)
                val e = minOf(rawEnd, dayEnd)
                if (e > s) eventsMs[pkg] = (eventsMs[pkg] ?: 0L) + (e - s)
            }

            fun closeAll(at: Long) {
                for ((pkg, start) in openedAt) addEvents(pkg, start, at)
                openedAt.clear()
            }

            while (events.hasNextEvent()) {
                events.getNextEvent(event)
                val pkg = event.packageName ?: continue
                val ts = event.timeStamp
                when {
                    isForeground(event.eventType) -> {
                        // The incoming app — real or a system component — ends
                        // every open session (single-window assumption).
                        closeAll(ts)
                        if (!isJunkPackage(pkg)) openedAt[pkg] = ts
                    }
                    isBackground(event.eventType) -> {
                        val start = openedAt.remove(pkg)
                        if (start != null) addEvents(pkg, start, ts)
                    }
                    isScreenOff(event.eventType) -> closeAll(ts)
                }
            }
            // Still open at "now" (device currently in use): clip to now.
            closeAll(countEnd)

            /* ---- Source 2: bucket stats (floor for event-missing apps) ---- */

            val statsMs = mutableMapOf<String, Long>()
            for (b in usm.queryUsageStats(UsageStatsManager.INTERVAL_BEST, dayStart, countEnd)) {
                val pkg = b.packageName ?: continue
                if (isJunkPackage(pkg)) continue
                if (b.lastTimeStamp <= dayStart || b.firstTimeStamp >= countEnd) continue
                val t = b.totalTimeInForeground
                if (t > (statsMs[pkg] ?: 0L)) statsMs[pkg] = t
            }

            /* ---- Fuse: max of the two per app, capped at elapsed in day ---- */

            val perApp = mutableMapOf<String, Long>()
            for (pkg in (eventsMs.keys + statsMs.keys)) {
                val byEvents = (eventsMs[pkg] ?: 0L).coerceAtMost(elapsedInDay)
                val byStats = (statsMs[pkg] ?: 0L).coerceAtMost(elapsedInDay)
                val honest = maxOf(byEvents, byStats)
                if (honest > 0) perApp[pkg] = honest
            }

            val totalMs = perApp.values.sum().coerceAtMost(elapsedInDay)
            val topApp = perApp.maxByOrNull { it.value }?.key

            val limit = call.getInt("limit") ?: 0
            val pm = context.packageManager
            val apps = JSArray()
            val sorted = perApp.entries.sortedByDescending { it.value }
            val scoped = if (only != null) sorted.filter { it.key in only } else sorted
            val shown = if (limit > 0) scoped.take(limit) else scoped
            shown.forEach { (pkg, ms) ->
                val label = try {
                    pm.getApplicationLabel(pm.getApplicationInfo(pkg, 0)).toString()
                } catch (e: Exception) {
                    pkg.substringAfterLast('.').replaceFirstChar { it.uppercase() }
                }
                val o = JSObject()
                o.put("package", pkg)
                o.put("app_name", label)
                o.put("minutes", (ms / 60_000.0).toInt())
                o.put("icon", if (includeIcons) encodeIcon(pkg) else JSONObject.NULL)
                apps.put(o)
            }

            val ret = JSObject()
            ret.put("minutes", if (totalMs > 0) (totalMs / 60_000.0).toInt() else null)
            ret.put("top_app", topApp)
            ret.put("apps", apps)
            call.resolve(ret)
        } catch (e: Exception) {
            call.resolve(empty)
        }
    }
}
