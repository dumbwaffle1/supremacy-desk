import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";

/* ============================================================
   Supremacy Desk — World Cup goal-supremacy trading
   Multiplayer MVP using artifact shared storage.
   Market = HOME goals − AWAY goals. Width fixed (default 0.2).
   Maker quotes one two-way price; takers Buy (lift offer) or
   Sell (hit bid). Maker faces everyone. Zero-sum per game.
   ============================================================ */

const PLAYERS = ["Pascal", "Elio", "Aida", "Matt", "Yas", "CP", "Chris", "Manas"];

const COLORS = {
  Pascal: "#ef4444", Elio: "#f59e0b", Aida: "#ec4899", Matt: "#a78bfa",
  Yas: "#38bdf8", CP: "#34d399", Chris: "#2dd4bf", Manas: "#facc15",
};

const STAGE_LABEL = { R32: "R32", R16: "R16", QF: "QF", SF: "SF", "3PO": "3rd PO", F: "Final" };
const DEFAULT_STAKES = { R32: 10, R16: 20, QF: 30, SF: 50, "3PO": 50, F: 100 };

const SEED_GAMES = [
  { gameNo: 1, dateLabel: "Sun 28 Jun", ko: "2026-06-28T20:00:00Z", stage: "R32", home: "South Africa", away: "Canada", maker: "Pascal" },
  { gameNo: 2, dateLabel: "Mon 29 Jun", ko: "2026-06-29T18:00:00Z", stage: "R32", home: "Brazil", away: "Japan", maker: "Elio" },
  { gameNo: 3, dateLabel: "Mon 29 Jun", ko: "2026-06-29T21:30:00Z", stage: "R32", home: "Germany", away: "TBD", maker: "Aida" },
  { gameNo: 4, dateLabel: "Tue 30 Jun", ko: "2026-06-30T02:00:00Z", stage: "R32", home: "Netherlands", away: "Morocco", maker: "Matt" },
  { gameNo: 5, dateLabel: "Tue 30 Jun", ko: "2026-06-30T18:00:00Z", stage: "R32", home: "Ivory Coast", away: "TBD", maker: "Yas" },
  { gameNo: 6, dateLabel: "Tue 30 Jun", ko: "2026-06-30T22:00:00Z", stage: "R32", home: "TBD", away: "TBD", maker: "CP" },
  { gameNo: 7, dateLabel: "Wed 01 Jul", ko: "2026-07-01T02:00:00Z", stage: "R32", home: "Mexico", away: "TBD", maker: "Chris" },
  { gameNo: 8, dateLabel: "Wed 01 Jul", ko: "2026-07-01T17:00:00Z", stage: "R32", home: "TBD", away: "TBD", maker: "Manas" },
];

const K = {
  config: "sup:config",
  index: "sup:gameIndex",
  game: (id) => `sup:game:${id}`,
  me: "sup:me", // personal (per device)
};

/* ---------- storage helpers ---------- */
async function sget(key, shared = true) {
  try { const r = await window.storage.get(key, shared); return r ? JSON.parse(r.value) : null; }
  catch (e) { return null; }
}
async function sset(key, val, shared = true) {
  try { await window.storage.set(key, JSON.stringify(val), shared); return true; }
  catch (e) { console.error("storage.set", e); return false; }
}

/* ---------- maths ---------- */
function tradePnl(trade, supremacy, bid, offer) {
  // long (buy) bought at offer; short (sell) sold at bid
  if (trade.side === "buy") return (supremacy - offer) * trade.stake;
  return (bid - supremacy) * trade.stake;
}

function computeStandings(games) {
  const cum = Object.fromEntries(PLAYERS.map((p) => [p, 0]));
  const curve = [];
  const settled = games.filter((g) => g.settled).sort((a, b) => a.gameNo - b.gameNo);
  for (const g of settled) {
    const S = g.homeScore - g.awayScore;
    let makerPnl = 0;
    const trades = g.trades || {};
    for (const [p, t] of Object.entries(trades)) {
      if (p === g.maker) continue;
      const pnl = tradePnl(t, S, g.bid, g.offer);
      cum[p] = (cum[p] ?? 0) + pnl;
      makerPnl -= pnl;
    }
    cum[g.maker] = (cum[g.maker] ?? 0) + makerPnl;
    curve.push({ label: `G${g.gameNo}`, ...PLAYERS.reduce((o, p) => ((o[p] = Math.round(cum[p])), o), {}) });
  }
  return { cum, curve, settledCount: settled.length };
}

/* ---------- time helpers ---------- */
function fmtKO(iso) {
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat("en-GB", {
      weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
      timeZone: "Europe/London",
    }).format(d) + " UK";
  } catch { return iso; }
}
function gameStatus(g, now) {
  const ko = new Date(g.ko).getTime();
  if (g.settled) return "settled";
  if (now >= ko) return "live"; // kicked off, trading closed
  return "open";
}
function countdown(iso, now) {
  let ms = new Date(iso).getTime() - now;
  if (ms <= 0) return "kicked off";
  const h = Math.floor(ms / 3.6e6); ms -= h * 3.6e6;
  const m = Math.floor(ms / 6e4);
  if (h > 48) return `${Math.floor(h / 24)}d`;
  return `${h}h ${m}m`;
}

/* ============================================================ */
export default function App() {
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState(null);
  const [games, setGames] = useState([]);
  const [me, setMe] = useState(null);
  const [tab, setTab] = useState("desk");
  const [now, setNow] = useState(Date.now());
  const [adminOK, setAdminOK] = useState(false);
  const [toast, setToast] = useState(null);

  const flash = useCallback((m) => { setToast(m); setTimeout(() => setToast(null), 2200); }, []);

  const loadAll = useCallback(async () => {
    let cfg = await sget(K.config);
    if (!cfg) {
      cfg = { width: 0.2, stakes: DEFAULT_STAKES, adminPin: "1966", seeded: true };
      await sset(K.config, cfg);
      const ids = [];
      for (const g of SEED_GAMES) {
        const id = `g${g.gameNo}`;
        ids.push(id);
        await sset(K.game(id), { id, ...g, bid: null, offer: null, homeScore: null, awayScore: null, settled: false, trades: {} });
      }
      await sset(K.index, ids);
    }
    const idx = (await sget(K.index)) || [];
    const gs = [];
    for (const id of idx) { const g = await sget(K.game(id)); if (g) gs.push(g); }
    gs.sort((a, b) => a.gameNo - b.gameNo);
    setConfig(cfg); setGames(gs);
  }, []);

  useEffect(() => {
    (async () => {
      const savedMe = await sget(K.me, false);
      if (savedMe) setMe(savedMe);
      await loadAll();
      setLoading(false);
    })();
  }, [loadAll]);

  // light polling + clock
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000 * 30);
    const p = setInterval(() => { loadAll(); }, 12000);
    return () => { clearInterval(t); clearInterval(p); };
  }, [loadAll]);

  const standings = useMemo(() => computeStandings(games), [games]);

  const pickMe = async (name) => { setMe(name); await sset(K.me, name, false); };

  /* mutations */
  const submitQuote = async (id, bid) => {
    const g = await sget(K.game(id)); if (!g) return;
    const b = Math.round(bid * 100) / 100;
    g.bid = b; g.offer = Math.round((b + config.width) * 100) / 100;
    await sset(K.game(id), g); await loadAll(); flash("Market submitted");
  };
  const submitTrade = async (id, side) => {
    const g = await sget(K.game(id)); if (!g) return;
    g.trades = g.trades || {};
    if (g.trades[me]) return flash("You already traded this game");
    const stake = config.stakes[g.stage] ?? 10;
    g.trades[me] = { side, stake, ts: Date.now() };
    await sset(K.game(id), g); await loadAll();
    flash(side === "buy" ? `Bought home @ ${g.offer}` : `Sold home @ ${g.bid}`);
  };
  const settleGame = async (id, hs, as_) => {
    const g = await sget(K.game(id)); if (!g) return;
    g.homeScore = hs; g.awayScore = as_; g.settled = true;
    await sset(K.game(id), g); await loadAll(); flash(`Settled ${g.home} ${hs}-${as_} ${g.away}`);
  };
  const editGame = async (id, patch) => {
    const g = await sget(K.game(id)); if (!g) return;
    Object.assign(g, patch);
    await sset(K.game(id), g); await loadAll();
  };
  const setStake = async (stage, val) => {
    const cfg = { ...config, stakes: { ...config.stakes, [stage]: val } };
    await sset(K.config, cfg); setConfig(cfg);
  };
  const hardReset = async () => {
    for (const g of games) await sset(K.game(g.id), null);
    await sset(K.index, null); await sset(K.config, null);
    await loadAll(); flash("Reset to seed");
  };

  if (loading)
    return (
      <div className="min-h-screen bg-neutral-950 text-neutral-400 flex items-center justify-center font-mono text-sm">
        loading desk…
      </div>
    );

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100" style={{ fontFamily: "ui-sans-serif, system-ui, sans-serif" }}>
      {/* identity gate */}
      {!me && (
        <div className="fixed inset-0 z-50 bg-neutral-950/95 flex flex-col items-center justify-center p-6">
          <div className="text-emerald-400 font-mono text-xs tracking-[0.3em] mb-2">SUPREMACY DESK</div>
          <h1 className="text-2xl font-bold mb-1">Who are you?</h1>
          <p className="text-neutral-500 text-sm mb-6">Pick your seat at the desk.</p>
          <div className="grid grid-cols-2 gap-2 w-full max-w-xs">
            {PLAYERS.map((p) => (
              <button key={p} onClick={() => pickMe(p)}
                className="py-3 rounded-lg border border-neutral-800 hover:border-emerald-500 hover:bg-neutral-900 font-mono"
                style={{ color: COLORS[p] }}>{p}</button>
            ))}
          </div>
        </div>
      )}

      {/* header */}
      <header className="sticky top-0 z-40 bg-neutral-950/90 backdrop-blur border-b border-neutral-800 px-4 py-3 flex items-center justify-between">
        <div>
          <div className="text-emerald-400 font-mono text-[10px] tracking-[0.3em]">SUPREMACY DESK</div>
          <div className="text-xs text-neutral-500 font-mono">World Cup 2026 · {standings.settledCount} settled</div>
        </div>
        <button onClick={() => setMe(null)} className="font-mono text-sm px-3 py-1.5 rounded-md border border-neutral-800"
          style={{ color: me ? COLORS[me] : "#fff" }}>
          {me} ▾
        </button>
      </header>

      {/* tabs */}
      <nav className="flex border-b border-neutral-800 text-sm font-mono">
        {[["desk", "Desk"], ["games", "Games"], ["rules", "Rules"], ["admin", "Admin"]].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`flex-1 py-3 ${tab === k ? "text-emerald-400 border-b-2 border-emerald-400" : "text-neutral-500"}`}>
            {l}
          </button>
        ))}
      </nav>

      <main className="max-w-2xl mx-auto p-4 pb-24">
        {tab === "desk" && <Desk standings={standings} games={games} now={now} />}
        {tab === "games" && (
          <Games games={games} me={me} now={now} config={config}
            onQuote={submitQuote} onTrade={submitTrade} />
        )}
        {tab === "rules" && <Rules config={config} />}
        {tab === "admin" && (
          <Admin config={config} games={games} adminOK={adminOK} setAdminOK={setAdminOK}
            onSettle={settleGame} onEdit={editGame} onStake={setStake} onReset={hardReset} flash={flash} />
        )}
      </main>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-emerald-500 text-neutral-950 font-mono text-sm px-4 py-2 rounded-full shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}

/* ---------------- Desk (leaderboard + equity curve) ---------------- */
function Desk({ standings, games, now }) {
  const ranked = [...PLAYERS].sort((a, b) => (standings.cum[b] ?? 0) - (standings.cum[a] ?? 0));
  const next = games
    .filter((g) => !g.settled)
    .sort((a, b) => new Date(a.ko) - new Date(b.ko))
    .slice(0, 3);

  return (
    <div className="space-y-6">
      {/* equity curve — the signature */}
      <section>
        <h2 className="font-mono text-xs text-neutral-500 tracking-widest mb-2">EQUITY CURVE · £</h2>
        <div className="h-56 bg-neutral-900/50 rounded-xl border border-neutral-800 p-2">
          {standings.curve.length === 0 ? (
            <div className="h-full flex items-center justify-center text-neutral-600 font-mono text-sm">
              No settled games yet — curve starts after the first result.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={standings.curve} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                <CartesianGrid stroke="#262626" strokeDasharray="2 4" />
                <XAxis dataKey="label" tick={{ fill: "#737373", fontSize: 10 }} />
                <YAxis tick={{ fill: "#737373", fontSize: 10 }} />
                <Tooltip contentStyle={{ background: "#0a0a0a", border: "1px solid #262626", fontSize: 12 }} />
                {PLAYERS.map((p) => (
                  <Line key={p} type="monotone" dataKey={p} stroke={COLORS[p]} dot={false} strokeWidth={2} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      {/* standings */}
      <section>
        <h2 className="font-mono text-xs text-neutral-500 tracking-widest mb-2">STANDINGS · £</h2>
        <div className="rounded-xl border border-neutral-800 overflow-hidden">
          {ranked.map((p, i) => {
            const v = Math.round(standings.cum[p] ?? 0);
            return (
              <div key={p} className="flex items-center justify-between px-4 py-3 border-b border-neutral-900 last:border-0">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-neutral-600 w-5">{i + 1}</span>
                  <span className="w-2 h-2 rounded-full" style={{ background: COLORS[p] }} />
                  <span className="font-medium">{p}</span>
                  {i === 0 && standings.settledCount > 0 && <span className="text-[10px] font-mono text-emerald-400">🍴 buys lunch</span>}
                </div>
                <span className={`font-mono tabular-nums ${v > 0 ? "text-emerald-400" : v < 0 ? "text-red-400" : "text-neutral-500"}`}>
                  {v > 0 ? "+" : ""}{v}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {/* up next */}
      {next.length > 0 && (
        <section>
          <h2 className="font-mono text-xs text-neutral-500 tracking-widest mb-2">UP NEXT</h2>
          <div className="space-y-2">
            {next.map((g) => (
              <div key={g.id} className="flex items-center justify-between bg-neutral-900/50 rounded-lg border border-neutral-800 px-4 py-2.5">
                <div className="text-sm">
                  <span className="font-medium">{g.home}</span>
                  <span className="text-neutral-600"> v </span>
                  <span className="font-medium">{g.away}</span>
                  <div className="text-[11px] text-neutral-500 font-mono">maker: {g.maker}</div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-xs text-neutral-400">{countdown(g.ko, now)}</div>
                  <div className="font-mono text-[11px] text-emerald-400">
                    {g.bid != null ? `${g.bid} / ${g.offer}` : "no rate yet"}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/* ---------------- Games ---------------- */
function Games({ games, me, now, config, onQuote, onTrade }) {
  return (
    <div className="space-y-3">
      {games.map((g) => (
        <GameCard key={g.id} g={g} me={me} now={now} config={config} onQuote={onQuote} onTrade={onTrade} />
      ))}
    </div>
  );
}

function GameCard({ g, me, now, config, onQuote, onTrade }) {
  const [open, setOpen] = useState(false);
  const [bidInput, setBidInput] = useState("");
  const status = gameStatus(g, now);
  const stake = config.stakes[g.stage] ?? 10;
  const isMaker = me === g.maker;
  const myTrade = (g.trades || {})[me];
  const stillToTrade = PLAYERS.filter((p) => p !== g.maker && !(g.trades || {})[p]);
  const supremacy = g.settled ? g.homeScore - g.awayScore : null;

  let myPnl = null;
  if (g.settled) {
    if (isMaker) {
      myPnl = 0;
      for (const [p, t] of Object.entries(g.trades || {})) if (p !== g.maker) myPnl -= tradePnl(t, supremacy, g.bid, g.offer);
    } else if (myTrade) {
      myPnl = tradePnl(myTrade, supremacy, g.bid, g.offer);
    }
  }

  const statusBadge = {
    open: ["OPEN", "text-emerald-400 border-emerald-900 bg-emerald-950/40"],
    live: ["CLOSED", "text-amber-400 border-amber-900 bg-amber-950/40"],
    settled: ["SETTLED", "text-neutral-400 border-neutral-700 bg-neutral-900"],
  }[status];

  return (
    <div className="rounded-xl border border-neutral-800 overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full text-left px-4 py-3 flex items-center justify-between">
        <div>
          <div className="font-mono text-[10px] text-neutral-600">G{g.gameNo} · {STAGE_LABEL[g.stage]} · £{stake}/goal</div>
          <div className="text-sm font-medium">{g.home} <span className="text-neutral-600">v</span> {g.away}</div>
          <div className="text-[11px] text-neutral-500 font-mono mt-0.5">{fmtKO(g.ko)} · maker {g.maker}</div>
        </div>
        <div className="text-right">
          <span className={`font-mono text-[10px] px-2 py-0.5 rounded border ${statusBadge[1]}`}>{statusBadge[0]}</span>
          {g.settled
            ? <div className="font-mono text-sm mt-1">{g.homeScore}-{g.awayScore} <span className="text-neutral-500">({supremacy > 0 ? "+" : ""}{supremacy})</span></div>
            : <div className="font-mono text-emerald-400 text-sm mt-1">{g.bid != null ? `${g.bid}/${g.offer}` : "—"}</div>}
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 border-t border-neutral-900 pt-3 space-y-3">
          {/* maker quoting */}
          {isMaker && g.bid == null && status === "open" && (
            <div className="bg-neutral-900/60 rounded-lg p-3">
              <div className="text-xs text-neutral-400 mb-2">You're the maker. Quote home supremacy ({g.home} − {g.away}). Width is fixed at {config.width}.</div>
              <div className="flex items-center gap-2">
                <input value={bidInput} onChange={(e) => setBidInput(e.target.value)} type="number" step="0.1"
                  placeholder="bid" className="w-24 bg-neutral-950 border border-neutral-700 rounded px-2 py-1.5 font-mono text-sm" />
                <span className="font-mono text-neutral-500 text-sm">
                  offer {bidInput !== "" ? (Math.round((parseFloat(bidInput) + config.width) * 100) / 100) : "—"}
                </span>
                <button onClick={() => bidInput !== "" && onQuote(g.id, parseFloat(bidInput))}
                  className="ml-auto bg-emerald-500 text-neutral-950 font-mono text-sm px-3 py-1.5 rounded">Submit</button>
              </div>
            </div>
          )}
          {isMaker && g.bid == null && status !== "open" && (
            <div className="text-xs text-amber-400 font-mono">No rate submitted before kickoff — admin to apply default (0.0/0.2).</div>
          )}

          {/* taker trading */}
          {!isMaker && g.bid != null && (
            <div>
              {myTrade ? (
                <div className="font-mono text-sm">
                  Your position: {myTrade.side === "buy"
                    ? <span className="text-emerald-400">LONG {g.home} @ {g.offer}</span>
                    : <span className="text-red-400">SHORT {g.home} @ {g.bid}</span>} · £{myTrade.stake}/goal
                  {g.settled && <span className="ml-2 text-neutral-400">→ {myPnl > 0 ? "+" : ""}{Math.round(myPnl)}</span>}
                </div>
              ) : status === "open" ? (
                <div className="flex gap-2">
                  <button onClick={() => onTrade(g.id, "sell")}
                    className="flex-1 border border-red-900 bg-red-950/40 text-red-400 font-mono text-sm py-2.5 rounded-lg">
                    SELL @ {g.bid}
                  </button>
                  <button onClick={() => onTrade(g.id, "buy")}
                    className="flex-1 border border-emerald-900 bg-emerald-950/40 text-emerald-400 font-mono text-sm py-2.5 rounded-lg">
                    BUY @ {g.offer}
                  </button>
                </div>
              ) : (
                <div className="text-xs text-amber-400 font-mono">Trading closed — you didn't submit (rule: forced long @ offer).</div>
              )}
            </div>
          )}
          {!isMaker && g.bid == null && <div className="text-xs text-neutral-500 font-mono">Waiting for {g.maker} to make a rate.</div>}

          {/* book */}
          <div className="text-[11px] font-mono text-neutral-500">
            {Object.keys(g.trades || {}).length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-1">
                {Object.entries(g.trades).map(([p, t]) => (
                  <span key={p} className="px-1.5 py-0.5 rounded bg-neutral-900 border border-neutral-800"
                    style={{ color: COLORS[p] }}>
                    {p} {t.side === "buy" ? "▲" : "▼"}{g.settled ? ` ${Math.round(tradePnl(t, supremacy, g.bid, g.offer)) > 0 ? "+" : ""}${Math.round(tradePnl(t, supremacy, g.bid, g.offer))}` : ""}
                  </span>
                ))}
              </div>
            )}
            {!g.settled && g.bid != null && stillToTrade.length > 0 && <div>still to trade: {stillToTrade.join(", ")}</div>}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- Rules ---------------- */
function Rules({ config }) {
  const Row = ({ k, v }) => (
    <div className="flex justify-between py-2 border-b border-neutral-900 last:border-0">
      <span className="text-neutral-400">{k}</span><span className="font-mono">{v}</span>
    </div>
  );
  return (
    <div className="space-y-5 text-sm">
      <section className="rounded-xl border border-neutral-800 p-4">
        <h2 className="font-semibold mb-2">How the market works</h2>
        <p className="text-neutral-400 leading-relaxed">
          Each game has one <b className="text-neutral-200">maker</b> who quotes a two-way price on
          <b className="text-neutral-200"> home supremacy</b> (home goals − away goals), width {config.width}.
          Everyone else either <span className="text-emerald-400">BUYS</span> at the offer (backs home to win by more)
          or <span className="text-red-400">SELLS</span> at the bid (backs home supremacy to come in below).
          The maker takes the other side of every trade. One action each, no adjusting once submitted.
        </p>
        <p className="text-neutral-500 mt-3 font-mono text-xs">
          Example — England v France quoted 0.0 / 0.2.<br />
          Buy @ 0.2, ends 3-1 (S=+2) → +1.8/goal.<br />
          Sell @ 0.0, ends 0-1 (S=−1) → +1/goal.
        </p>
      </section>
      <section className="rounded-xl border border-neutral-800 p-4">
        <h2 className="font-semibold mb-2">Stakes (£/goal)</h2>
        {Object.entries(config.stakes).map(([k, v]) => <Row key={k} k={STAGE_LABEL[k] || k} v={`£${v}`} />)}
      </section>
      <section className="rounded-xl border border-neutral-800 p-4">
        <h2 className="font-semibold mb-2">Timing & format</h2>
        <p className="text-neutral-400 leading-relaxed">
          Maker rate due ≥1h before kickoff (late = default 0.0/0.2). Takers submit before kickoff
          (late = forced long at the offer). After R16 the bottom 4 make the QFs; after QFs the rest make
          Final / SF / 3rd-place. Top of the standings buys lunch.
        </p>
      </section>
    </div>
  );
}

/* ---------------- Admin ---------------- */
function Admin({ config, games, adminOK, setAdminOK, onSettle, onEdit, onStake, onReset, flash }) {
  const [pin, setPin] = useState("");
  if (!adminOK)
    return (
      <div className="rounded-xl border border-neutral-800 p-6 text-center space-y-3">
        <p className="text-neutral-400 text-sm">Admin actions: enter scores, fix fixtures, set stakes.</p>
        <input value={pin} onChange={(e) => setPin(e.target.value)} type="password" placeholder="PIN"
          className="bg-neutral-950 border border-neutral-700 rounded px-3 py-2 font-mono text-center" />
        <div>
          <button onClick={() => (pin === config.adminPin ? setAdminOK(true) : flash("Wrong PIN"))}
            className="bg-emerald-500 text-neutral-950 font-mono px-4 py-2 rounded">Unlock</button>
        </div>
      </div>
    );
  return (
    <div className="space-y-6">
      <section>
        <h2 className="font-mono text-xs text-neutral-500 tracking-widest mb-2">SETTLE / EDIT GAMES</h2>
        <div className="space-y-2">
          {games.map((g) => <AdminGameRow key={g.id} g={g} onSettle={onSettle} onEdit={onEdit} />)}
        </div>
      </section>
      <section>
        <h2 className="font-mono text-xs text-neutral-500 tracking-widest mb-2">STAKES (£/goal)</h2>
        <div className="grid grid-cols-3 gap-2">
          {Object.entries(config.stakes).map(([k, v]) => (
            <label key={k} className="text-xs">
              <div className="text-neutral-500 mb-1">{STAGE_LABEL[k] || k}</div>
              <input type="number" defaultValue={v} onBlur={(e) => onStake(k, parseInt(e.target.value || "0"))}
                className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1.5 font-mono" />
            </label>
          ))}
        </div>
      </section>
      <button onClick={onReset} className="w-full border border-red-900 text-red-400 font-mono text-sm py-2.5 rounded-lg">
        Reset everything to seed
      </button>
    </div>
  );
}

function AdminGameRow({ g, onSettle, onEdit }) {
  const [hs, setHs] = useState(g.homeScore ?? "");
  const [as_, setAs] = useState(g.awayScore ?? "");
  const [home, setHome] = useState(g.home);
  const [away, setAway] = useState(g.away);
  return (
    <div className="rounded-lg border border-neutral-800 p-3 space-y-2">
      <div className="flex gap-2">
        <input value={home} onChange={(e) => setHome(e.target.value)} onBlur={() => onEdit(g.id, { home })}
          className="flex-1 bg-neutral-950 border border-neutral-800 rounded px-2 py-1 text-sm" />
        <input value={away} onChange={(e) => setAway(e.target.value)} onBlur={() => onEdit(g.id, { away })}
          className="flex-1 bg-neutral-950 border border-neutral-800 rounded px-2 py-1 text-sm" />
      </div>
      <div className="flex items-center gap-2">
        <input type="number" value={hs} onChange={(e) => setHs(e.target.value)} placeholder="H"
          className="w-14 bg-neutral-950 border border-neutral-700 rounded px-2 py-1 font-mono text-center" />
        <span className="text-neutral-600">-</span>
        <input type="number" value={as_} onChange={(e) => setAs(e.target.value)} placeholder="A"
          className="w-14 bg-neutral-950 border border-neutral-700 rounded px-2 py-1 font-mono text-center" />
        <button onClick={() => hs !== "" && as_ !== "" && onSettle(g.id, parseInt(hs), parseInt(as_))}
          className="ml-auto bg-emerald-500 text-neutral-950 font-mono text-sm px-3 py-1.5 rounded">
          {g.settled ? "Re-settle" : "Settle"}
        </button>
      </div>
      {g.bid == null && (
        <button onClick={() => onEdit(g.id, { bid: 0, offer: 0.2 })} className="text-[11px] font-mono text-amber-400">
          apply default rate 0.0/0.2 (late maker)
        </button>
      )}
    </div>
  );
}
