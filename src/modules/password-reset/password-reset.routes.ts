import { Router } from "express";
import { requestPasswordReset, verifyResetOTP } from "./password-reset.controller";

const router = Router();

router.post("/api/password-reset/request", requestPasswordReset);
router.post("/api/password-reset/verify-otp", verifyResetOTP);

export default router;
