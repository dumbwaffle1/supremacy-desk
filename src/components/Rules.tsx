"use client";

import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { STAGES, STAGE_LABEL, type Stage } from "@/config/constants";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="panel rounded-2xl p-5">
      <h2 className="text-sm font-semibold">{title}</h2>
      <div className="mt-2 space-y-2 text-sm leading-relaxed text-muted-foreground">
        {children}
      </div>
    </div>
  );
}

export function Rules({ leagueId }: { leagueId: string }) {
  const league = useQuery(api.leagues.get, {
    leagueId: leagueId as Id<"leagues">,
  });
  const width = league?.width ?? 0.2;
  const stakes = league?.stakes;
  const r2 = (n: number) => Math.round(n * 100) / 100;

  type Ex = {
    team: string;
    stage: Stage;
    side: "BUY" | "SELL";
    bid: number;
    sup: number;
    result: string;
    lesson: string;
  };
  const examples: Ex[] = [
    {
      team: "Brazil",
      stage: "R32",
      side: "BUY",
      bid: 0,
      sup: 2,
      result: "Brazil win 3–1 (supremacy +2)",
      lesson: "Bought a toss-up, they won comfortably — well past the price.",
    },
    {
      team: "Spain",
      stage: "R16",
      side: "BUY",
      bid: 1.0,
      sup: 1,
      result: "Spain win 1–0 (supremacy +1)",
      lesson: "They won — but by less than you paid for, so the BUY still loses.",
    },
    {
      team: "France",
      stage: "QF",
      side: "SELL",
      bid: 2.9,
      sup: 5,
      result: "France win 5–0 (supremacy +5)",
      lesson:
        "Sold thinking 2.9 was too generous — they romped, so a SELL can lose more than the stake.",
    },
    {
      team: "England",
      stage: "F",
      side: "BUY",
      bid: 0.5,
      sup: 0,
      result: "1–1 after extra time, won on penalties (supremacy 0)",
      lesson:
        "A shootout counts as a draw (supremacy 0) — England lift the cup, but you bought at 0.7, so the trade still loses.",
    },
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Rules</h1>

      <Section title="The market">
        <p>
          Each game has one <span className="text-foreground">maker</span>, who quotes a
          two-way price on a team&apos;s{" "}
          <span className="text-foreground">supremacy</span> — their final goals minus
          the opponent&apos;s. The lower price is the{" "}
          <span className="text-foreground">bid</span>; the higher is the{" "}
          <span className="text-foreground">offer</span> (bid + {width}).
        </p>
        <p>
          Everyone else trades against that quote:
        </p>
        <ul className="ml-1 list-none space-y-1">
          <li>
            <span className="font-semibold text-up">BUY</span> at the offer if you think
            the team will <span className="text-foreground">win by more</span> than the
            offer.
          </li>
          <li>
            <span className="font-semibold text-down">SELL</span> at the bid if you think
            they&apos;ll <span className="text-foreground">do worse</span> than the bid
            (a narrow win, draw, or loss).
          </li>
        </ul>
        <p>
          Your profit is how far the final supremacy lands beyond your price, times your
          stake. The maker takes the opposite side of every trade, so each game is
          zero-sum.
        </p>
      </Section>

      <Section title="Worked examples">
        <ul className="space-y-2.5">
          {examples.map((ex) => {
            const stake = stakes?.[ex.stage] ?? 0;
            const offer = r2(ex.bid + width);
            const price = ex.side === "BUY" ? offer : ex.bid;
            const pnl = r2(
              ex.side === "BUY"
                ? (ex.sup - offer) * stake
                : (ex.bid - ex.sup) * stake,
            );
            const sign = pnl > 0 ? "+" : pnl < 0 ? "−" : "";
            return (
              <li key={ex.team} className="rounded-lg bg-secondary/50 p-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-foreground">
                    {ex.team} · {STAGE_LABEL[ex.stage]}
                  </span>
                  <span className="tnum text-muted-foreground">
                    quoted {ex.bid.toFixed(1)} / {offer.toFixed(1)} · £{stake}
                  </span>
                </div>
                <div className="mt-1.5 text-xs">
                  <span
                    className={
                      ex.side === "BUY"
                        ? "font-semibold text-up"
                        : "font-semibold text-down"
                    }
                  >
                    {ex.side}
                  </span>{" "}
                  @ {price.toFixed(1)} · {ex.result} →{" "}
                  <span
                    className={`tnum ${pnl > 0 ? "text-up" : pnl < 0 ? "text-down" : ""}`}
                  >
                    {sign}£{Math.abs(pnl)}
                  </span>
                </div>
                <p className="mt-1 text-[11px]">{ex.lesson}</p>
              </li>
            );
          })}
        </ul>
        <p className="text-[11px]">
          The final score is known at settlement, so every payout is a fixed £
          amount — the further the result lands past your price, the bigger the
          swing (either way).
        </p>
      </Section>

      <Section title="Settlement">
        <p>
          Games settle on the score{" "}
          <span className="text-foreground">after extra time (120′)</span>, excluding
          penalties — a <span className="text-foreground">shootout counts as a draw</span>{" "}
          (supremacy = 0). Extra-time goals count; shootout goals never do.
        </p>
        <p className="tnum text-xs">
          BUY P&amp;L = (supremacy − offer) × stake
          <br />
          SELL P&amp;L = (bid − supremacy) × stake
          <br />
          Maker P&amp;L = −(sum of everyone else&apos;s)
        </p>
      </Section>

      <Section title="Stakes (£/goal)">
        <div className="grid grid-cols-6 gap-1.5">
          {STAGES.map((s: Stage) => (
            <div key={s} className="rounded-lg bg-secondary px-1 py-2 text-center">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {STAGE_LABEL[s]}
              </div>
              <div className="tnum mt-0.5 text-sm font-semibold text-foreground">
                {stakes ? `£${stakes[s]}` : "—"}
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Deadlines">
        <p>
          The maker&apos;s rate is due{" "}
          <span className="text-foreground">60 min before kick-off</span> — miss it and a
          default <span className="tnum">0.0 / {width.toFixed(1)}</span> is applied.
        </p>
        <p>
          Takers must trade <span className="text-foreground">before kick-off</span>;
          anyone who doesn&apos;t is auto-placed <span className="text-foreground">long
          at the offer</span>. All positions lock at kick-off (rates lock once anyone
          trades).
        </p>
      </Section>

      <p className="px-2 text-center text-[11px] text-muted-foreground/70">
        A private scorekeeping ledger — no in-app payments. Cash settles offline.
      </p>
    </div>
  );
}
