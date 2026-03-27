import mongoose from "mongoose";
import { Notification, type NotificationType } from "../../db/models/Notification";

/**
 * Internal helper — call this from any controller/service to create
 * a notification for a user (e.g. after ticket purchase, payment, etc.)
 */
export async function createNotification(
  userId: mongoose.Types.ObjectId,
  type: NotificationType,
  title: string,
  body: string,
  avatar?: string
) {
  return Notification.create({ userId, type, title, body, avatar });
}
