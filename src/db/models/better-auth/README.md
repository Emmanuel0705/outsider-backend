# Better Auth – Reference Schemas

These Mongoose schemas mirror the **Better Auth** core database schema for reference and adjustment.

- **Source:** [Better Auth – Database](https://www.better-auth.com/docs/concepts/database)
- **Collections:** `user`, `session`, `account`, `verification`

## Purpose

- **Reference:** See exact field names and types used by Better Auth.
- **Adjustment:** Change types or add indexes here when tuning the DB; keep Better Auth config in sync (e.g. custom table/field names).
- **Reads:** Use these models for server-side reads or populating relations (e.g. `Merchant` → `BetterAuthUser`). Do **not** use them for writes; use Better Auth APIs (`signUp`, `signIn`, `updateUser`, etc.) instead.

## Collections

| Model                 | Collection   | Description                    |
|-----------------------|-------------|--------------------------------|
| `BetterAuthUser`      | `user`      | User profile (name, email, …) |
| `BetterAuthSession`   | `session`   | Active sessions (token, expiry)|
| `BetterAuthAccount`   | `account`   | OAuth/password credentials     |
| `BetterAuthVerification` | `verification` | Email/OTP verification rows |

## IDs

Better Auth uses **string** IDs. These schemas use `id` as the primary key and `_id: false` so Mongoose does not add its own `_id`. Our app models (e.g. `Merchant.userId`) reference the same `user.id`; when storing in MongoDB you may use string or ObjectId depending on Better Auth’s adapter—keep this in mind if you switch adapters or customize ID generation.
