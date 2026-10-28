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
