/**
 * Screen time tracking — Android usage access, one-time setup, fully local.
 * On the web/PWA build there is no native bridge: this explains calmly and enables nothing.
 */
function ScreenTimeModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [enabled, setEnabled] = useState<0 | 1>(0);
  const [goal, setGoal] = useState("");
  const [loading, setLoading] = useState(true);
  const [permissionState, setPermissionState] = useState<"loading" | "granted" | "denied" | "web">("loading");
  const [justGranted, setJustGranted] = useState(false);

  useEffect(() => {
    if (!open) {
      setLoading(true);
      return;
    }
    (async () => {
      setLoading(true);
      const perm = await screenTimePermission();
      setPermissionState(perm === "granted" ? "granted" : perm === "denied" ? "denied" : "web");
      const row = await db.screentime_tracking.get(0);
      setEnabled(row?.enabled ?? 0);
      setGoal(String(row?.daily_goal_minutes ?? 300)); // default: 5h
      setLoading(false);
    })();
  }, [open]);

  const handleToggle = async (checked: boolean) => {
    const newState = checked ? 1 : 0;
    setEnabled(newState);
    const row = await db.screentime_tracking.get(0);
    await db.screentime_tracking.put({ ...row, id: 0, enabled: newState, daily_goal_minutes: parseFloat(goal) || 300 });
    if (checked && permissionState === "granted") {
      await pullYesterdayScreenTime().catch(() => null);
    } else if (!checked) {
      // Clear the last pull date so it will pull again next time
      await setMeta("screentime_last_pull", "");
    }
  };

  const saveGoal = async (minutes: number) => {
    const clamped = Math.max(30, Math.min(1440, Math.round(minutes))); // 30 min .. a full day
    setGoal(String(clamped));
    const row = await db.screentime_tracking.get(0);
    await db.screentime_tracking.put({ ...row, id: 0, enabled: row?.enabled ?? 0, daily_goal_minutes: clamped });
  };

  return (
    <Modal open={open} onClose={onClose} title="Screen time tracking">
      {loading ? (
        <p className="text-sm text-[var(--ink-soft)]">Loading…</p>
      ) : (
        <div className="text-sm text-[var(--ink-soft)] space-y-4">
          <div className="flex items-center justify-between p-3 rounded-xl bg-[var(--neo-base)] dark:bg-[var(--neo-base-dark)]">
            <div className="flex-1">
              <p className="font-medium text-[var(--ink)]">Screen time tracking</p>
              <p className="text-xs text-[var(--ink-faint)] mt-0.5">Read-only, stays on this device</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={enabled === 1}
                onChange={(e) => handleToggle(e.target.checked)}
              />
              <div className="w-11 h-6 bg-[var(--ink-faint)] peer-focus:outline-none rounded-full peer dark:bg-[var(--ink-faint)] peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[var(--accent)]"></div>
            </label>
          </div>

          {/* Daily goal — scores the discipline pillar + powers the streaks */}
          {enabled === 1 && (
            <div className="p-3 rounded-xl bg-[var(--neo-base)] dark:bg-[var(--neo-base-dark)]">
              <Field
                label="Daily goal (minutes)"
                value={goal}
                onChange={setGoal}
                type="number"
              />
              <div className="flex items-center justify-between mt-2">
                <p className="text-xs text-[var(--ink-faint)]">
                  {Math.floor((parseFloat(goal) || 300) / 60)}h {(parseFloat(goal) || 300) % 60}m a day. Days at or under this score 100% on the discipline ring.
                </p>
                <NeoButton
                  onClick={() => void saveGoal(parseFloat(goal) || 300)}
                  className="shrink-0 font-semibold"
                >
                  Save goal
                </NeoButton>
              </div>
              <div className="flex gap-2 mt-3">
                {[180, 240, 300, 360].map((m) => (
                  <button
                    key={m}
                    onClick={() => void saveGoal(m)}
                    className={`focus-ring text-xs rounded-lg px-2.5 py-1.5 transition-all ${
                      String(m) === goal ? "neo-pressed text-[var(--accent)] font-semibold" : "neo-sm text-[var(--ink-soft)]"
                    }`}
                  >
                    {m / 60}h
                  </button>
                ))}
              </div>
            </div>
          )}

          {permissionState === "web" && (
            <div className="p-3 rounded-xl bg-[var(--neo-base)] dark:bg-[var(--neo-base-dark)]">
              <p className="font-medium text-[var(--ink)] mb-1">Android-only feature</p>
              <p className="text-xs text-[var(--ink-faint)]">Screen time comes from Android's UsageStatsManager. Works only in the Reso Android app — not in a browser or PWA.</p>
            </div>
          )}

          {permissionState === "granted" && enabled === 1 && (
            <div className="p-3 rounded-xl bg-[var(--neo-base)] dark:bg-[var(--neo-base-dark)] border border-emerald-200 dark:border-emerald-900/30">
              <p className="text-emerald-600 dark:text-emerald-300 font-medium mb-1">Active</p>
              <p>Each day, Reso quietly reads yesterday's usage from Android — how long you were on your phone, and which app took most of that time. It scores against your daily goal on the discipline ring, and lands beside your evening reflection as supporting context.</p>
            </div>
          )}

          {permissionState === "denied" && enabled === 1 && (
            <div className="p-3 rounded-xl bg-[var(--neo-base)] dark:bg-[var(--neo-base-dark)]">
              <p className="text-amber-600 dark:text-amber-300 font-medium mb-1">Permission required</p>
              <p>Reso reads your phone usage straight from Android — total screen time and the app you spent it on most. It stays beside your evening reflection, so on a heavy-phone day the picture of your week stays honest rather than mysterious.</p>
              <p className="text-xs text-[var(--ink-faint)] mt-1">It's read-only, stays on this device, and entirely optional.</p>
              {justGranted && <p className="text-xs text-[var(--ink-soft)] mt-2">If you've just allowed it, Reso will pick it up next time you open the app.</p>}
              <NeoButton
                variant="accent"
                className="font-semibold mt-3"
                onClick={async () => {
                  setJustGranted(true);
                  await openScreenTimeSettings();
                }}
              >
                Open Android settings to allow
              </NeoButton>
              <p className="text-xs text-[var(--ink-faint)] mt-1">Look for "Usage access" and allow it for Reso — a one-time step.</p>
            </div>
          )}

          <p className="text-xs text-[var(--ink-faint)]">To turn it off later, simply toggle the switch here, or revoke usage access for Reso in Android settings.</p>
        </div>
      )}
    </Modal>
  );
}
