import { router } from "@/lib/trpc/server";
import { projectRouter } from "@/server/routers/project";
import { sceneRouter } from "@/server/routers/scene";
import { shareRouter } from "@/server/routers/share";
import { scriptRouter } from "@/server/routers/script";

export const appRouter = router({
  project: projectRouter,
  scene: sceneRouter,
  share: shareRouter,
  script: scriptRouter,
});

export type AppRouter = typeof appRouter;
