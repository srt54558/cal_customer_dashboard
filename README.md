# Cal Customer Portal

A Next.js + Convex customer support portal for Cal.com OAuth users, with Linear data projected into Convex for fast customer/issue/comment views.

## Quick Architecture
- `Next.js App Router` serves authenticated customer pages.
- `Convex` is the primary read model and mutation layer for portal UI.
- `Linear` is the source of truth for issue data and receives comment writes.
- `Linear webhooks -> Convex HTTP endpoint` keep Convex projections in sync.

## Directory Overview
- `app/`: App Router routes, layouts, loading states, and API routes (`/api/auth/*`, `/api/convex/token`).
- `components/`: UI and page client components (portal shell, issue page, settings, composer, etc.).
- `components/ui/`: shared COSS-style primitives (button, card, frame, dialogs, inputs, etc.).
- `convex/`: Convex schema/functions (portal/account/comments/webhooks/notifications/crons).
- `convex/lib/`: Convex-side helpers (session/auth/Linear interop).
- `lib/`: server helpers for auth/env/Linear/Convex bridge and shared models.
- `messages/`: i18n strings.
- `public/`: static assets.
- `tests/`: Vitest tests.
- `docs/`: implementation notes/progress docs.

## Environment Variables
Create `.env.local` from `.env.example`.

### Public (safe for browser)
- `NEXT_PUBLIC_APP_URL`
  - Local: `http://localhost:3000`
  - Production: your deployed app URL (for example `https://portal.yourdomain.com`)
- `NEXT_PUBLIC_CONVEX_URL`
  - Copy from your Convex deployment in the Convex dashboard.

### Server-only (must stay secret)
- `CAL_CLIENT_ID`
  - From your Cal.com OAuth app.
- `CAL_CLIENT_SECRET`
  - From your Cal.com OAuth app (keep secret).
- `SESSION_SECRET`
  - Generate a strong random value:
    ```bash
    openssl rand -hex 32
    ```
- `CAL_REDIRECT_URI`
  - Must exactly match Cal OAuth callback.
  - Local: `http://localhost:3000/api/auth/callback/cal`
  - Production: `https://<your-domain>/api/auth/callback/cal`
- `LINEAR_API_KEY`
  - Create from Linear API settings (personal key/integration key).
- `LINEAR_WEBHOOK_SECRET`
  - Generate a strong random secret and set the same value in Linear webhook config.
- `CONVEX_INTERNAL_SECRET`
  - Generate a strong random secret for trusted internal projection writes.
- `CONVEX_AUTH_ISSUER`
  - JWT issuer your Convex auth should trust (typically your app/auth issuer URL).
- `CONVEX_AUTH_AUDIENCE`
  - JWT audience identifier used by this portal.
- `CONVEX_JWT_PRIVATE_KEY`
  - Private key used to mint Convex bridge JWTs.
- `CONVEX_JWT_PUBLIC_KEY`
  - Public key pair for Convex JWT verification.
- `CONVEX_JWT_KID`
  - Key ID for the JWT key pair (must match issuer/verifier config).

### Optional
- `POSTMARK_SERVER_TOKEN`
- `POSTMARK_FROM_EMAIL`
- `POSTMARK_MESSAGE_STREAM`

## Local Development
1. Install dependencies:
```bash
bun install
```
2. Start Next.js:
```bash
bun run dev
```
3. Run Convex dev backend (in another shell):
```bash
bunx convex dev
```
4. Ensure Cal OAuth callback is:
- `http://localhost:3000/api/auth/callback/cal`

## Deployment Guide

### 1) Convex
1. Create/select a Convex project.
2. Deploy Convex functions/schema.
3. Note deployment URL and set `NEXT_PUBLIC_CONVEX_URL` in hosting env.
4. Set Convex auth/JWT/internal-secret env vars in hosting env.

### 2) Next.js Hosting (Vercel recommended)
1. Connect repo and create project.
2. Add all required env vars from `.env.example`.
3. Build command: `bun run build`.
4. Start command: `bun run start` (if self-hosting).

### 3) Cal.com OAuth
1. Configure app credentials.
2. Set production callback URL:
- `https://<your-domain>/api/auth/callback/cal`
3. Ensure `CAL_REDIRECT_URI` matches exactly.

### 4) Linear Integration
1. Create/generate `LINEAR_API_KEY`.
2. Point webhook to Convex endpoint:
- `https://<your-convex-deployment>.convex.site/linear-webhook`
3. Use the same `LINEAR_WEBHOOK_SECRET` in both Linear and env.

### 5) Verify Production
- Login via Cal OAuth works.
- Customer scoping/authorization is enforced.
- Issue/comment pages load from Convex projection.
- New comments sync to Linear and are reflected back.
- Webhook deliveries succeed.

## Convex Cheat Sheet

### Function Types
- `query`: read-only API for UI fetches.
- `mutation`: transactional writes to Convex data.
- `action`: external side effects (e.g., calling Linear APIs).

### Core Flow in this app
1. Portal reads from Convex (`api.portal.*`, `api.account.*`).
2. Missing/stale data may trigger guarded fallback from Linear.
3. Projection writes update `customers`, `issues`, `comments`, activity/read models.
4. UI subscribes via `useQuery`, so fresh Convex updates stream automatically.

### Auth Model
- Next.js session cookie authenticates app routes.
- `/api/convex/token` mints Convex auth token for client bridge.
- `ConvexProviderWithAuth` sends token to Convex queries/mutations/actions.

### Projection Sync
- Source writes: Linear + webhook payloads.
- Projection writes: `convex/portal.ts` mutations (`upsert*`, `replace*`, `patch*`).
- Comment actions: `convex/comments.ts` writes to Linear then refreshes Convex projection.

## Commands
- Lint: `bun run lint`
- Typecheck: `bun run typecheck`
- Tests: `bun run test`
- CI tests once: `bun run test:ci`

## Credential Hygiene Checklist (before pushing)
- Never commit `.env.local`, `.env.*.local`, private keys, API tokens, webhook secrets.
- Do not hardcode secrets in source, tests, docs, or example JSON.
- Keep only placeholders in `.env.example`.
- Check staged diff for suspicious literals (`token`, `secret`, `private_key`, `BEGIN`).
- Confirm logs/debug output do not print credentials.

### Quick Secret Scan
```bash
rg -n "(SECRET|TOKEN|API_KEY|PRIVATE KEY|BEGIN RSA|BEGIN EC|CONVEX_INTERNAL_SECRET|CAL_CLIENT_SECRET|LINEAR_API_KEY)" .
```

## Notes
- `convex/_generated/ai/guidelines.md` should be read before modifying Convex functions.
- The portal intentionally keeps Convex schema/API stable while evolving UI behavior.
