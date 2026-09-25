# Friends Included Finance

Day 4 homework system connecting Telegram, Supabase, Vercel, and Google Sheets. Employees submit sales and expenses through the website or Telegram; Svetlana reviews pending decisions; Supabase remains the source of truth; Google Sheets receives an idempotent readable copy.

## Local verification

Run `npm test`.

## Deployment

1. Run `supabase/migrations/001_schema.sql` in Supabase.
2. Deploy to Vercel with the variables in `.env.example`.
3. Set the Telegram webhook to `https://YOUR_DOMAIN/api/telegram/webhook`.
4. Share the Google Sheet with the service account as Editor and instructor as Viewer.

Secrets stay in Vercel environment variables and are never committed.
