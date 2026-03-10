import { generateScene } from "@/lib/inngest/generate-scene";
import { generatePreview } from "@/lib/inngest/generate-preview";

// Export all Inngest functions for registration with the serve handler
export const functions = [generateScene, generatePreview];

// Re-export the client for convenience
export { inngest } from "@/lib/inngest/client";
