# Reso Android wrapper

The Android project in `../android/` is configured with app id `com.reso.app`, app name `Reso`, and `server.url = https://reso-pnjj.vercel.app`. The native shell loads the live Vercel deployment, not a static export, so AI, Gmail OAuth, digest, and timetable API routes remain available.

## Open and build in Android Studio

1. Install Android Studio with an Android SDK and emulator or connect a USB-debugging-enabled device.
2. Open the repository's `android/` directory in Android Studio.
3. Let Gradle sync finish, then choose an emulator or connected device.
4. Run the `app` configuration to test the WebView wrapper.
5. Build an APK from **Build > Build Bundle(s) / APK(s) > Build APK(s)**, or generate a signed release from **Build > Generate Signed Bundle / APK**.

Before testing native features, grant **Usage access** to Reso in Android Settings when prompted by Screen Time tracking. Exact alarm delivery may require enabling Reso under **Alarms & reminders** on Android versions that expose that permission.

The app icon uses the existing Reso favicon-derived mark in adaptive launcher resources at `android/app/src/main/res/mipmap-*`; the Play Store-sized source is `capacitor/icons/play-store-icon.png`.

## Generated project maintenance

After changing Capacitor packages or native plugins, run `npx cap sync android` from the repository root. Do not run `next export` or point the wrapper at `.next`: the native app is intentionally configured to use the live Vercel URL.

## Native plugin registration

`MainActivity` registers `AlarmPlugin` and `ScreenTimePlugin`. The manifest declares internet, exact-alarm, vibration, boot, and usage-access permissions, and registers alarm and boot receivers. Alarm schedules persist in native preferences and are restored after reboot.

## Screen Time — Capacitor Android bridge

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
