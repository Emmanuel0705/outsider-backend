import { Router } from "express";
import { requireAuth } from "../../middleware/require-auth";
import { createMerchantController } from "./merchant.controller";

const router = Router();

router.post("/api/merchants", requireAuth, createMerchantController);

export default router;
