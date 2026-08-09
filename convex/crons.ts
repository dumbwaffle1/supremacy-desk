import { cronJobs } from "convex/server";

const crons = cronJobs();

// WC2026 is over — all recurring jobs are retired so the deployment makes no
// background function calls. The app stays fully readable (standings, ledger,
// feed); nothing needs to run on a schedule between tournaments.
//
// To revive for a future tournament, restore from git history (this file at
// commit cc107ad or earlier):
//   - sync fixtures (am/pm)      internal.fixtures.sync           2x/day
//   - deadline penalties         internal.trades.applyDeadlinePenalties  5 min
//   - poll scores                internal.settlement.pollScores   10 min
//   - reminders                  internal.reminders.tick          5 min
//   - auto makers                internal.leagues.autoMakers      15 min

export default crons;
