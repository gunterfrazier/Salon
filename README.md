# Chairvana

_Calm days behind the chair._

Salon management app for a solo stylist. Built for one salon first, structured so it can support other salons later.

- **Spec:** [docs/SPEC.md](docs/SPEC.md)
- **Starter service menu:** [app/seed/service-menu.json](app/seed/service-menu.json) (all editable)
- **Default booking & cancellation policy:** [app/seed/policies.json](app/seed/policies.json)
- **Database schema:** [supabase/migrations](supabase/migrations)
- **App (Next.js, installable on Android):** [app](app)

## Develop

```bash
cd app
npm install
npm test        # policy engine tests
npm run dev     # http://localhost:3000
```

## Deploy (Cloudflare Workers)

Cloudflare Worker `salon` builds from `main` with root directory `app`:

- Build command: `npm run build:cf` (applies pending database migrations on `main`, then builds with OpenNext)
- Deploy command: `npx opennextjs-cloudflare deploy`
- Non-production branches: `npx opennextjs-cloudflare upload`

Runtime variables: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` (secret), `OWNER_EMAILS`.
Build secret: `POSTGRES_URL_NON_POOLING` (for migrations).
