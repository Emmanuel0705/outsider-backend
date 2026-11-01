# Elysia with Bun runtime

## Getting Started
To get started with this template, simply paste this command into your terminal:
```bash
bun create elysia ./elysia-example
```

## Development
To start the development server run:
```bash
bun run dev
```

Open http://localhost:3000/ with your browser to see the result.

## Web app origins
Browser clients must be listed in better-auth's trusted origins. Set `WEB_ORIGINS`
to a comma-separated list of exact origins (no trailing path):
```bash
WEB_ORIGINS=http://localhost:3010,https://app.outsiderbyremy.com
```
## QR profile links and check-in
- `APP_URL` — web app origin used in QR links (default `https://app.outsiderbyremy.com`).
- `QR_PROFILE_LINKS=true` — QR codes encode `${APP_URL}/u/<virtualCardId>` (public profile).
  Turn on only after the web app serves `/u/[publicId]`; until then QR codes keep the legacy
  `outsider://card?vid=…` format. The scanner accepts both formats either way.
- Check-in: `POST /api/merchant/events/:eventId/check-ins { payload }` → `checked_in` (201/200),
  `already_checked_in` (409), `no_ticket` / `unknown_code` (404), `invalid_code` (400).
  One record per (event, attendee); a later scan only admits tickets bought since.
- Physical NFC cards: program each card with `${APP_URL}/c/<cardId>`. Tapping a connected card
  opens the owner's public profile (`GET /api/public/cards/:cardId` → `publicId`); the door scanner
  and card connect also accept the older `…/card?id=<cardId>` form and bare ids. A person's QR and
  card are the same entry credential, so either one checks them in once per event.

## Paystack webhook and top-up reconciliation
- Webhook URL (Paystack dashboard → Settings → API Keys & Webhooks, set it for Live and Test):
  `https://<backend>/api/webhooks/paystack`. Requests are checked against `x-paystack-signature`
  (HMAC-SHA512 of the raw body with `PAYSTACK_SECRET_KEY`). `charge.success` for `TXN-TOPUP-…`
  credits the wallet once, even if the user closed the app before it confirmed.
- A reconciler asks Paystack about top-ups still pending (2 min – 30 days old) every
  `TOPUP_RECONCILE_INTERVAL_MS` (default 5 min, `0` disables) and credits paid ones; unpaid ones
  older than 24h are marked failed. Run it now with `POST /api/admin/topups/reconcile` (admin token).
- Verify, webhook and reconciler share one claim-then-credit step, so a payment is credited at most once.
