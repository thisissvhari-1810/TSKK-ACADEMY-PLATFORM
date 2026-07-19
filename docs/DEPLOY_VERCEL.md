# Deploying the TSKK frontend to Vercel

This repository holds two apps:

- `frontend/` — Next.js 15 app that we'll deploy to **Vercel**.
- `backend/` — NestJS API plus Postgres, Redis, MinIO, and Puppeteer. It stays
  on your Windows machine for now; a public tunnel gives Vercel a URL to call.

The steps below take a fresh checkout to a live Vercel URL in ~10 minutes.

---

## 1. Keep the backend + services running locally

The Vercel-hosted frontend will call your local NestJS backend, so the
following must be up on your Windows machine whenever the site is used:

- Postgres 17 service (`postgresql-x64-17`)
- Redis-compatible service (`Memurai`)
- MinIO — `%USERPROFILE%\minio\minio.exe server %USERPROFILE%\minio\data --address :9000 --console-address :9001`
- Backend — `cd backend && npm run start:dev`

Confirm `http://localhost:4000/api/v1/health` returns `200`.

## 2. Expose the backend on a public URL

Vercel functions run in the cloud and can't reach `localhost`. Open a public
tunnel to `http://localhost:4000`:

```powershell
powershell -File scripts\tunnel-backend.ps1
```

The first run downloads `cloudflared.exe` (~40 MB) into `scripts/bin/`. After a
few seconds you'll see something like:

```
https://friendly-nascent-word-1234.trycloudflare.com
```

**Copy that URL** — it's your `NEXT_PUBLIC_API_URL`. It changes every time you
restart the tunnel; for a stable subdomain, create a free Cloudflare account
and switch to a named tunnel.

Also add the same URL to `backend/.env`:

```env
CORS_ORIGINS=http://localhost:3000,https://your-frontend.vercel.app
```

…and restart the backend. (Only origins in `CORS_ORIGINS` are allowed to call
the API from a browser — leave `localhost:3000` there so local dev keeps
working.)

## 3. Deploy the frontend to Vercel

The repo already contains:

- `vercel.json` at the root, telling Vercel to build only `frontend/`.
- `.vercelignore`, keeping `backend/`, docker files, etc. out of the build.
- `frontend/.env.production.example`, listing every env var.

### 3a. First-time deploy (CLI)

```powershell
# Log in once. This opens a browser.
npx vercel@latest login

# From the repo root:
npx vercel@latest
```

Answer the prompts:

- **Set up and deploy?** → `Y`
- **Which scope?** → your personal account (or team)
- **Link to an existing project?** → `N`
- **Project name?** → `tskk-academy` (or anything)
- **In which directory is your code located?** → `./` (the repo root — the
  `vercel.json` here already points at `frontend/`)
- **Override settings?** → `N`

Vercel builds and gives you a preview URL like
`https://tskk-academy-xxxx.vercel.app`. **Don't visit it yet** — you still need
to set the env vars.

### 3b. Add the env vars

Either from the dashboard (Project → Settings → Environment Variables) or
from the CLI:

```powershell
# Point the frontend at your tunneled backend
npx vercel env add NEXT_PUBLIC_API_URL production
# Paste: https://friendly-nascent-word-1234.trycloudflare.com

npx vercel env add NEXT_PUBLIC_API_PREFIX production
# Paste: /api/v1

npx vercel env add NEXT_PUBLIC_CERT_VERIFY_BASE production
# Paste: https://<your-vercel-domain>/verify
```

Copy the same three vars into the `Preview` and `Development` scopes if you
want branch previews to work too.

### 3c. Promote to production

```powershell
npx vercel --prod
```

This runs a fresh build with the env vars baked in and switches the
`tskk-academy.vercel.app` alias to the new deployment. Open it in a browser
and log in — you should land on the same dashboard you've been using locally.

## 4. Every time you restart the tunnel

Cloudflare Quick Tunnel gives you a new random URL each restart. Update
`NEXT_PUBLIC_API_URL` in Vercel and redeploy:

```powershell
npx vercel env rm NEXT_PUBLIC_API_URL production --yes
npx vercel env add NEXT_PUBLIC_API_URL production
# paste new URL
npx vercel --prod
```

For a URL that survives restarts, run:

```powershell
scripts\bin\cloudflared.exe tunnel login
scripts\bin\cloudflared.exe tunnel create tskk
scripts\bin\cloudflared.exe tunnel route dns tskk api.<your-domain>.com
```

and point `NEXT_PUBLIC_API_URL` at `https://api.<your-domain>.com`.

## 5. When you're ready for a real production stack

Vercel is fine for the Next.js frontend forever, but the backend eventually
belongs somewhere always-on. Cheapest recipe:

- **Backend host** — Render / Railway / Fly.io (`backend/Dockerfile` exists).
- **Postgres** — Neon or Supabase (free tier).
- **Redis** — Upstash (free tier).
- **Object storage** — Cloudflare R2 or AWS S3 (drop-in for the MinIO client).
- **Puppeteer** — the existing `PUPPETEER_EXECUTABLE_PATH` env var works with
  Render/Railway's included Chrome. On Vercel functions you'd need
  `@sparticuz/chromium`, which is why we didn't put the backend there.

Ping me when you're ready to migrate and I'll wire up the Dockerfile,
`render.yaml`, and the S3 client swap.
