# Screen Time — Capacitor Android bridge

Screen time syncing reads Android's `UsageStatsManager` and stores the previous
day's total (minutes) into the local `daily_logs` table. Nothing is sent to any
server. On web/PWA builds the feature is invisible and the app works fully
without it.

## Why a scaffold exists here

The web project ships without an Android shell (it is a Next.js PWA), so the
native side cannot be compiled in this repo. `android/ScreenTimePlugin.kt` is a
complete, ready-to-register plugin for when the app is wrapped with Capacitor.

## Wiring it into a Capacitor Android build

1. Add Capacitor and create the shell:
   ```
   npm i @capacitor/core @capacitor/cli
   npx cap init Reso com.reso.app --web-dir=.next   # or an exported static dir
   npx cap add android
   ```
2. Copy `android/ScreenTimePlugin.kt` into
   `android/app/src/main/java/com/reso/app/screentime/`.
3. Register the plugins in the app's `MainActivity`:
   ```kotlin
   import com.reso.app.screentime.ScreenTimePlugin
   import com.reso.app.alarm.AlarmPlugin

   class MainActivity : BridgeActivity() {
       override fun onCreate(savedInstanceState: Bundle?) {
           registerPlugin(ScreenTimePlugin::class.java)
           registerPlugin(AlarmPlugin::class.java)
           super.onCreate(savedInstanceState)
       }
   }
   ```

   Also copy `android/AlarmPlugin.kt` to
   `android/app/src/main/java/com/reso/app/alarm/`, and add to
   `AndroidManifest.xml`:
   ```xml
   <uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />
   <uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM" />
   <uses-permission android:name="android.permission.VIBRATE" />
   <application ...>
       <receiver android:name="com.reso.app.alarm.AlarmPlugin$AlarmReceiver" />
       <receiver android:name="com.reso.app.alarm.AlarmPlugin$AlarmActionReceiver" />
       <receiver android:name="com.reso.app.alarm.AlarmPlugin$BootReceiver"
                 android:exported="true">
           <intent-filter>
               <action android:name="android.intent.action.BOOT_COMPLETED" />
           </intent-filter>
       </receiver>
   </application>
   ```

   With this in place, named alarms ring with Reso fully closed: exact alarms
   wake the device, a full-screen alarm-sound notification appears with
   Snooze (+5 min) and Stop actions, and the schedule survives reboots. The
   web layer syncs the alarm list to the plugin automatically whenever it
   changes (`lib/alarm.ts` -> `syncNativeAlarms`).
4. Declare the permission in `AndroidManifest.xml` (no runtime prompt — the
   user grants "Usage access" through system settings, which the plugin
   deep-links to):
   ```xml
   <uses-permission android:name="android.permission.PACKAGE_USAGE_STATS"
                    tools:ignore="ProtectedPermissions" />
   ```
5. Sync and run: `npx cap sync android && npx cap open android`

No web-side changes are needed — `lib/screentime.ts` detects the plugin at
runtime (`window.Capacitor.Plugins.ScreenTime`) and activates automatically.
The Settings screen ("Screen time tracking") then shows the real permission
flow instead of the web explanation.

## Behavior contract

- `checkPermission()` → `{ granted: boolean }`
- `openPermissionSettings()` → deep-links to `ACTION_USAGE_ACCESS_SETTINGS`
- `getScreenTimeMinutes({ date })` → `{ minutes: number | null }` — null when
  permission is missing or the day has no data (never a fabricated number)
- The web layer pulls once per day on app open, stores to
  `daily_logs.screen_time_minutes`, and surfaces it quietly in the Journal and
  (only when genuinely relevant) in the weekly digest.

## Ringing with the app fully closed (true alarm behavior)

The web alarm engine (lib/alarm.ts) rings while Reso is open — including an
installed PWA running in the background. For alarm-grade reliability with the
app fully closed, the Android build should schedule exact alarms:

- Use `AlarmManager.setExactAndAllowWhileIdle()` with `TYPE_RTC_WAKEUP` for
  each enabled alarm, re-registered on boot (`RECEIVE_BOOT_COMPLETED`) and
  whenever the user edits one.
- Fire a full-screen intent notification with a custom alarm sound
  (`NotificationChannel.setSound(...)`, `USAGE_ALARM`) — that is what makes an
  Android phone actually ring like the stock clock app.
- Snooze/Stop as notification actions writing back through the plugin.

Add a companion plugin method (e.g. `schedule(alarm)`, `cancel(id)`) to
ScreenTimePlugin-style native code, and have the web layer call it whenever
`db.alarms` changes. Until that native step lands, the PWA behavior above
applies.
