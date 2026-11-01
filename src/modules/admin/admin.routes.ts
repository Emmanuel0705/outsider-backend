import { Router } from "express";
import {
  adminLoginController,
  adminOverviewController,
  getAdminCardOrderDetailController,
  getAdminEventDetailController,
  getAdminUserDetailController,
  listAdminCardOrdersController,
  listAdminEventsController,
  listAdminUsersController,
  unlinkAdminUserCardController,
  updateAdminCardOrderStatusController,
  updateAdminEventStatusController,
  updateAdminUserStatusController,
} from "./admin.controller";
import { requireAdmin } from "../../middleware/require-admin";
import { reconcilePendingTopUps } from "../wallet/wallet.settlement";

const router = Router();

router.post("/api/admin/login", adminLoginController);

router.get("/api/admin/overview", requireAdmin, adminOverviewController);

router.get("/api/admin/users", requireAdmin, listAdminUsersController);
router.get("/api/admin/users/:userId", requireAdmin, getAdminUserDetailController);
router.patch(
  "/api/admin/users/:userId/status",
  requireAdmin,
  updateAdminUserStatusController
);
router.delete(
  "/api/admin/users/:userId/card",
  requireAdmin,
  unlinkAdminUserCardController
);

router.get("/api/admin/events", requireAdmin, listAdminEventsController);
router.get("/api/admin/events/:eventId", requireAdmin, getAdminEventDetailController);
router.patch(
  "/api/admin/events/:eventId/status",
  requireAdmin,
  updateAdminEventStatusController
);

router.get("/api/admin/card-orders", requireAdmin, listAdminCardOrdersController);
router.get(
  "/api/admin/card-orders/:orderId",
  requireAdmin,
  getAdminCardOrderDetailController
);
router.patch(
  "/api/admin/card-orders/:orderId/status",
  requireAdmin,
  updateAdminCardOrderStatusController
);

// Credit paid-but-unconfirmed top-ups now (the reconciler also runs on a timer).
router.post("/api/admin/topups/reconcile", requireAdmin, async (_req, res, next) => {
  try {
    res.json({ success: true, summary: await reconcilePendingTopUps({ minAgeMs: 0, recheckMs: 0, limit: 500 }) });
  } catch (error) {
    next(error);
  }
});

export default router;
