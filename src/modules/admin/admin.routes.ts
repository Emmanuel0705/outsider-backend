import { Router, NextFunction, Request, Response } from "express";
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
import { checkTopUpController, listTopUpsController, reconcileTopUpsController } from "../wallet/wallet.admin";

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

// Top-ups paid but not credited: list, check one with Paystack, or sweep all.
const safe = (fn: (req: Request, res: Response) => Promise<void>) => (req: Request, res: Response, next: NextFunction) =>
  fn(req, res).catch(next);
router.get("/api/admin/topups", requireAdmin, safe(listTopUpsController));
router.post("/api/admin/topups/reconcile", requireAdmin, safe(reconcileTopUpsController));
router.post("/api/admin/topups/:reference/check", requireAdmin, safe(checkTopUpController));

export default router;
