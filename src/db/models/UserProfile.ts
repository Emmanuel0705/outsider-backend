import mongoose, { Document, Schema } from "mongoose";

export interface INotificationPrefs {
  allNotifications: boolean;
  ticketPurchase: boolean;
  eventReminders: boolean;
  ticketReceived: boolean;
  ticketSent: boolean;
  paymentAlerts: boolean;
  topUpAlerts: boolean;
  securityNotifications: boolean;
}

export const DEFAULT_NOTIFICATION_PREFS: INotificationPrefs = {
  allNotifications: true,
  ticketPurchase: true,
  eventReminders: true,
  ticketReceived: true,
  ticketSent: true,
  paymentAlerts: true,
  topUpAlerts: true,
  securityNotifications: true,
};

export interface IUserProfile extends Document {
  userId: mongoose.Types.ObjectId;
  phone?: string;
  dob?: string;
  address?: string;
  notificationPrefs: INotificationPrefs;
  createdAt: Date;
  updatedAt: Date;
}

const notificationPrefsSchema = new Schema<INotificationPrefs>(
  {
    allNotifications: { type: Boolean, default: true },
    ticketPurchase: { type: Boolean, default: true },
    eventReminders: { type: Boolean, default: true },
    ticketReceived: { type: Boolean, default: true },
    ticketSent: { type: Boolean, default: true },
    paymentAlerts: { type: Boolean, default: true },
    topUpAlerts: { type: Boolean, default: true },
    securityNotifications: { type: Boolean, default: true },
  },
  { _id: false }
);

const userProfileSchema = new Schema<IUserProfile>(
  {
    userId: { type: Schema.Types.ObjectId, required: true, unique: true },
    phone: { type: String, trim: true },
    dob: { type: String, trim: true },
    address: { type: String, trim: true },
    notificationPrefs: {
      type: notificationPrefsSchema,
      default: () => ({ ...DEFAULT_NOTIFICATION_PREFS }),
    },
  },
  { timestamps: true }
);

export const UserProfile = mongoose.model<IUserProfile>(
  "UserProfile",
  userProfileSchema
);
