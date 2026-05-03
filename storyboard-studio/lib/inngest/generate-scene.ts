import { inngest } from "@/lib/inngest/client";
import { prisma } from "@/lib/db";
import { canUseFalWebhooks } from "@/lib/fal/webhooks";
import {
  setJobState,
  deleteJobState,
} from "@/lib/redis";
import { getMediaProvider } from "@/lib/media/provider";

interface GenerateSceneEventData {
  sceneId: string;
  sketchDataUrl: string; // fal storage URL (uploaded client-side)
  motionPrompt: string;
  projectId: string;
  dialogue?: string;       // Phase 3: character dialogue for voice synthesis
  voiceSampleUrl?: string; // Phase 3: project-level voice cloning sample
}

export const generateScene = inngest.createFunction(
  {
    id: "generate-scene",
    retries: 2,
    cancelOn: [{ event: "studio/scene.cancel", match: "data.sceneId" }],
    onFailure: async ({ event, error }) => {
      const { sceneId } = event.data.event.data as GenerateSceneEventData;
      console.error(`[generate-scene] Failed for scene ${sceneId}:`, error);
      await prisma.scene.update({
        where: { id: sceneId },
        data: { status: "FAILED" },
      });
      try { await deleteJobState(sceneId); } catch { /* Redis unavailable */ }
    },
  },
  { event: "studio/scene.generate" },
  async ({ event, step }) => {
    const {
      sceneId,
      sketchDataUrl,
      motionPrompt,
      projectId,
      dialogue,
      voiceSampleUrl,
    } = event.data as GenerateSceneEventData;
    const media = getMediaProvider();
    const useFalWebhooks = media.backend === "fal" && canUseFalWebhooks();

    const now = Date.now();
    const sketchUrl = sketchDataUrl;

    // -------------------------------------------------------------------------
    // Step 1: Fetch character reference images first.
    // Must run before Flux so the primary ref can anchor character identity
    // in the generated start frame.
    // -------------------------------------------------------------------------
    const characterRefUrls = await step.run("fetch-character-refs", async () => {
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: { characterRefUrls: true },
      });
      return project?.characterRefUrls ?? [];
    });

    // -------------------------------------------------------------------------
    // Steps 2a + 2b: Run Flux uprender and Chatterbox voice synthesis IN PARALLEL.
    // These are independent operations — neither needs the other's output.
    // Running them concurrently saves 8–15 seconds per scene.
    // -------------------------------------------------------------------------
    const [uprenderUrl, voiceWavUrl] = await Promise.all([
      // 2a: Uprender sketch → photorealistic start frame.
      // Phase 4: If uprenderUrl was already set during the preview stage, reuse it —
      // Flux must only run ONCE per scene total (saves cost + ~15s).
      step.run("uprender-sketch", async () => {
        // Check for existing frame from preview stage
        const existing = await prisma.scene.findUnique({
          where: { id: sceneId },
          select: { uprenderUrl: true },
        });

        await prisma.scene.update({
          where: { id: sceneId },
          data: { status: "UPRENDERING" },
        });
        try {
          await setJobState(sceneId, {
            sceneId,
            step: "uprendering",
            startedAt: now,
            heartbeatAt: Date.now(),
          });
        } catch { /* Redis unavailable — non-fatal, rendering continues */ }

        if (existing?.uprenderUrl) {
          // Frame exists — skip Flux entirely, completes in <1s
          return existing.uprenderUrl;
        }

        // Use first character ref as identity anchor; fall back to sketch if none
        const primaryRef = characterRefUrls.length > 0 ? characterRefUrls[0] : undefined;
        const url = await media.generateFinalFrame({
          sketchUrl,
          motionPrompt,
          characterRefUrl: primaryRef,
        });

        await prisma.scene.update({
          where: { id: sceneId },
          data: { uprenderUrl: url },
        });

        return url;
      }),

      // 2b: Synthesize dialogue audio — step only created when dialogue exists.
      // Skipping the step entirely (not just returning null inside it) saves one
      // Inngest HTTP round-trip on every scene without voice.
      dialogue?.trim()
        ? step.run("synthesize-voice", async () => {
            try {
              return await media.synthesizeDialogue(dialogue, voiceSampleUrl);
            } catch (err) {
              console.error("[synthesize-voice] Chatterbox failed:", err);
              return null;
            }
          })
        : Promise.resolve(null),
    ]);

    // -------------------------------------------------------------------------
    // Step 3: Create Kling Voice ID from the synthesized WAV.
    // Voice ID is project-level — cached in Postgres and reused across scenes.
    // Returns null if no WAV was synthesized.
    // -------------------------------------------------------------------------
    // Skip the create-voice-id step entirely when there's no WAV — saves one round-trip.
    const voiceId = voiceWavUrl
      ? await step.run("create-voice-id", async () => {

      try {
        // Check if this project already has a cached Voice ID
        const project = await prisma.project.findUnique({
          where: { id: projectId },
          select: { klingVoiceId: true, voiceStatus: true },
        });

        if (project?.voiceStatus === "READY" && project.klingVoiceId) {
          // Cache hit — reuse without calling Kling again (<1s)
          return project.klingVoiceId;
        }

        // Create a new Voice ID from the synthesized WAV
        const id = await media.createVoice(voiceWavUrl, `project-${projectId}`);

        await prisma.project.update({
          where: { id: projectId },
          data: { klingVoiceId: id, voiceStatus: "READY" },
        });

        return id;
      } catch (err) {
        // Voice ID creation failure is non-fatal — scenes generate without audio
        console.error("[create-voice-id] Kling voice creation failed:", err);
        return null;
      }
    }) : null;

    // -------------------------------------------------------------------------
    // Step 4: Submit Seedance with optional voice ID.
    // For fal.ai we wait on the completion webhook instead of polling.
    // -------------------------------------------------------------------------
    const videoJob = await step.run("generate-video", async () => {
      await prisma.scene.update({
        where: { id: sceneId },
        data: { status: "GENERATING_VIDEO" },
      });

      const job = await media.submitFinalVideo({
        imageUrl: uprenderUrl,
        motionPrompt,
        characterRefUrls: characterRefUrls.length > 0 ? characterRefUrls : undefined,
        voiceId: voiceId ?? undefined,
      });

      try {
        await setJobState(sceneId, {
          sceneId,
          klingRequestId: job.requestId,
          step: "generating_video",
          startedAt: now,
          heartbeatAt: Date.now(),
        });
      } catch { /* Redis unavailable — non-fatal */ }

      return job;
    });

    let videoUrl: string;

    // LTX 2.3 renders in ~20–40s — polling is fine and avoids webhook complexity.
    // Kling takes ~90s, so the webhook path is worth it there for responsiveness.
    const useKlingWebhook = useFalWebhooks && videoJob.model === "kling";

    if (useKlingWebhook) {
      if (!videoJob.requestId) {
        throw new Error("Kling final video job missing requestId");
      }

      const completion = await step.waitForEvent("wait-for-kling-webhook", {
        event: "studio/kling.finished",
        timeout: "10m",
        if: `event.data.klingRequestId == ${JSON.stringify(videoJob.requestId)}`,
      });

      if (!completion) {
        throw new Error(
          `Kling job ${videoJob.requestId} timed out waiting for webhook`
        );
      }

      if (completion.data?.status !== "OK" || !completion.data.videoUrl) {
        throw new Error(
          completion.data?.error ?? `Kling job ${videoJob.requestId} failed`
        );
      }

      videoUrl = completion.data.videoUrl;
    } else {
      videoUrl = await media.waitForFinalVideo(videoJob);
    }

    // -------------------------------------------------------------------------
    // Step 5: Finalize — persist video URL to Postgres, clean up Redis
    // -------------------------------------------------------------------------
    await step.run("finalize", async () => {
      await prisma.scene.update({
        where: { id: sceneId },
        data: {
          videoUrl,
          status: "COMPLETE",
        },
      });
      try { await deleteJobState(sceneId); } catch { /* Redis unavailable */ }
    });

    return {
      sceneId,
      videoUrl,
    };
  }
);
