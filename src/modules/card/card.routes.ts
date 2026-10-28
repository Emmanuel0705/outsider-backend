import { Router } from "express";
import { requireAuth } from "../../middleware/require-auth";
import { resolveEntryController } from "../checkin/checkin.controller";
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

// Resolver for virtual (QR) and physical (NFC) cards, for merchant scanners.
// QR ids are public profile links now, so it never returns user ids or card ids.
router.post("/api/card/resolve", requireAuth, resolveEntryController);

// Internal/admin utility for updating delivery status.
router.patch("/api/card/order/:orderId/status", updateCardOrderStatusController);

export default router;
