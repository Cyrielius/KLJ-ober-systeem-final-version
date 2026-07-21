# KLJ Bestelsysteem

Realtime bestelsysteem voor KLJ / eetfestijn evenementen. Geen login — obers joinen met een sessiecode, de host beheert met een PIN.

## Status flow

`pending` (Keuken ontvangen) → `done` (Keuken afgewerkt) → `completed` (Ober afgewerkt)
`cancelled` (Geannuleerd) — timer stopt automatisch

## Deployen op Vercel

### 1. Naar GitHub pushen

```bash
git remote add origin https://github.com/Cyrielius/KLJ_ober.git
git push -u origin main --force
```

### 2. Import op Vercel

1. Ga naar [vercel.com/new](https://vercel.com/new)
2. Kies je GitHub-repo `Cyrielius/KLJ_ober`
3. Framework preset: **Vite**
4. Build command: `npm run build` (staat al ingesteld)
5. Output directory: `dist` (staat al ingesteld)

### 3. Environment variables toevoegen

Voeg deze toe onder **Settings → Environment Variables**:

| Naam | Waarde |
|------|--------|
| `VITE_SUPABASE_URL` | `https://0ec90b57d6e95fcbda19832f.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | (zie hieronder) |

```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJib2x0IiwicmVmIjoiMGVjOTBiNTdkNmU5NWZjYmRhMTk4MzJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg4ODE1NzQsImV4cCI6MTc1ODg4MTU3NH0.9I8-U0x86Ak8t2DGaIk0HfvTSLsAyzdnz-Nw00mMkKw
```

> **Belangrijk**: Vite gebruikt `VITE_` prefix voor client-side env vars. Zonder prefix zijn ze niet beschikbaar in de browser.

### 4. Deployen

Klik **Deploy**. Klaar — de app draait op een `vercel.app` URL.

## Supabase database

De database is al volledig ingericht met:
- 5 tabellen: `klj_sessions`, `klj_products`, `klj_tables`, `klj_orders`, `klj_order_events`
- RLS ingeschakeld op alle tabellen (anon + authenticated toegang voor gedeelde sessie-data)
- Realtime via Supabase subscriptions

Geen extra database setup nodig — de migrations zijn al toegepast.

## Lokaal draaien

```bash
npm install
npm run dev
```
