"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { ChevronRight } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { STAGES, STAGE_LABEL, STAKES, type Stage } from "@/config/constants";
import { useNow } from "@/lib/useNow";
import { displayStatus, STATUS_STYLE } from "@/lib/gameDisplay";
import { Flag } from "@/lib/flags";

export function GamesList({ leagueId }: { leagueId: string }) {
  const games = useQuery(api.games.list, { leagueId: leagueId as Id<"leagues"> });
  const now = useNow(30000);

  if (games === undefined) {
    return (
      <div className="space-y-3">
        <div className="panel h-20 animate-pulse rounded-2xl" />
        <div className="panel h-20 animate-pulse rounded-2xl" />
      </div>
    );
  }

  const groups = STAGES.map((stage) => ({
    stage,
    games: games.filter((g) => g.stage === stage),
  })).filter((g) => g.games.length > 0);

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight">Games</h1>

      {groups.map(({ stage, games: rows }) => (
        <section key={stage} className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {STAGE_LABEL[stage as Stage]}
            </h2>
            <span className="tnum text-[11px] text-muted-foreground">
              £{STAKES[stage as Stage]}/goal
            </span>
          </div>

          <ul className="panel divide-y divide-border overflow-hidden rounded-2xl">
            {rows.map((g) => {
              const ds = displayStatus(g.status, g.koUtc, now);
              const settled =
                g.settleHome !== null && g.settleAway !== null
                  ? `${g.settleHome}–${g.settleAway}`
                  : null;
              const liveScore =
                g.liveHome !== null && g.liveAway !== null
                  ? `${g.liveHome}–${g.liveAway}`
                  : null;
              return (
                <li key={g._id}>
                  <Link
                    href={`/l/${leagueId}/games/${g._id}`}
                    className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/40"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${STATUS_STYLE[ds]}`}
                        >
                          {ds}
                        </span>
                        <span className="flex items-center gap-1.5 truncate text-sm font-medium">
                          <Flag name={g.home} />
                          {g.home ?? "TBD"}
                          <span className="text-muted-foreground">v</span>
                          <Flag name={g.away} />
                          {g.away ?? "TBD"}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        maker <span className="text-foreground">{g.makerPlayer ?? "—"}</span>
                        {g.bid !== null && (
                          <span className="tnum">
                            {"  ·  "}
                            {g.bid.toFixed(1)} / {g.offer?.toFixed(1)}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {settled ? (
                        <span className="tnum text-sm font-semibold">{settled}</span>
                      ) : liveScore ? (
                        <span className="tnum text-sm font-semibold text-up">
                          {liveScore}
                        </span>
                      ) : null}
                      <ChevronRight className="size-4 text-muted-foreground" />
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
