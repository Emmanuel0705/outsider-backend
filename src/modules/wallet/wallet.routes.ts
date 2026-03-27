import { Router } from "express";
import { requireAuth } from "../../middleware/require-auth";
import {
  getWalletController,
  initiateTopUpController,
  verifyTopUpController,
  getUserTransactionsController,
} from "./wallet.controller";

const router = Router();

router.get("/api/wallet", requireAuth, getWalletController);
router.post("/api/wallet/topup/initiate", requireAuth, initiateTopUpController);
router.post("/api/wallet/topup/verify", requireAuth, verifyTopUpController);
router.get(
  "/api/wallet/transactions",
  requireAuth,
  getUserTransactionsController,
);

export default router;
