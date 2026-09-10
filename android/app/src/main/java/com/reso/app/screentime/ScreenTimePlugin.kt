package com.reso.app.screentime

import android.app.AppOpsManager
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.os.Process
import android.provider.Settings
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale
import java.util.TimeZone

/**
 * ScreenTime — a small native bridge over Android's UsageStatsManager.
 *
 * Web side (lib/screentime.ts) calls this plugin as window.Capacitor.Plugins.ScreenTime:
 *   checkPermission()            -> { granted: boolean }
 *   openPermissionSettings()     -> void   (deep-links to usage access settings)
 *   getScreenTimeMinutes({date}) -> { minutes: number | null, top_app: string | null }
 *
 * Permission: PACKAGE_USAGE_STATS (usage access) — granted by the user once,
 * through the system screen this plugin deep-links to. Read-only, on-device.
 */
@CapacitorPlugin(name = "ScreenTime")
class ScreenTimePlugin : Plugin() {

    private fun hasUsageAccess(): Boolean {
        val appOps = context.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
        val mode = appOps.unsafeCheckOpNoThrow(
            AppOpsManager.OPSTR_GET_USAGE_STATS,
            Process.myUid(),
            context.packageName
        )
        return mode == AppOpsManager.MODE_ALLOWED
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
        if (!hasUsageAccess()) {
            val ret = JSObject()
            ret.put("minutes", null)
            call.resolve(ret)
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

            val usm = context.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
            val stats = usm.queryUsageStats(
                UsageStatsManager.INTERVAL_DAILY,
                dayStart - 60_000L,
                dayEnd + 60_000L
            )

            // Sum real foreground time from buckets overlapping the requested day,
            // de-duplicated by app package across overlapping query buckets.
            val seen = mutableMapOf<String, Long>()
            for (s in stats) {
                // Skip buckets that don't overlap the day. <=/>= so a bucket that
                // merely touches midnight (e.g. the next day's bucket pulled in by
                // the ±60s query padding) can't leak its time into this day.
                if (s.lastTimeStamp <= dayStart || s.firstTimeStamp >= dayEnd) continue
                val pkg = s.packageName
                // totalTimeInForeground is actual accumulated foreground usage;
                // firstTimeStamp..lastTimeStamp is only the bucket's coverage range.
                val fg = s.totalTimeInForeground
                if (fg <= 0L) continue
                // keep the largest reported value per package to avoid double counting
                // across overlapping query buckets
                if (fg > (seen[pkg] ?: 0L)) seen[pkg] = fg
            }
            val totalMs = seen.values.sum()
            // The single app that took the most of the day's time.
            val topApp = seen.maxByOrNull { it.value }?.key

            val ret = JSObject()
            // Report null for days with no data (future dates, fresh installs).
            ret.put("minutes", if (totalMs > 0) (totalMs / 60_000.0).toInt() else null)
            ret.put("top_app", topApp)
            call.resolve(ret)
        } catch (e: Exception) {
            val ret = JSObject()
            ret.put("minutes", null)
            call.resolve(ret)
        }
    }
}
