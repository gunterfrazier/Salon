# Chairvana

_Calm days behind the chair._

Salon management app for a solo stylist. Built for one salon first, structured so it can support other salons later.

- **Spec:** [docs/SPEC.md](docs/SPEC.md)
- **Starter service menu:** [seed/service-menu.json](seed/service-menu.json) (all editable)
- **Default booking & cancellation policy:** [seed/policies.json](seed/policies.json)
- **Database schema:** [supabase/migrations](supabase/migrations)
- **App (Next.js, installable on Android):** [app](app)

## Develop

```bash
cd app
npm install
npm test        # policy engine tests
npm run dev     # http://localhost:3000
```
