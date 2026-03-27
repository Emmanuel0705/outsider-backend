import { Request, Response } from "express";
import mongoose from "mongoose";
import { Notification } from "../../db/models/Notification";
import { UserProfile, DEFAULT_NOTIFICATION_PREFS } from "../../db/models/UserProfile";
import type { INotificationPrefs } from "../../db/models/UserProfile";

// ─── List notifications ───────────────────────────────────────────────────────

export async function listNotifications(req: Request, res: Response) {
  const userId = new mongoose.Types.ObjectId(req.user!.id);
  const limit = Math.min(parseInt((req.query.limit as string) ?? "50", 10), 100);
  const page = Math.max(parseInt((req.query.page as string) ?? "1", 10), 1);
  const skip = (page - 1) * limit;

  const [notifications, total] = await Promise.all([
    Notification.find({ userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Notification.countDocuments({ userId }),
  ]);

  res.json({ notifications, total, page, limit });
}

// ─── Mark single as read ──────────────────────────────────────────────────────

export async function markAsRead(req: Request, res: Response) {
  const userId = new mongoose.Types.ObjectId(req.user!.id);
  const { id } = req.params;

  const notification = await Notification.findOneAndUpdate(
    { _id: id, userId },
    { isRead: true },
    { new: true }
  );

  if (!notification) {
    res.status(404).json({ error: "Notification not found" });
    return;
  }

  res.json({ success: true });
}

// ─── Mark all as read ─────────────────────────────────────────────────────────

export async function markAllAsRead(req: Request, res: Response) {
  const userId = new mongoose.Types.ObjectId(req.user!.id);
  await Notification.updateMany({ userId, isRead: false }, { isRead: true });
  res.json({ success: true });
}

// ─── Delete single notification ───────────────────────────────────────────────

export async function deleteNotification(req: Request, res: Response) {
  const userId = new mongoose.Types.ObjectId(req.user!.id);
  const { id } = req.params;

  const notification = await Notification.findOneAndDelete({ _id: id, userId });

  if (!notification) {
    res.status(404).json({ error: "Notification not found" });
    return;
  }

  res.json({ success: true });
}

// ─── Unread count ─────────────────────────────────────────────────────────────

export async function getUnreadCount(req: Request, res: Response) {
  const userId = new mongoose.Types.ObjectId(req.user!.id);
  const count = await Notification.countDocuments({ userId, isRead: false });
  res.json({ count });
}

// ─── Notification preferences ─────────────────────────────────────────────────

export async function getNotificationPrefs(req: Request, res: Response) {
  const userId = new mongoose.Types.ObjectId(req.user!.id);
  const profile = await UserProfile.findOne({ userId }).lean();
  res.json(profile?.notificationPrefs ?? DEFAULT_NOTIFICATION_PREFS);
}

export async function updateNotificationPrefs(req: Request, res: Response) {
  const userId = new mongoose.Types.ObjectId(req.user!.id);

  const allowed: (keyof INotificationPrefs)[] = [
    "allNotifications",
    "ticketPurchase",
    "eventReminders",
    "ticketReceived",
    "ticketSent",
    "paymentAlerts",
    "topUpAlerts",
    "securityNotifications",
  ];

  const updates: Partial<INotificationPrefs> = {};
  for (const key of allowed) {
    if (typeof req.body[key] === "boolean") {
      updates[key] = req.body[key];
    }
  }

  const profile = await UserProfile.findOneAndUpdate(
    { userId },
    { $set: Object.fromEntries(Object.entries(updates).map(([k, v]) => [`notificationPrefs.${k}`, v])) },
    { upsert: true, new: true }
  );

  res.json(profile?.notificationPrefs ?? DEFAULT_NOTIFICATION_PREFS);
}
