import { Request, Response } from "express";
import { uploadBuffer } from "../../lib/cloudinary";

export async function uploadImageController(req: Request, res: Response) {
  if (!req.file) {
    res.status(400).json({ error: "No file provided" });
    return;
  }

  console.log("Received file upload:", {
    originalname: req.file.originalname,
    mimetype: req.file.mimetype,
    size: req.file.size,
  });

  const folder = (req.query.folder as string) || "uploads";

  try {
    const result = await uploadBuffer(req.file.buffer, folder);
    res.json({
      url: result.secureUrl,
      publicId: result.publicId,
      width: result.width,
      height: result.height,
      format: result.format,
    });
  } catch (err) {
    console.log("Error uploading image:", err);
    const message = err instanceof Error ? err.message : "Upload failed";
    res.status(500).json({ error: message });
  }
}
