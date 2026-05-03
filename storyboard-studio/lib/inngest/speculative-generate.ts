import { inngest } from "@/lib/inngest/client";
import { getMediaProvider } from "@/lib/media/provider";
import { computeSpeculativeKey, setSpeculativeCache } from "@/lib/redis";

interface SpeculativeGenerateEventData {
  motionPrompt: string;
  characterRefUrl: string;
  projectId: string;
}

// Best-effort: no retries. If Flux fails, generate-scene falls back to running
// Flux inline. The speculative cache is a pure latency optimization — never
// load-bearing for correctness.
export const speculativeGenerate = inngest.createFunction(
  { id: "speculative-generate", retries: 0 },
  { event: "studio/speculative.generate" },
  async ({ event, step }) => {
    const { motionPrompt, characterRefUrl } =
      event.data as SpeculativeGenerateEventData;

    const media = getMediaProvider();

    const uprenderUrl = await step.run("run-speculative-flux", async () => {
      const url = await media.generateFinalFrame({
        sketchUrl: characterRefUrl,
        motionPrompt,
        characterRefUrl,
      });

      const key = computeSpeculativeKey(motionPrompt, characterRefUrl);
      await setSpeculativeCache(key, url);

      return url;
    });

    return { uprenderUrl };
  }
);
