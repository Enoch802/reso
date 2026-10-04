package com.reso.app

import android.os.Build
import android.view.WindowManager
import com.getcapacitor.BridgeActivity
import com.reso.app.alarm.AlarmPlugin
import com.reso.app.screentime.ScreenTimePlugin

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: android.os.Bundle?) {
        // Explicit hardware acceleration — some OEMs disable it per-app.
        window.setFlags(
            WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED,
            WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED
        )
        // Prefer the display's highest refresh rate (90/120Hz) while Reso is
        // foregrounded — Android may otherwise run WebViews at 60Hz.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            try {
                val modes = display.supportedModes
                val max = modes.maxByOrNull { it.refreshRate }
                if (max != null && max.refreshRate > display.mode.refreshRate) {
                    val lp = window.attributes
                    lp.preferredDisplayModeId = max.modeId
                    window.attributes = lp
                }
            } catch (_: Exception) {
            }
        }
        registerPlugin(AlarmPlugin::class.java)
        registerPlugin(ScreenTimePlugin::class.java)
        super.onCreate(savedInstanceState)
    }
}
