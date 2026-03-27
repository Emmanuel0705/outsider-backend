import { Router } from "express";
import { requireAuth } from "../../middleware/require-auth";
import {
  getMerchantWalletController,
  getMerchantTransactionsController,
  withdrawMerchantWalletController,
} from "./merchant-wallet.controller";

const router = Router();

router.get("/api/merchant/wallet", requireAuth, getMerchantWalletController);
router.get("/api/merchant/wallet/transactions", requireAuth, getMerchantTransactionsController);
router.post("/api/merchant/wallet/withdraw", requireAuth, withdrawMerchantWalletController);

export default router;
