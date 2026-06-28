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

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Rules</h1>

      <Section title="The market">
        <p>
          Each game has one{" "}
          <span className="text-foreground">maker</span>{" "}
          who quotes a two-way price on a team&apos;s{" "}
          <span className="text-foreground">supremacy</span>{" "}
          (their goals minus the opponent&apos;s). The{" "}
          <span className="text-foreground">offer</span> is the{" "}
          <span className="text-foreground">bid + {width}</span>.
        </p>
        <p>
          Everyone else is a <span className="text-foreground">taker</span>:{" "}
          <span className="text-up">BUY</span> to back that team to beat the offer, or{" "}
          <span className="text-down">SELL</span> to lay them at the bid. The maker is
          the counterparty to everyone — it&apos;s zero-sum per game.
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

      <Section title="Worked example">
        <p>
          France quoted <span className="tnum">0.0 / {width.toFixed(1)}</span>:
        </p>
        <p className="text-xs">
          • BUY @ {width.toFixed(1)}, France win 3–1 (supremacy +2) →{" "}
          <span className="text-up tnum">
            +{(2 - width).toFixed(1)}
          </span>{" "}
          per £/goal.
          <br />• SELL @ 0.0, France lose 0–1 (supremacy −1) →{" "}
          <span className="text-up tnum">+1.0</span> per £/goal.
        </p>
      </Section>

      <p className="px-2 text-center text-[11px] text-muted-foreground/70">
        A private scorekeeping ledger — no in-app payments. Cash settles offline.
      </p>
    </div>
  );
}
