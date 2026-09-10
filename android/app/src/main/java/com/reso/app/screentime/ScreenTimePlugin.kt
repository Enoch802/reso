package com.reso.app.screentime

import android.app.AppOpsManager
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.os.Process
import android.provider.Settings
import android.util.Base64
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.io.ByteArrayOutputStream
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone

/**
 * ScreenTime — native bridge over Android's UsageStatsManager.
 *
 *   checkPermission()            -> { granted: boolean }
 *   openPermissionSettings()     -> void
 *   getScreenTimeMinutes({date, limit?}) -> {
 *     minutes: number | null,     // total across ALL apps
 *     top_app: string | null,
 *     apps: [{ package, app_name, minutes, icon }]  // heaviest first, icons as base64 PNG
 *   }
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

    /** App icon as a downscaled base64 PNG, so the web side gets logos without file access. */
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

            val usm = context.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
            val stats = usm.queryUsageStats(
                UsageStatsManager.INTERVAL_DAILY,
                dayStart - 60_000L,
                dayEnd + 60_000L
            )

            // Real foreground time, de-duplicated by package across overlapping buckets.
            val seen = mutableMapOf<String, Long>()
            for (s in stats) {
                if (s.lastTimeStamp <= dayStart || s.firstTimeStamp >= dayEnd) continue
                val pkg = s.packageName
                val fg = s.totalTimeInForeground
                if (fg <= 0L) continue
                if (fg > (seen[pkg] ?: 0L)) seen[pkg] = fg
            }
            val totalMs = seen.values.sum()
            val topApp = seen.maxByOrNull { it.value }?.key

            val limit = call.getInt("limit") ?: 0
            val pm = context.packageManager
            val apps = JSArray()
            val sorted = seen.entries.sortedByDescending { it.value }
            val shown = if (limit > 0) sorted.take(limit) else sorted
            shown.forEach { (pkg, ms) ->
                val label = try {
                    pm.getApplicationLabel(pm.getApplicationInfo(pkg, 0)).toString()
                } catch (e: Exception) {
                    pkg
                }
                val o = JSObject()
                o.put("package", pkg)
                o.put("app_name", label)
                o.put("minutes", (ms / 60_000.0).toInt())
                o.put("icon", encodeIcon(pkg))
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
