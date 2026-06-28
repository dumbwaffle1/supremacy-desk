# Supremacy Desk — Claude Code prompt pack

Paste each block into Claude Code **one at a time**, in order. After each, let it
run/typecheck/deploy, eyeball the result, then move on. Keep `supremacy-build-spec.md`
in the repo root so the agent can reference it.

**Decisions locked:** QF stake = £30 · admin = Yassine · settlement = score after
extra time (120'), penalty shootout = draw · payouts = Splitwise-style net balances + minimal transfers.

**Stack chosen for these prompts:** Next.js + Tailwind + shadcn/ui, **Convex**
(DB + realtime + cron + auth), **Vercel** hosting, **API-Football** scores.
Auth = **Convex Auth with email magic link + Sign in with Apple** (one vendor; the
login screen is literally an email box and an Apple button). Clerk or Supabase Auth
are drop-in alternatives if Convex Auth's setup gets fiddly.

Accounts to create first (all free to start): GitHub, Convex, Vercel, API-Football
(api-sports.io). Sign in with Apple needs an Apple Developer account (£79/yr) — skip
it for now and launch with email magic link only if you want to go live today.
Have Node 20+ installed.

---

### Prompt 0 — Scaffold & deploy an empty app

```
Set up a new project I'll build over several steps. Read supremacy-build-spec.md for full context.

Stack: Next.js (App Router) + TypeScript + Tailwind + shadcn/ui for the frontend,
Convex for database/realtime/cron/auth, deployed to Vercel.
Auth = Convex Auth with email magic link as the primary method (Sign in with Apple added later).

Do now:
1. Scaffold the Next.js + TS + Tailwind app, init shadcn/ui, init Convex, set up Convex Auth with an email magic-link provider.
2. Create a src/config/constants.ts with these as the single source of truth:
   PLAYERS = ["Pascal","Elio","Aida","Matt","Yas","CP","Chris","Manas"]
   WIDTH = 0.2
   STAKES = { R32:10, R16:20, QF:30, SF:50, "3PO":50, F:100 }   // £/goal
   ADMIN_EMAIL = "<MY_EMAIL_HERE>"
   SETTLEMENT_BASIS = "120min_exclPens"   // settle on post-extra-time score; penalty shootout = draw
3. Mobile-first layout shell with a bottom tab bar: Desk · Games · Settle · Rules · Admin.
4. Commit, push to a new GitHub repo, deploy to Vercel, give me the live URL.

Put all secrets in env vars and tell me exactly which keys to paste where. Don't hardcode anything secret.
Done when: the empty app builds, deploys, and I can load the URL on my phone.
```

---

### Prompt 1 — Data model & seed

```
Implement the Convex schema from supremacy-build-spec.md §4 (User, Player, Tournament, Game, Trade, AuditLog).
Notes:
- Game.offer is always Game.bid + WIDTH (don't store offer separately if you can derive it; either is fine but keep them consistent).
- Trade.priceTaken snapshots offer (BUY) or bid (SELL) at submit time.
- Keep standings DERIVED from settled trades (a query that recomputes), not a mutable counter.

Seed on first run:
- The 8 names from constants as UNCLAIMED Players (claimedByUserId = null) — placeholders people claim on login. The roster is open, so more can be added later.
- One Tournament: name "WC2026 Knockouts", width 0.2, stakes from constants, settlementBasis "120min_exclPens".
- Placeholder R32 section-1 games with makers in this exact order (teams will be filled by fixture sync later):
  Pascal, Elio, Aida, Matt, Yas, CP, Chris, Manas.

Add a tiny dev-only admin button to reseed. Done when I can see seeded data (8 unclaimed players) in the Convex dashboard.
```

---

### Prompt 2 — Auth & open roster (claim or add)

```
Wire Convex Auth sign-in: email magic link as the primary method (a single email box that sends a sign-in link). Leave a clean slot to add a "Sign in with Apple" button later.

On first login, Splitwise-style roster claim:
- Show the list of UNCLAIMED player names. The user can CLAIM one (links their userId to that Player, sets claimedByUserId) — or pick "I'm not on the list" to ADD a new Player with their own name and claim it.
- A name can be claimed by only one account. Block claiming an already-claimed name.
- Admin can later reassign or rename a claim (with an AuditLog row) in case someone claims the wrong name.
- Flag User.isAdmin = true when email === ADMIN_EMAIL.
- Gate the Admin tab to admins only.

So the game can start before everyone joins: unclaimed names still appear in fixtures/draws, and anyone not logged in by their game just gets the existing defaults (maker 0.0/0.2, taker forced long at offer).

Add a header showing the signed-in player and a sign-out. Protect all Convex mutations so a user can only act as their own claimed player — verify identity server-side from the auth context, never trust a player name sent from the client.
Done when I can claim a seeded name OR add myself as a new one, names can't be double-claimed, and I'm flagged admin.
```

---

### Prompt 3 — Fixture sync from API-Football

```
Integrate API-Football (api-sports.io) on the FREE tier (100 calls/day, 10/min), league=1 season=2026, KNOCKOUT rounds only
(Round of 32, Round of 16, Quarter-finals, Semi-finals, 3rd Place Final, Final — confirm exact round strings from the API).

- Write a Convex action that fetches fixtures and upserts Game rows: fixtureId, gameNo, stage, round, home, away, koUtc (store UTC), status.
- Map round -> stage (R32/R16/QF/SF/3PO/F) and attach the right stake.
- Re-running must update TBD teams and kickoff times as later rounds resolve, without wiping bids/trades already placed.
- Cron: re-sync the fixture LIST just once or twice a day (not continuously) to conserve the daily quota. Cache it so screen loads never call the API.
- Verify the free key can actually read league=1&season=2026 (free plans lack historical seasons, but the current one should work). Print the X-RateLimit headers so I can watch usage.
- Merge synced R32 games with the seeded maker assignments (match by gameNo/order).
Put the API key in env. Done when real R32 fixtures + my maker order appear and I can see remaining-quota in logs.
```

---

### Prompt 4 — Maker quote & taker trade flows (with deadline locks)

```
Implement trading per spec §5 and §7, all enforced SERVER-SIDE using server time vs Game.koUtc:
- Maker mutation: submit a single bid; offer = bid + WIDTH; lock after submit (no edits). Maker cannot trade their own game.
- Taker mutation: BUY (long, priceTaken=offer) or SELL (short, priceTaken=bid); one action per player per game; lock after submit. Stake = stake for the game's stage.
- Deadlines: maker window closes at koUtc - 60min; taker window closes at koUtc. Reject late writes server-side.
- Auto-penalties: at koUtc-60min with no maker rate -> apply default bid 0.0 / offer 0.2 and set defaultedMaker. At koUtc, any non-maker with no trade -> create a forced BUY at offer with forcedLong=true. Implement these inside the settlement/lock path or a short cron.
Write Convex mutations + queries now; UI comes next. Add unit-style checks for the lock logic. Done when locks and penalties behave correctly in tests.
```

---

### Prompt 5 — Desk (home) screen

```
Build the Desk tab, mobile-first, realtime (Convex subscriptions). Per spec §9.2:
- Equity curve as the signature element: cumulative £ P&L per player across settled games, one line each (use Recharts). Empty state before any settle.
- Standings table sorted by net £, colour +/-, leader marked.
- "Up next": next 3 unsettled games with countdown to KO and current rate (or "no rate yet").
Reuse the colour-per-player palette. Done when it updates live as data changes.
```

---

### Prompt 6 — Games screens

```
Build the Games tab per spec §9.3, realtime:
- List grouped by stage with status badges (Scheduled/Open/Closed/Settled), rate, and score if settled.
  - For in-play games, show the **live score** (from the latest 10-min poll) ticking until the final whistle.
- Detail view with role-aware actions:
  * maker (rate not yet in, window open): enter bid, see auto offer, submit, then locked.
  * taker (rate exists, before KO): BUY @ offer / SELL @ bid, one tap with confirm, then show my position locked.
  * after KO / settled: show the book (everyone's side + P&L), supremacy, and "still to trade" list before KO.
Disable actions correctly based on the server-side windows. Done when a maker and takers can complete a full game on phones.
```

---

### Prompt 7 — Settlement cron + admin confirm + audit

```
Implement a LIVE score feed + fully automatic settlement per spec §3 and §8, on the free API tier — no manual input or verification for normal games:
- One global Convex cron every 10 minutes. On each tick: find games where now >= koUtc and status is not final; for each, call /fixtures?id= once (stays under 10/min). Store the latest score so the app shows a live, ticking scoreboard for in-play games.
- When a game's status is FT/AET/PEN, read the score AFTER EXTRA TIME excluding penalties — API-Football `goals` object (FT => 90', AET => 120', PEN => the 120' draw; ignore score.penalty). Verify against live data.
- Auto-settle: write settleHome/settleAway, compute P&L per spec §5 (taker pnl, maker pnl = -sum takers), set status SETTLED, recompute standings, push realtime, notify. No admin confirm required.
- Robustness without manual verify: only settle on a final status, and only when the score is identical across two consecutive polls (ignore transients). Keep polling at 10-min cadence until a final status appears, so a delayed feed just settles slightly later — still hands-off. Log the source score on every settlement.
- Optional admin override (rare): admin can re-settle or VOID a game with a reason, and there's an emergency manual score entry — but nothing requires admin action for normal settlement.
- Track X-RateLimit-Remaining and back off gracefully if it ever runs low.
Done when an in-play game shows a live score and a finished game settles itself end-to-end with no input from me.
```

---

### Prompt 8 — Splitwise settlement ledger

```
Build the Settle tab: a live Splitwise-style ledger (no in-app payments — this just tells us who pays whom).
- Net balance per player = their total P&L across settled games, rounded to whole £. Since the game is zero-sum, balances sum to 0 — assert this and handle any ±£1 rounding residual gracefully.
- Minimal-transfer simplification: greedily match the largest creditor with the largest debtor, transfer min(|debtor|, creditor), record "Debtor pays Creditor £X", repeat until all ~0. Show the resulting list of transfers.
- Show both: live running version (updates as games settle) and a per-stage breakdown.
- Optional: let me (admin) mark a transfer as "paid" to track real-world settlement; keep an audit row.
- A "Final settle" admin action that snapshots the current ledger as the official end-of-tournament result.
Done when the tab shows correct net balances and the fewest transfers to clear them.
```

---

### Prompt 9 — Admin tools

```
Build the Admin tab (admins only):
- Settle/override/void controls (reuse §7) and the audit log viewer.
- Maker-draw helper per stage (spec §6): R32 two random sections of 8 (each player x2); R16 one random 8; QF = bottom 4 by P&L after R16; SF/Final/3PO = remaining 4 assigned in order of standing. Propose an assignment, let me drag/override, then lock.
- Manage roster: add a name, rename, remove an unclaimed name, and reassign/clear a claim if someone grabbed the wrong one.
- Edit stakes, and edit a fixture's teams/KO if the feed is wrong.
Everything mutating writes an AuditLog row. Done when I can run each stage's draw and fix bad data.
```

---

### Prompt 10 — PWA + reminders

```
Make it an installable PWA: web manifest, icons (generate a simple crest-style icon set), service worker, offline shell. Lighthouse PWA score >= 80.
Add reminders (web push where supported): "you're the maker, rate due in 90 min", "trade closes at KO in 30 min", "game settled — your P&L". Store per-user notification prefs.
Done when I can install it to my home screen and receive a test reminder.
```

---

### Prompt 11 — Capacitor wrap + store builds

```
Wrap the PWA as native apps with Capacitor (keep the one web codebase) per spec §11:
- Add iOS + Android, configure appId/appName, point webDir at the build output.
- Add @capacitor/push-notifications (native push — this is what gets the iOS build past Apple Guideline 4.2) and @capacitor/preferences.
- Generate store assets (icons, splash) and a submission checklist for both stores.
- Frame the listing as a prediction/scorekeeping game with NO in-app payments.
Give me step-by-step instructions for Xcode (needs a Mac + £79/yr Apple account) and Android Studio (£20 one-time Google account), including TWA option for Play via PWABuilder if I want the quicker Android route.
Done when I have buildable iOS/Android projects and a clear submission checklist.
```

---

### After it's live
- Confirm the three group rules in the app's Rules screen (120' / pens-as-draw settlement, QF £30, admin = you).
- Do a dry-run game with fake data before the first real R32 settle.
- Web link can go out to the group **today**; store apps follow once Apple/Google review clears (days).
