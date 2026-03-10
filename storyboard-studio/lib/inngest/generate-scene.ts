import { inngest } from "@/lib/inngest/client";
import { prisma } from "@/lib/db";
import {
  setJobState,
  deleteJobState,
} from "@/lib/redis";
import { upsampleSketch } from "@/lib/fal/flux";
import { submitKlingJob, waitForKlingCompletion, createKlingVoice } from "@/lib/fal/kling";
import { synthesizeDialogue } from "@/lib/fal/chatterbox";

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
        await setJobState(sceneId, {
          sceneId,
          step: "uprendering",
          startedAt: now,
          heartbeatAt: Date.now(),
        });

        if (existing?.uprenderUrl) {
          // Frame exists — skip Flux entirely, completes in <1s
          return existing.uprenderUrl;
        }

        // Use first character ref as identity anchor; fall back to sketch if none
        const primaryRef = characterRefUrls.length > 0 ? characterRefUrls[0] : undefined;
        const url = await upsampleSketch(sketchUrl, motionPrompt, primaryRef);

        await prisma.scene.update({
          where: { id: sceneId },
          data: { uprenderUrl: url },
        });

        return url;
      }),

      // 2b: Synthesize dialogue audio (skipped if no dialogue)
      step.run("synthesize-voice", async () => {
        if (!dialogue?.trim()) return null;

        try {
          const wavUrl = await synthesizeDialogue(dialogue, voiceSampleUrl);
          return wavUrl;
        } catch (err) {
          // Voice failure is non-fatal — log and continue without audio
          console.error("[synthesize-voice] Chatterbox failed:", err);
          return null;
        }
      }),
    ]);

    // -------------------------------------------------------------------------
    // Step 3: Create Kling Voice ID from the synthesized WAV.
    // Voice ID is project-level — cached in Postgres and reused across scenes.
    // Returns null if no WAV was synthesized.
    // -------------------------------------------------------------------------
    const voiceId = await step.run("create-voice-id", async () => {
      if (!voiceWavUrl) return null;

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
        const id = await createKlingVoice(voiceWavUrl, `project-${projectId}`);

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
    });

    // -------------------------------------------------------------------------
    // Step 4: Submit Kling O3 Pro R2V with character elements + optional voice ID.
    // Poll until the video is ready.
    // -------------------------------------------------------------------------
    const videoUrl = await step.run("generate-video", async () => {
      await prisma.scene.update({
        where: { id: sceneId },
        data: { status: "GENERATING_VIDEO" },
      });

      const requestId = await submitKlingJob(
        uprenderUrl,
        motionPrompt,
        characterRefUrls.length > 0 ? characterRefUrls : undefined,
        voiceId ?? undefined
      );

      await setJobState(sceneId, {
        sceneId,
        klingRequestId: requestId,
        step: "generating_video",
        startedAt: now,
        heartbeatAt: Date.now(),
      });

      // Poll until the video is ready (up to ~10 minutes)
      const url = await waitForKlingCompletion(requestId);
      return url;
    });

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
      await deleteJobState(sceneId);
    });

    return {
      sceneId,
      videoUrl,
    };
  }
);
