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

// Public resolver used by merchant scanners for both virtual (QR) and
// physical (NFC) cards. No auth: the payload itself is the credential.
router.post("/api/card/resolve", resolveCardController);

// Internal/admin utility for updating delivery status.
router.patch("/api/card/order/:orderId/status", updateCardOrderStatusController);

export default router;
