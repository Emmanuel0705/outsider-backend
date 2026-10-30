import mongoose, { Document, Schema } from "mongoose";

export type NotificationType =
  | "ticket_purchase"
  | "event_reminder"
  | "ticket_received"
  | "ticket_sent"
  | "payment"
  | "top_up"
  | "security"
  | "general";

export interface INotification extends Document {
  userId: mongoose.Types.ObjectId;
  type: NotificationType;
  title: string;
  body: string;
  avatar?: string;
  /** In-app path the notification opens, e.g. /tickets/<orderId>. */
  link?: string;
  isRead: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const notificationSchema = new Schema<INotification>(
  {
    userId: { type: Schema.Types.ObjectId, required: true, index: true },
    type: {
      type: String,
      required: true,
      enum: [
        "ticket_purchase",
        "event_reminder",
        "ticket_received",
        "ticket_sent",
        "payment",
        "top_up",
        "security",
        "general",
      ],
    },
    title: { type: String, required: true, trim: true },
    body: { type: String, required: true, trim: true },
    avatar: { type: String },
    link: { type: String, trim: true },
    isRead: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const Notification = mongoose.model<INotification>(
  "Notification",
  notificationSchema
);
