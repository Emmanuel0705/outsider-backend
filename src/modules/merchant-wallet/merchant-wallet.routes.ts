import { Router } from "express";
import { requireAuth } from "../../middleware/require-auth";
import { getMerchantWalletController } from "./merchant-wallet.controller";

const router = Router();

router.get("/api/merchant/wallet", requireAuth, getMerchantWalletController);

export default router;
