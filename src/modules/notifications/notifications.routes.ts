import { Router } from "express";
import { requireAuth } from "../../middleware/require-auth";
import {
  listNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  getUnreadCount,
  getNotificationPrefs,
  updateNotificationPrefs,
} from "./notifications.controller";

const router = Router();

router.get("/api/notifications", requireAuth, listNotifications);
router.get("/api/notifications/unread-count", requireAuth, getUnreadCount);
router.patch("/api/notifications/read-all", requireAuth, markAllAsRead);
router.patch("/api/notifications/:id/read", requireAuth, markAsRead);
router.delete("/api/notifications/:id", requireAuth, deleteNotification);
router.get("/api/notifications/preferences", requireAuth, getNotificationPrefs);
router.patch("/api/notifications/preferences", requireAuth, updateNotificationPrefs);

export default router;
