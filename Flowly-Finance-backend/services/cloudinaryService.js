import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import cloudinary, { isCloudinaryConfigured } from "../config/cloudinary.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Resilient local disk saver when Cloudinary is unavailable or in offline/test environments.
 */
const saveToLocalUploads = async (buffer, { userId, kind, originalName, mimeType } = {}) => {
  const ext = originalName
    ? path.extname(originalName)
    : mimeType === "application/pdf"
    ? ".pdf"
    : ".png";
  const cleanExt = ext || ".pdf";
  const safeName = `${kind || "doc"}-${userId || "usr"}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}${cleanExt}`;
  const targetDir = path.join(__dirname, "..", "uploads");
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }
  const filePath = path.join(targetDir, safeName);
  await fs.promises.writeFile(filePath, buffer);
  return {
    url: `/uploads/${safeName}`,
    publicId: safeName,
    resourceType: mimeType?.startsWith("image/") ? "image" : "raw",
    format: cleanExt.replace(".", ""),
    bytes: buffer.length,
    storageProvider: "local",
  };
};

/**
 * Upload one in-memory file (multer memoryStorage buffer) to Cloudinary, with local disk fallback.
 *
 * KYC files are uploaded with type "authenticated", so the plain
 * res.cloudinary.com URL does NOT work for anyone. We store a *signed* URL
 * instead: it is not guessable, but it works anywhere it is used
 * (<img src>, officer review screen, etc.) with no extra code on the client.
 *
 * @param {Buffer} buffer
 * @param {{ userId: string, kind: "pan"|"aadhaar"|"selfie"|"document", originalName?: string, mimeType?: string }} meta
 * @returns {Promise<{ url: string, publicId: string, resourceType: string, format: string, bytes: number, storageProvider: string }>}
 */
export const uploadKycFile = async (buffer, { userId, kind, originalName, mimeType } = {}) => {
  if (isCloudinaryConfigured()) {
    try {
      const root = process.env.CLOUDINARY_FOLDER || "flowly/kyc";

      return await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder: `${root}/${userId}`,
            public_id: `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            resource_type: "auto", // images -> "image", PDFs -> "image" too
            type: "authenticated", // private delivery, signed URL required
            overwrite: false,
            tags: ["kyc", kind],
          },
          (error, result) => {
            if (error) return reject(error);

            const resourceType = result.resource_type || "image";
            const isPdf =
              result.format === "pdf" ||
              mimeType === "application/pdf" ||
              originalName?.toLowerCase()?.endsWith(".pdf");
            const deliveryFormat =
              resourceType === "image" && isPdf
                ? "png"
                : resourceType === "raw"
                ? undefined
                : result.format;

            const url = cloudinary.url(result.public_id, {
              resource_type: resourceType,
              type: "authenticated",
              sign_url: true,
              secure: true,
              version: result.version,
              format: deliveryFormat,
            });

            resolve({
              url,
              publicId: result.public_id,
              resourceType,
              format: result.format,
              bytes: result.bytes,
              storageProvider: "cloudinary",
            });
          }
        );

        stream.end(buffer);
      });
    } catch (err) {
      console.warn("Cloudinary KYC upload warning, using local uploads storage:", err.message);
    }
  }

  return saveToLocalUploads(buffer, { userId, kind, originalName, mimeType });
};

/**
 * Upload one loan verification document (multer buffer) to Cloudinary or local uploads.
 *
 * @param {Buffer} buffer
 * @param {{ userId: string, kind: string, originalName?: string, mimeType?: string }} meta
 * @returns {Promise<{ url: string, publicId: string, resourceType: string, format: string, bytes: number, storageProvider: string }>}
 */
export const uploadLoanFile = async (buffer, { userId, kind, originalName, mimeType } = {}) => {
  if (isCloudinaryConfigured()) {
    try {
      const root = process.env.CLOUDINARY_FOLDER || "flowly/loans";

      return await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder: `${root}/${userId}`,
            public_id: `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            resource_type: "auto",
            type: "authenticated",
            overwrite: false,
            tags: ["loan", kind],
          },
          (error, result) => {
            if (error) return reject(error);

            const resourceType = result.resource_type || "image";
            const isPdf =
              result.format === "pdf" ||
              mimeType === "application/pdf" ||
              originalName?.toLowerCase()?.endsWith(".pdf");
            const deliveryFormat =
              resourceType === "image" && isPdf
                ? "png"
                : resourceType === "raw"
                ? undefined
                : result.format;

            const url = cloudinary.url(result.public_id, {
              resource_type: resourceType,
              type: "authenticated",
              sign_url: true,
              secure: true,
              version: result.version,
              format: deliveryFormat,
            });

            resolve({
              url,
              publicId: result.public_id,
              resourceType,
              format: result.format,
              bytes: result.bytes,
              storageProvider: "cloudinary",
            });
          }
        );

        stream.end(buffer);
      });
    } catch (err) {
      console.warn("Cloudinary loan document upload warning, using local uploads storage:", err.message);
    }
  }

  return saveToLocalUploads(buffer, { userId, kind, originalName, mimeType });
};

/**
 * Upload a generated FD certificate PDF (in-memory buffer) to Cloudinary.
 * Unlike KYC files, a certificate is meant to be openable by the customer
 * straight from an emailed/notified link, so it is uploaded as a normal
 * public "upload" resource rather than the "authenticated" type used for
 * private KYC documents.
 *
 * @param {Buffer} buffer
 * @param {{ userId: string, fdNumber: string }} meta
 * @returns {Promise<{ url: string, publicId: string, resourceType: string, format: string, bytes: number }>}
 */
export const uploadFDCertificate = (buffer, { userId, fdNumber }) => {
  if (!isCloudinaryConfigured()) {
    return Promise.reject(
      new Error(
        "Cloudinary is not configured (set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET)"
      )
    );
  }

  const root = process.env.CLOUDINARY_FOLDER || "flowly";

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: `${root}/fd-certificates/${userId}`,
        public_id: `${fdNumber}-certificate`,
        resource_type: "raw", // PDF
        type: "upload", // publicly fetchable, unlike KYC's "authenticated" files
        overwrite: true,
        format: "pdf",
        tags: ["fd", "certificate"],
      },
      (error, result) => {
        if (error) return reject(error);

        resolve({
          url: result.secure_url,
          publicId: result.public_id,
          resourceType: result.resource_type || "raw",
          format: result.format || "pdf",
          bytes: result.bytes,
        });
      }
    );

    stream.end(buffer);
  });
};

/** Best-effort delete (used to clean up if a later step of a submission fails). */
export const deleteKycFile = async (arg = {}) => {
  const publicId = typeof arg === "string" ? arg : arg?.publicId;
  const resourceType = typeof arg === "object" && arg?.resourceType ? arg.resourceType : "image";
  const storageProvider = typeof arg === "object" && arg?.storageProvider ? arg.storageProvider : "cloudinary";
  if (!publicId) return;
  if (storageProvider === "local") {
    try {
      const targetDir = path.join(__dirname, "..", "uploads");
      const filePath = path.join(targetDir, path.basename(publicId));
      if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath);
      }
    } catch (err) {
      console.error(`Local file cleanup failed for ${publicId}:`, err.message);
    }
    return;
  }
  try {
    await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType,
      type: "authenticated",
      invalidate: true,
    });
  } catch (err) {
    console.error(`Cloudinary cleanup failed for ${publicId}:`, err.message);
  }
};

/**
 * Upload a video KYC recording (a file on disk) to Cloudinary as a private
 * video. The file is streamed, so it is never held in memory as a whole.
 *
 * @returns {Promise<{ url: string, publicId: string, resourceType: string, format: string, bytes: number, durationSeconds: number }>}
 */
export const uploadKycVideo = (filePath, { userId, sessionId }) => {
  if (!isCloudinaryConfigured()) {
    return Promise.reject(new Error("Cloudinary is not configured"));
  }

  const root = process.env.CLOUDINARY_FOLDER || "flowly/kyc";

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: `${root}/${userId}/video-kyc`,
        public_id: `session-${sessionId}-${Date.now()}`,
        resource_type: "video",
        type: "authenticated",
        overwrite: false,
        tags: ["kyc", "video-kyc"],
      },
      (error, result) => {
        if (error) return reject(error);

        const url = cloudinary.url(result.public_id, {
          resource_type: "video",
          type: "authenticated",
          sign_url: true,
          secure: true,
          version: result.version,
          format: result.format,
        });

        resolve({
          url,
          publicId: result.public_id,
          resourceType: "video",
          format: result.format,
          bytes: result.bytes,
          durationSeconds: result.duration,
        });
      }
    );

    const source = fs.createReadStream(filePath);
    source.on("error", reject);
    source.pipe(stream);
  });
};