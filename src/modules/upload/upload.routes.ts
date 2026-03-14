import { Router } from "express";
import multer from "multer";
import { requireAuth } from "../../middleware/require-auth";
import { uploadImageController } from "./upload.controller";

const router = Router();

// Store uploaded file in memory so we can pass the buffer to Cloudinary
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB cap
  fileFilter(_, file, cb) {
    if (!file.mimetype.startsWith("image/")) {
      cb(new Error("Only image files are allowed"));
      return;
    }
    cb(null, true);
  },
});

router.post(
  "/api/upload",
  requireAuth,
  upload.single("file"),
  uploadImageController
);

export default router;
