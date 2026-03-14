import { Router } from "express";
import { requireAuth } from "../../middleware/require-auth";
import {
  createEventController,
  deleteEventController,
  getEventByIdController,
  getMyEventsController,
  listPublicEventsController,
  updateEventController,
} from "./events.controller";

const router = Router();

router.post("/api/events", requireAuth, createEventController);
router.get("/api/events", listPublicEventsController);
router.get("/api/events/mine", requireAuth, getMyEventsController);
router.get("/api/events/:id", getEventByIdController);
router.put("/api/events/:id", requireAuth, updateEventController);
router.delete("/api/events/:id", requireAuth, deleteEventController);

export default router;
