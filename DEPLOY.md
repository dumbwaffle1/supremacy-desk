# Supremacy Desk — go-live runbook (Prompt 0)

The app is scaffolded, builds clean, and is committed to git. Three things need
**your accounts** (I can't log into them for you), so do these in order. ~15 min.

> Order matters: provision Convex **before** you deploy to Vercel, so the live
> site never loads without its backend env vars.

---

## 1. Provision Convex (creates the backend + writes your local env)

```bash
npx convex dev
```

- Opens a browser to log in / sign up (free).
- Creates a project — call it `supremacy-desk`.
- It writes `CONVEX_DEPLOYMENT` and `NEXT_PUBLIC_CONVEX_URL` into `.env.local`
  and starts pushing the `convex/` functions. Leave it running in its own
  terminal while developing (Ctrl-C when done).

## 2. Set up auth keys + email sending (on the Convex deployment)

**a) JWT signing keys** — easiest path, run the official helper once:

```bash
npx @convex-dev/auth
```

It detects the existing `convex/auth.ts` and sets `JWT_PRIVATE_KEY`, `JWKS`, and
`SITE_URL` on your deployment.
_(Manual alternative: `node scripts/generateKeys.mjs` then `npx convex env set JWT_PRIVATE_KEY ...` / `JWKS ...`.)_

**b) Resend (magic-link emails)** — sign up free at <https://resend.com>, create
an API key, then:

```bash
npx convex env set AUTH_RESEND_KEY re_your_key_here
npx convex env set AUTH_EMAIL_FROM "Supremacy Desk <onboarding@resend.dev>"
npx convex env set SITE_URL http://localhost:3000   # if not already set in step 2a
```

> ⚠️ Resend's shared `onboarding@resend.dev` sender only delivers to **your own**
> Resend account email while testing. To email all 8 friends, add+verify a domain
> in Resend (free) and set `AUTH_EMAIL_FROM` to e.g. `desk@yourdomain.com`.
> (Real magic-link login UI lands in Prompt 2 — this just wires the backend.)

Verify locally: `npm run dev`, open <http://localhost:3000>, tabs should work.

---

## 3. Push to GitHub

`gh` (GitHub CLI) isn't installed on this machine, so either:

**Option A — install gh** (`winget install GitHub.cli`), then:

```bash
gh auth login
gh repo create supremacy-desk --private --source . --remote origin --push
```

**Option B — web UI**: create an empty private repo named `supremacy-desk` at
<https://github.com/new> (no README/.gitignore), then:

```bash
git remote add origin https://github.com/<you>/supremacy-desk.git
git push -u origin main
```

---

## 4. Deploy to Vercel

1. <https://vercel.com/new> → **Import** the `supremacy-desk` repo.
2. Framework preset auto-detects **Next.js**. Don't change build settings.
3. **Environment Variables** — add these (Production + Preview):

   | Key | Value |
   |---|---|
   | `NEXT_PUBLIC_CONVEX_URL` | the `https://<name>.convex.cloud` from `.env.local` |
   | `CONVEX_DEPLOYMENT` | the value from `.env.local` |

4. Deploy. Copy the `*.vercel.app` URL — that's the shareable link.
5. Point Convex at prod for auth redirects:

   ```bash
   npx convex env set SITE_URL https://your-app.vercel.app
   ```

   And in Resend, make sure `AUTH_EMAIL_FROM`'s domain is verified for real sends.

> For production Convex (separate from dev), run `npx convex deploy` and use the
> **prod** deployment's URL in Vercel. For launch-today, the dev deployment URL is
> fine to share.

---

## Done when

The `*.vercel.app` URL loads on your phone and you can tap between
**Desk · Games · Settle · Rules · Admin**. (Login + data come in Prompts 1–2.)
