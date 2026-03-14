import { Router } from "express";
import { requireAuth } from "../../middleware/require-auth";
import { getMeController, getUserController } from "./user.controller";

const router = Router();

router.get("/api/me", requireAuth, getMeController);
router.get("/api/user", requireAuth, getUserController);

export default router;
