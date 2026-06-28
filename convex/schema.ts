import { defineSchema } from "convex/server";
import { authTables } from "@convex-dev/auth/server";

// Auth tables only for now. The full game data model (Player, Tournament,
// Game, Trade, AuditLog, plus extra User fields) lands in Prompt 1 — see
// supremacy-build-spec.md §4.
export default defineSchema({
  ...authTables,
});
