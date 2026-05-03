import { z } from "zod";
import { router, publicProcedure } from "@/lib/trpc/server";
import { prisma } from "@/lib/db";
import { inngest } from "@/lib/inngest/client";
import { parseScript } from "@/lib/script/parser";
import { buildScenePrompt } from "@/lib/scene/prompt";

const ParsedSceneSchema = z.object({
  order: z.number(),
  title: z.string(),
  location: z.string(),
  weather: z.string(),
  action: z.string(),
  additional: z.string(),
  dialogue: z.string().nullable(),
  speakingCharacter: z.string().nullable(),
  characters: z.array(z.string()),
});

export const scriptRouter = router({
  /**
   * Parse a screenplay using GPT-4o-mini.
   * Returns structured scenes + character list for the client to display.
   */
  parseScript: publicProcedure
    .input(z.object({ scriptText: z.string().min(10).max(50000) }))
    .mutation(async ({ input }) => {
      return parseScript(input.scriptText);
    }),

  /**
   * Fire speculative Flux pre-generation for all scenes.
   * Called the moment the user uploads their first character image.
   * Results are cached in Redis (15 min TTL) and consumed by generate-scene
   * to skip Flux when the user actually clicks Run.
   */
  startSpeculativeGen: publicProcedure
    .input(
      z.object({
        projectId: z.string().cuid(),
        scenes: z.array(ParsedSceneSchema),
        characterRefUrl: z.string().url(),
      })
    )
    .mutation(async ({ input }) => {
      const events = input.scenes.map((scene) => ({
        name: "studio/speculative.generate" as const,
        data: {
          motionPrompt: buildScenePrompt(
            scene.location,
            scene.weather,
            scene.action,
            scene.additional
          ),
          characterRefUrl: input.characterRefUrl,
          projectId: input.projectId,
        },
      }));

      await inngest.send(events);
      return { queued: events.length };
    }),

  /**
   * Create all scenes from the parsed script and fire generation.
   * Character ref assignments are saved to the project before scenes start.
   * Each scene fires studio/scene.generate — which checks the speculative
   * Redis cache first, skipping Flux for any scene already pre-generated.
   */
  importScenes: publicProcedure
    .input(
      z.object({
        projectId: z.string().cuid(),
        scenes: z.array(ParsedSceneSchema),
        characterAssignments: z.array(
          z.object({ name: z.string(), url: z.string().url() })
        ),
      })
    )
    .mutation(async ({ input }) => {
      const characterRefUrls = input.characterAssignments.map((a) => a.url);
      const primaryRef = characterRefUrls[0] ?? null;

      // Update project character refs so generate-scene can find them
      if (characterRefUrls.length > 0) {
        await prisma.project.update({
          where: { id: input.projectId },
          data: { characterRefUrls },
        });
      }

      // Fetch voice sample URL for Inngest events
      const project = await prisma.project.findUnique({
        where: { id: input.projectId },
        select: { voiceSampleUrl: true },
      });

      // Create all scenes in a transaction so we either get all or none.
      // sortOrder is set explicitly so the continuity chain can find scene N+1.
      const scenes = await prisma.$transaction(
        input.scenes.map((scene, i) => {
          const motionPrompt = buildScenePrompt(
            scene.location,
            scene.weather,
            scene.action,
            scene.additional
          );
          return prisma.scene.create({
            data: {
              projectId: input.projectId,
              title: scene.title,
              motionPrompt,
              sketchDataUrl: primaryRef ?? "",
              dialogue: scene.dialogue ?? null,
              status: "PENDING",
              sortOrder: i,
            },
          });
        })
      );

      // Only fire scene 0. The continuity chain fires each subsequent scene
      // after the previous scene's uprender completes, passing that output frame
      // as the Flux input — so every scene inherits the previous one's outfit
      // and appearance, not just the original reference photo.
      await inngest.send({
        name: "studio/scene.generate" as const,
        data: {
          sceneId: scenes[0].id,
          sketchDataUrl: primaryRef ?? "",
          motionPrompt: scenes[0].motionPrompt,
          projectId: input.projectId,
          dialogue: scenes[0].dialogue ?? undefined,
          voiceSampleUrl: project?.voiceSampleUrl ?? undefined,
          chainContinuity: true,
        },
      });

      return { sceneIds: scenes.map((s) => s.id) };
    }),
});
