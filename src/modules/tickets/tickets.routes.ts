import { Router } from "express";
import { requireAuth } from "../../middleware/require-auth";
import { buyTicketsController, getMyTicketsController } from "./tickets.controller";

const router = Router();

router.post("/api/tickets/buy", requireAuth, buyTicketsController);
router.get("/api/tickets/my", requireAuth, getMyTicketsController);

export default router;
