import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Re-sync the fixture LIST twice a day to fill TBD teams / kickoff times as
// rounds resolve — well within the 100/day free quota. Live in-play scores and
// auto-settlement are a separate, more frequent cron added in Prompt 7.
crons.cron("sync fixtures (am)", "0 6 * * *", internal.fixtures.sync, {});
crons.cron("sync fixtures (pm)", "0 18 * * *", internal.fixtures.sync, {});

// Apply deadline penalties (default maker rate, forced longs) near kick-offs.
// Server-side window locks in the mutations are the real guard; this just
// materialises the penalty rows. Every 5 minutes is plenty.
crons.interval("deadline penalties", { minutes: 5 }, internal.trades.applyDeadlinePenalties, {});

// Live scores + fully automatic settlement (spec §3, §8). One call per tick
// (only when a game is in the in-play/finished window); settles after two
// consecutive identical final polls.
crons.interval("poll scores", { minutes: 10 }, internal.settlement.pollScores, {});

export default crons;
