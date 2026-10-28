import { Router } from "express";
import { requireAuth } from "../../middleware/require-auth";
import {
  checkInController,
  getCheckInCandidatesController,
  getCheckInStatsController,
  getPublicProfileController,
} from "./checkin.controller";

const router = Router();

// Public: what a phone camera shows after scanning someone's QR code.
router.get("/api/public/users/:publicId", getPublicProfileController);

// Merchant door tools.
router.post("/api/merchant/events/:eventId/check-ins", requireAuth, checkInController);
router.get("/api/merchant/events/:eventId/check-ins", requireAuth, getCheckInStatsController);
router.get("/api/merchant/check-in-candidates/:publicId", requireAuth, getCheckInCandidatesController);

export default router;
