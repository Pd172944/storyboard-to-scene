import { generateScene } from "@/lib/inngest/generate-scene";

// Export all Inngest functions for registration with the serve handler
export const functions = [generateScene];

// Re-export the client for convenience
export { inngest } from "@/lib/inngest/client";
