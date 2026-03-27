import { Router } from "express";
import { requireAuth } from "../../middleware/require-auth";
import { getMeController, patchMeController, getUserController, lookupUserByEmailController } from "./user.controller";

const router = Router();

router.get("/api/me", requireAuth, getMeController);
router.patch("/api/me", requireAuth, patchMeController);
router.get("/api/user", requireAuth, getUserController);
router.get("/api/users/lookup", requireAuth, lookupUserByEmailController);

export default router;
