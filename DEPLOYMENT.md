# Deploy to Vercel with Supabase Postgres

This app runs on **Vercel** (hosting + API) and **Supabase** (PostgreSQL database). Vercel injects the database connection automatically when you connect Supabase from the Marketplace.

> **Note:** There is no "Supernova" database on Vercel. If you meant **Supabase**, follow this guide. Supabase is Postgres and works with this app out of the box.

---

## Step 1 — Push code to GitHub

1. Create a GitHub repository for this project.
2. Push all files (except `.env.local` and `node_modules/`).

---

## Step 2 — Create a Vercel project

1. Go to [vercel.com](https://vercel.com) and sign in.
2. Click **Add New → Project**.
3. Import your GitHub repository.
4. Keep the default settings and click **Deploy** (first deploy may fail until the database is connected — that is normal).

---

## Step 3 — Add Supabase database (Vercel Marketplace)

1. Open your project in the **Vercel Dashboard**.
2. Go to **Storage** (or **Integrations → Marketplace**).
3. Search for **Supabase** and click **Install**.
4. Create a new Supabase project (or link an existing one).
5. Choose a region close to your store (e.g. Mumbai/Singapore if available).
6. Connect the database to your Vercel project.

Vercel will automatically add these environment variables:

| Variable | Use |
|----------|-----|
| `POSTGRES_URL` | Pooled connection (used by this app on Vercel) |
| `POSTGRES_URL_NON_POOLING` | Direct connection (migrations/admin) |

The app reads `POSTGRES_URL` first, then falls back to `DATABASE_URL`.

---

## Step 4 — Redeploy to production

After Supabase is connected:

1. In Vercel Dashboard → **Deployments** → open the latest deployment → **Redeploy**.
2. Or from your terminal:

```bash
npm install -g vercel
cd store-reporting-app
vercel login
vercel link
vercel env pull .env.local
vercel --prod
```

On first API request, the app creates the `daily_reports` table automatically.

---

## Step 5 — Verify the live app

1. Open your Vercel URL (e.g. `https://store-reporting-app.vercel.app`).
2. Log in with staff PIN **1234** or admin PIN **6282**.
3. Submit a test daily report.
4. Log in as admin and confirm the report appears in **Reports Log** and **Monitoring**.

---

## Local development with Supabase

```bash
npm install
vercel link
vercel env pull .env.local
npm start
```

Open `http://localhost:3000`. Without `POSTGRES_URL` / `DATABASE_URL`, the app falls back to a local `store_data.json` file.

---

## Alternative: Neon Postgres (also free on Vercel)

If you prefer Neon instead of Supabase:

1. Install **Neon** from the Vercel Marketplace.
2. Vercel sets `DATABASE_URL`.
3. Redeploy — no code changes needed.

---

## Alternative: cPanel / PHP hosting

For shared hosting with MySQL, use `api.php` and `database_schema.sql` instead. See the PHP section in the original deployment notes or configure `api.php` with your MySQL credentials.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| API returns 500 on save | Check Vercel → Settings → Environment Variables. Ensure `POSTGRES_URL` exists for Production. |
| Empty dashboard after submit | Confirm redeploy happened **after** Supabase was connected. |
| Login works but data disappears | You are likely on JSON fallback locally; set `POSTGRES_URL` in `.env.local`. |

---

## Security (recommended before go-live)

Change the default PINs in `server.js` and `api.php`:

- Staff PIN: `1234`
- Admin PIN: `6282`

Use strong 4–6 digit codes and share them only with your team.
