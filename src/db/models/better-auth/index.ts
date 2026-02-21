/**
 * Better Auth – reference Mongoose schemas.
 * These mirror the collections managed by Better Auth (native MongoDB adapter).
 * Use for: reference, docs, populating relations, or server-side reads.
 * Do not use for writes; use Better Auth APIs instead.
 * @see https://www.better-auth.com/docs/concepts/database
 */

export { BetterAuthUser, type IBetterAuthUser } from "./User";
export { BetterAuthSession, type IBetterAuthSession } from "./Session";
export { BetterAuthAccount, type IBetterAuthAccount } from "./Account";
export {
  BetterAuthVerification,
  type IBetterAuthVerification,
} from "./Verification";
