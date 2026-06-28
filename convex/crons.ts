import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Re-sync the fixture LIST twice a day to fill TBD teams / kickoff times as
// rounds resolve — well within the 100/day free quota. Live in-play scores and
// auto-settlement are a separate, more frequent cron added in Prompt 7.
crons.cron("sync fixtures (am)", "0 6 * * *", internal.fixtures.sync, {});
crons.cron("sync fixtures (pm)", "0 18 * * *", internal.fixtures.sync, {});

export default crons;
