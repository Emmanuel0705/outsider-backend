export { Event, type IEvent, type ITicketTier } from "./Event";
export { UserProfile, type IUserProfile, type INotificationPrefs, DEFAULT_NOTIFICATION_PREFS } from "./UserProfile";
export { Notification, type INotification, type NotificationType } from "./Notification";
export {
  Merchant,
  EVENT_CATEGORIES,
  ORGANIZER_TYPES,
  type IMerchant,
} from "./Merchant";
export { Order, type IOrder, type IOrderItem } from "./Order";
export { Wallet, type IWallet } from "./Wallet";
export { AccountStatus, type IAccountStatus } from "./AccountStatus";
export { MerchantWallet, type IMerchantWallet } from "./MerchantWallet";
export { CardOrder, type ICardOrder, type CardOrderStatus } from "./CardOrder";
export { CardBinding, type ICardBinding } from "./CardBinding";
export {
  Transaction,
  type ITransaction,
  type TransactionType,
} from "./Transaction";

// Better Auth reference schemas (user, session, account, verification)
export {
  BetterAuthUser,
  BetterAuthSession,
  BetterAuthAccount,
  BetterAuthVerification,
  type IBetterAuthUser,
  type IBetterAuthSession,
  type IBetterAuthAccount,
  type IBetterAuthVerification,
} from "./better-auth";
