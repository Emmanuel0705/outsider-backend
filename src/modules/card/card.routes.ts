import { Router } from "express";
import { requireAuth } from "../../middleware/require-auth";
import {
  connectCardController,
  createCardOrderController,
  getCardOverviewController,
  updateCardOrderStatusController,
} from "./card.controller";

const router = Router();

router.get("/api/card", requireAuth, getCardOverviewController);
router.post("/api/card/order", requireAuth, createCardOrderController);
router.post("/api/card/connect", requireAuth, connectCardController);

// Internal/admin utility for updating delivery status.
router.patch(
  "/api/card/order/:orderId/status",
  updateCardOrderStatusController
);

export default router;
