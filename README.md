# Friends Included Finance

Day 4 homework system connecting Telegram, Supabase, Vercel, and Google Sheets. Employees submit sales and expenses through the website or Telegram; Svetlana reviews pending decisions; Supabase remains the source of truth; Google Sheets receives an idempotent readable copy.

## Local verification

```text
npm test
```

The test suite checks both supplied datasets, commission rounding, server-side role enforcement, invalid inputs, and idempotent decisions.

## Deployment

1. Run `supabase/migrations/001_schema.sql` in the Supabase SQL editor.
2. Deploy this repository to Vercel with the variables in `.env.example`.
3. Set the Telegram webhook to `https://YOUR_DOMAIN/api/telegram/webhook` with the same `TELEGRAM_WEBHOOK_SECRET`.
4. Share the Google Sheet with the service account as Editor and with the instructor as Viewer.

Secrets stay in Vercel environment variables and must never be committed.
