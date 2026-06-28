# Supremacy Desk

A real-money-stakes goal-supremacy trading game for 8 friends, run over the
2026 World Cup **knockout phase** (R32 → Final). One maker quotes a two-way price
on home supremacy; everyone else buys or sells. Auto-settled from a live football
feed. Zero-sum per game. Cash settles offline (no in-app payments).

See [`supremacy-build-spec.md`](./supremacy-build-spec.md) for the full spec and
[`claude-code-prompts.md`](./claude-code-prompts.md) for the build order.

## Stack

- **Next.js 16** (App Router) + TypeScript + Tailwind v4 + shadcn/ui
- **Convex** — database, realtime, cron, auth
- **Convex Auth** — email magic link (Resend), Sign in with Apple later
- **Vercel** hosting · **API-Football** scores (added in Prompt 3)

## Develop

```bash
npm install
npx convex dev      # in one terminal — provisions backend, writes .env.local
npm run dev         # in another — http://localhost:3000
```

First-time setup (Convex project, auth keys, Resend, GitHub, Vercel) is in
[`DEPLOY.md`](./DEPLOY.md).

## Config

All game constants live in [`src/config/constants.ts`](./src/config/constants.ts)
— players, width (0.2), stakes per stage, admin email, settlement basis
(`120min_exclPens`). Single source of truth; import from there.

## Build status

- ✅ **Prompt 0** — scaffold, shell, bottom tab bar, Convex Auth wiring
- ⬜ Prompt 1+ — data model, auth UI, fixtures, trading, settlement…
