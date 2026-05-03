import { generateScene } from "@/lib/inngest/generate-scene";
import { generatePreview } from "@/lib/inngest/generate-preview";
import { speculativeGenerate } from "@/lib/inngest/speculative-generate";

export const functions = [generateScene, generatePreview, speculativeGenerate];

// Re-export the client for convenience
export { inngest } from "@/lib/inngest/client";
