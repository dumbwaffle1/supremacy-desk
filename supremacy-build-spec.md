# Supremacy Desk — Build Spec (hand to Claude Code)

A real-money-stakes goal-supremacy trading game for 8 friends, run over the
2026 World Cup **knockout phase** (R32 → Final). Replaces the old spreadsheet
entirely. Web-first today; native app-store builds later.

> This is a private friends' scorekeeping ledger. It records markets, trades and
> P&L; it does **not** process payments — cash is settled offline between players.
> See "Legal / store policy" before publishing to stores.

---

## 1. Goals & constraints

- 8 known players (current roster: Pascal, Elio, Aida, Matt, Yas, CP, Chris, Manas).
- One **maker** per game quotes a two-way price on **home supremacy**; everyone
  else **buys** or **sells**. Maker faces all takers. Zero-sum per game.
- **Auto-settlement** from a live football feed — no manual scraping.
- Live leaderboard + equity curve, updating in real time for all players.
- Roll out **today** (before tonight's 20:00 GMT R32 kickoff) as a shareable link.
- Native iOS/Android apps as a fast-follow.
- Single developer building via Claude Code. TypeScript/React.

---

## 2. Recommended stack (with rationale + alternatives)

| Layer | Pick | Why | Alternative |
|---|---|---|---|
| Frontend | **Next.js (React) + TypeScript** | Claude Code-friendly, one codebase reused for the native wrapper | Vite + React |
| Styling/UI | **Tailwind CSS + shadcn/ui** + Recharts | Fast, clean, mobile-first; Recharts already proven for the equity curve | v0.dev to generate screens |
| Backend/DB | **Convex** | Real-time **by default** (live markets + leaderboard with no socket glue), end-to-end TS, built-in scheduled functions/cron for settlement, generous free tier, strong AI/Claude-Code DX | **Supabase** (Postgres + RLS + magic-link auth + MCP) — pick this if you prefer SQL and want the most battle-tested auth and auditability for a cash game |
| Auth | **Convex Auth** (email magic link + Sign in with Apple) | 8 known users, attributable trades, no passwords; one vendor alongside the Convex backend | Clerk or Supabase Auth (both also give Apple + email) |
| Hosting | **Vercel** (Hobby/free) | Native Next.js, instant deploys, preview URLs to share today | Netlify / Cloudflare Pages |
| Football data | **API-Football (api-sports.io) — FREE tier** | Covers the current WC 2026 season (`league=1&season=2026`); free plan = 100 calls/day + 10/min, all endpoints. Enough because we poll only near full time, not live (see §3) | Manual score entry (zero API) · TheSportsDB free · Sportmonks/TheStatsAPI if you ever want a paid live feed |

**Why Convex over Supabase here:** the whole UX is live ("still to trade",
markets ticking, leaderboard moving). Convex makes that the default and removes
the most code. **Why you might still pick Supabase:** it's Postgres with
row-level security, which is nice for a money ledger you want to audit and export,
and its auth is the most road-tested. Both are free-tier-viable for 8 users.
*(One Supabase gotcha: free projects pause after ~7 days of inactivity — keep it
pinged during the tournament, or use Convex.)*

**Estimated cost: £0.** Convex + Vercel + Convex Auth (email via a free sender like
Resend) + API-Football **free tier** all sit inside free limits at this scale. The
free scores tier works only because we poll near full time, not live (§3 & §8); if
that ever feels tight, API-Football Pro is ~£15–20/mo, but it isn't needed.
Native apps later add £79/yr Apple + £20 once Google. Optional domain ~£10/yr (the
free `*.vercel.app` URL is fine to share).

---

## 3. Football data: the settlement-critical detail

- Endpoint: `GET /fixtures?league=1&season=2026` for fixtures; `/fixtures?id=…`
  for a single match. The current season is on the free tier (free plans only lack
  deep *historical* seasons — verify your free key reads `league=1&season=2026`).
- **Live scores on the free tier (100/day, 10/min):** poll each match every
  **~10 min while it's in play** (status 1H/HT/2H/ET/BT/P), from kickoff until status
  is FT/AET/PEN — then settle and stop. ~12–15 calls per game; a 4-game knockout day
  ≈ 60 calls plus one daily fixture sync, comfortably under 100. The app shows the
  running score from the last poll (read from the DB, so screen loads cost nothing)
  and **auto-settles on the final whistle — no manual step.** Cache the fixture list
  and standings so refreshes never spend a call. (Free tier = current season only,
  which is all we need; verify the key reads `league=1&season=2026`.)
- **Supremacy settles on the score after EXTRA TIME (120'), excluding the penalty
  shootout. A game that goes to penalties = a draw (supremacy 0).** Extra-time goals
  count; shootout goals never do.
  In API-Football use the main `goals` object (home/away) — it holds the final score
  after extra time and excludes the shootout. By status: FT → 90' score; AET → 120'
  score; PEN → the 120' draw (shootout winner sits in `score.penalty`, which we
  ignore). So `S = goals.home − goals.away` works for all three.
  *Verify these field semantics against the live API before go-live — don't settle
  cash off an assumption.*
- Filter knockout rounds via the `round` string (e.g. "Round of 32", "Round of 16",
  "Quarter-finals", "Semi-finals", "3rd Place Final", "Final" — confirm exact
  strings from the API). Teams show as TBD until prior rounds resolve; re-sync to fill them.
- **Cross-check before locking settlement.** Treat the feed as authoritative but
  require an admin confirm/override window (see §8) so an API glitch can't
  mis-pay real money.

---

## 4. Data model

```
User        { id, email, displayName, playerName, isAdmin, createdAt }
Player      { id, name, claimedByUserId|null, addedByUserId, createdAt }  // open roster: a name can exist unclaimed, then a login claims it (or adds a new name)
Tournament  { id, name, width=0.2, stakes:{R32,R16,QF,SF,"3PO",F}, settlementBasis:"120min_exclPens" }
Game        {
  id, fixtureId(api), gameNo, stage, round,
  home, away, koUtc, status,                  // status: SCHEDULED|LIVE|FT|SETTLED|VOID
  makerPlayer,
  bid, offer, makerSubmittedAt,               // offer = bid + width
  settleHome, settleAway, settledAt,          // post-extra-time score used to settle (pens excluded)
  defaultedMaker:boolean
}
Trade       {
  id, gameId, player, side:"BUY"|"SELL",
  priceTaken,                                 // BUY=offer, SELL=bid (snapshot at submit)
  stake, submittedAt, forcedLong:boolean,
  pnl                                         // filled at settlement
}
AuditLog    { id, ts, actor, action, gameId, before, after }  // every settle/override/edit
```

Standings = sum of `Trade.pnl` (taker) and maker P&L per player across SETTLED games.
Keep it **derived** (recompute from trades) so re-settles are always correct;
optionally cache for speed.

---

## 5. Core game logic (pseudocode)

```ts
// width fixed (default 0.2)
offer = round2(bid + tournament.width)

// settlement, per game, on the post-extra-time score (penalties excluded)
S = game.settleHome - game.settleAway       // from API `goals`; PEN => draw => S = 0
for (t of takersOf(game)) {
  t.pnl = t.side === "BUY"
        ? (S - game.offer) * stakeFor(game.stage)
        : (game.bid - S) * stakeFor(game.stage)
}
makerPnl = -sum(takers.map(t => t.pnl))       // maker is counterparty to everyone
```

Worked example (England v France quoted 0.0 / 0.2):
- BUY @ 0.2, ends 3–1 (S=+2) → +1.8 / goal
- SELL @ 0.0, ends 0–1 (S=−1) → +1.0 / goal

Constraints: maker cannot trade their own game; each player one action per game,
**locked once submitted** (no edits — core to the rules).

Stakes by stage (£/goal): R32 **10**, R16 **20**, QF **30**, SF **50**,
3rd-place **50**, Final **100**.

---

## 6. Maker rotation per stage

Don't fully automate the draw — give admin a helper + manual override (a human
runs the real draw). Encode these stage rules:

- **R32 (16 games):** random draw in two sections of 8 → each player makes 2.
  (Your printout = section 1: Pascal, Elio, Aida, Matt, Yas, CP, Chris, Manas.)
- **R16 (8 games):** one random draw of 8 → each player makes 1.
- **QF (4 games):** the **bottom 4 by P&L after R16** are assigned to make.
- **SF (2) + Final (1) + 3rd-place (1):** the **remaining 4** make these,
  assigned in order (define the order rule, e.g. by standing).

Admin screen: "Run draw for stage X" → proposes assignment → admin can drag/override → lock.

> **Open roster + draws:** the roster can grow (people claim a seeded name or add
> themselves), so **lock the roster for a stage before running that stage's draw**.
> Anyone not yet logged in by their assigned game simply gets the existing defaults —
> maker → 0.0/0.2, taker → forced long at offer — so the game can start without
> waiting for everyone to join.

---

## 7. Deadlines & automated penalties

Use **server time** vs **API kickoff time** (never trust the client clock for a cash game).

- **Maker rate due ≥ 60 min before KO.** If none submitted by then → auto-apply
  default **0.0 / 0.2** and flag `defaultedMaker`.
- **Taker submission due before KO.** Any non-maker player with no trade at KO →
  auto-create a **forced long at the offer** (`forcedLong: true`).
- Lock all writes for a game server-side once `now >= koUtc` (takers) / `koUtc-60m` (maker).

---

## 8. Settlement job, real-time & disputes

- **Cron (one global 10-min tick):** on each tick, find games where `now >= koUtc`
  and status not final; call `/fixtures?id=…` once per such game (well within 10/min).
  Store the latest score so the app shows a live feed. When status ∈ {FT, AET, PEN},
  read the `goals` object (post-ET, shootout excluded), write `settleHome/settleAway`,
  settle per §5, set `status = SETTLED`, recompute standings, push real-time, notify.
  **No manual step.**
- **Robust without manual verify:** settle only on a final status, and only once the
  score is identical across two consecutive polls (ignore a transient). Log the source
  score. Keep polling at the 10-min cadence until a final status appears, so a delayed
  feed just means a slightly later auto-settle — still hands-off.
- **Admin override (optional, rare):** admin *can* re-settle or VOID a game with a
  reason if the feed ever gets it wrong, but nothing requires admin action for normal
  settlement. A manual score entry stays available as an emergency fallback only.
- **Real-time:** markets, "still to trade", standings and equity curve update live
  for everyone (Convex subscriptions, or Supabase realtime channels).

---

## 9. Screens (mobile-first)

1. **Login** — email magic link or Sign in with Apple; on first login, **claim an
   existing unclaimed name or add yourself as a new one** (Splitwise-style open roster).
2. **Desk (home)** — equity curve (signature), standings (£), "up next" with
   countdowns and current rates.
3. **Games** — list by stage; tap a game:
   - maker: enter bid (offer auto = bid+0.2), submit, locked;
   - taker: BUY @ offer / SELL @ bid, one tap, locked; shows your position + the book + "still to trade";
   - settled: score, supremacy, per-player P&L.
4. **Rules** — how the market works, stakes, timing, format.
5. **Admin** (gated) — settle/override/void, run maker draws, set stakes, manage roster, audit log.

---

## 10. Roll-out-TODAY sequencing (before 20:00 GMT KO)

You only need **submission** working before kickoff; settlement is needed hours
later. So ship in this order:

1. **Now → KO:** auth + fixtures synced + maker/taker submission + live leaderboard,
   deployed to Vercel, link shared. Manual settle button as a stopgap.
2. **After KO (tonight):** wire API-Football auto-settlement + cron + admin confirm.
3. **This week:** notifications (kickoff/rate reminders), maker-draw helper, polish.
4. **Fast-follow:** native app wrappers (§11).

---

## 11. App Store / Play Store path

- **Google Play (easy):** publish the PWA via **Trusted Web Activity** (Bubblewrap
  or PWABuilder). Needs web manifest + service worker + HTTPS + Lighthouse ≥ 80 +
  Digital Asset Links. One-time **£20** developer fee.
- **Apple (stricter):** **no PWAs**; needs a native binary, and Guideline **4.2**
  rejects "repackaged websites." **Wrap with Capacitor** (keeps your React
  codebase, often a few hours) and add **genuine native features** — push
  notifications, offline, native navigation — so it clears 4.2. Apple dev account **£79/yr**.
- **Tooling:** **Capacitor** = primary (wrap the existing web app, one codebase,
  add `@capacitor/push-notifications` + `@capacitor/preferences`). **Expo/React
  Native** = alternative if you want a truly native app and don't mind a separate
  front-end (best store acceptance). **PWABuilder** = great for the Play TWA, but
  its iOS output often fails Apple review — don't rely on it for Apple. Paid
  services (Median.co, MobiLoud) will wrap + handle submission if you'd rather not.
- Build the web app as a clean **PWA** from day one (manifest, icons, service
  worker) so all of the above is a wrap, not a rewrite.

### Legal / store policy (read this)
Real-money gaming is heavily restricted on both stores and varies by country.
This app is safest framed and built as a **prediction / scorekeeping ledger with
no in-app payments** (players settle cash offline themselves). If you ever want
real-money handling *and* public store distribution, that crosses into gambling
licensing — out of scope for a mates' game, and you'd need proper advice.
I'm not a lawyer; treat this as a flag, not legal advice.

---

## 12. Open decisions to ratify with the group (settle before go-live)

1. **Settlement basis** — RATIFIED: supremacy settles on the **score after extra
   time (120')**, with the **penalty shootout excluded** (a shootout = a draw, S=0).
2. **QF stake** — the spreadsheet left it as a placeholder. Set the £/goal.
3. **Admin** — who holds settle/override rights (you?), and the SF/Final/3PO
   maker-ordering rule for the final four.

---

## 13. Suggested build order for Claude Code

1. Scaffold Next.js + Tailwind + shadcn/ui + Convex (or Supabase); deploy empty app to Vercel.
2. Auth + player-seat mapping.
3. Fixture sync from API-Football (knockout rounds only) → Game rows.
4. Maker quote + taker trade flows with server-side deadline locks.
5. Desk screen: standings + equity curve (Recharts), real-time.
6. Settlement cron + admin confirm/override + audit log.
7. Maker-draw helper per stage.
8. PWA manifest/icons/service worker → Capacitor wrap → store submissions.
