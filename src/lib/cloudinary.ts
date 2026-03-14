import { v2 as cloudinary } from "cloudinary";
import { Readable } from "stream";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export interface CloudinaryUploadResult {
  url: string;
  secureUrl: string;
  publicId: string;
  format: string;
  width: number;
  height: number;
}

/**
 * Upload a file buffer to Cloudinary.
 *
 * @param buffer - Raw file bytes (from multer memoryStorage)
 * @param folder  - Cloudinary folder to store the file in (e.g. "events")
 * @param options - Optional Cloudinary upload options
 */
export function uploadBuffer(
  buffer: Buffer,
  folder: string,
  options: Record<string, unknown> = {}
): Promise<CloudinaryUploadResult> {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: "image",
        ...options,
      },
      (error, result) => {
        if (error || !result) return reject(error ?? new Error("Upload failed"));
        resolve({
          url: result.url,
          secureUrl: result.secure_url,
          publicId: result.public_id,
          format: result.format,
          width: result.width,
          height: result.height,
        });
      }
    );

    Readable.from(buffer).pipe(uploadStream);
  });
}

export { cloudinary };
