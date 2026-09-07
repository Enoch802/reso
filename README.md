# Reso — your semester, kept honest

A personal discipline, academic, and financial companion for one university student, on one device. Local-first: there is **no server-side database** and no accounts — everything lives in the browser's IndexedDB on your own device.

Built with Next.js (App Router) + React + TypeScript + Tailwind CSS + Dexie (IndexedDB).

## Run it

```bash
npm install
npm run build
npm start        # production, port 3000
# or: npm run dev for development
```

Open http://localhost:3000.

## Environment variables

The app runs fine with **zero** configuration — AI features degrade gracefully with calm "not configured" messages. No `DATABASE_URL` or any database connection is needed anywhere.

| Variable | Required | What it enables |
|---|---|---|
| `OPENROUTER_API_KEY` | optional | Timetable AI reading, journal replies, weekly digest, course coach, email ranking |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | optional | Gmail connect (read-only) in Settings → Email |
| `GOOGLE_CLIENT_SECRET` | optional | Server-side Gmail authorization-code exchange and token refresh |
| `GOOGLE_REDIRECT_URI` / `NEXT_PUBLIC_GOOGLE_REDIRECT_URI` | optional | Fixed deployed callback URL; defaults to `<origin>/api/email/callback` |

Copy `.env.local.example` to `.env.local` and fill in what you need. **Never commit `.env.local`** — it is gitignored.

### Gmail OAuth notes

Gmail uses the OAuth authorization-code flow. Add the deployed callback URL (for example `https://your-app.vercel.app/api/email/callback`, or the value of `GOOGLE_REDIRECT_URI`) to the OAuth client's authorized redirect URIs. Tokens are stored only in local IndexedDB.

## Deploying to Vercel

Push to GitHub and import the repo in Vercel. Add any of the environment variables above in Project → Settings → Environment Variables. Build command `next build`, output is the default. No database plugin, no cron jobs — all personal data is client-side by design.

## Architecture notes

- **Local-first**: every personal datum (courses, scores, spending, journal, chats, alarms) is stored in IndexedDB via Dexie. The AI API routes are stateless: data in, result out, nothing retained.
- **Time-based features** are honest about the architecture: allowance credit and email fetching run **the next time you open Reso** (check-on-open). Named alarms and system reminders ring while the app is open; the `capacitor/android/` folder contains the native bridge (exact alarms via `AlarmManager`) that makes them fire with the app fully closed — see `capacitor/README.md`.
- **Offline**: the service worker precaches the whole app shell, so Reso opens without a network.

## Packaging as an Android app

`capacitor/README.md` walks through wrapping this app with Capacitor, registering the native plugins (screen time + alarms), and the manifest entries. The Kotlin sources are ready in `capacitor/android/`.
