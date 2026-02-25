import { fal } from "@fal-ai/client";

fal.config({
  credentials: process.env.FAL_KEY,
});

export { fal };

/**
 * Upload a blob to fal.ai storage and return the CDN URL.
 */
export async function uploadToFal(
  blob: Blob,
  filename: string
): Promise<string> {
  try {
    const file = new File([blob], filename, { type: blob.type });
    const url = await fal.storage.upload(file);
    return url;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown upload error";
    throw new Error(`Failed to upload "${filename}" to fal.ai storage: ${message}`);
  }
}

/**
 * Convert a base64 data URL to a Blob.
 */
export function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64Data] = dataUrl.split(",");
  if (!header || !base64Data) {
    throw new Error("Invalid data URL format");
  }
  const mimeMatch = header.match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : "image/png";
  const byteString = atob(base64Data);
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }
  return new Blob([ab], { type: mime });
}
