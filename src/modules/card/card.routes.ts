import { Router } from "express";
import { requireAuth } from "../../middleware/require-auth";
import {
  connectCardController,
  createCardOrderController,
  getCardOverviewController,
  resolveCardController,
  updateCardOrderStatusController,
} from "./card.controller";

const router = Router();

router.get("/api/card", requireAuth, getCardOverviewController);
router.post("/api/card/order", requireAuth, createCardOrderController);
router.post("/api/card/connect", requireAuth, connectCardController);

// Resolver for virtual (QR) and physical (NFC) cards. Signed-in only, and it
// never returns the owner's user id now that QR codes are public links.
router.post("/api/card/resolve", requireAuth, resolveCardController);

// Internal/admin utility for updating delivery status.
router.patch("/api/card/order/:orderId/status", updateCardOrderStatusController);

export default router;
