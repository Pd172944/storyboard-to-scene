"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Film, Loader2, RefreshCw, User } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/routers/_app";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import type { StoryboardCanvasHandle } from "@/components/canvas/StoryboardCanvas";
import { SceneCard, type SceneFormData } from "@/components/scene/SceneCard";
import { CharacterRefUpload } from "@/components/scene/CharacterRefUpload";
import { cn } from "@/lib/utils";

const StoryboardCanvas = dynamic(
  () => import("@/components/canvas/StoryboardCanvas").then((mod) => mod.StoryboardCanvas),
  {
    ssr: false,
    loading: () => (
      <div
        className="flex items-center justify-center w-full bg-gray-900 rounded-xl border border-gray-700"
        style={{ height: 450, width: 800 }}
      >
        <p className="text-gray-500 text-sm">Loading canvas…</p>
      </div>
    ),
  }
);
import { JobStatusBoard } from "@/components/status/JobStatusBoard";
import { VideoPlayer } from "@/components/player/VideoPlayer";

type RouterOutputs = inferRouterOutputs<AppRouter>;
type ProjectScene = RouterOutputs["project"]["getProject"]["scenes"][number];

type SceneStatus =
  | "PENDING"
  | "UPLOADING"
  | "UPRENDERING"
  | "GENERATING_VIDEO"
  | "COMPLETE"
  | "FAILED";

type CharacterReelStatus = "NONE" | "PENDING" | "GENERATING" | "COMPLETE" | "FAILED";

export default function StudioPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId as string;

  const canvasRef = useRef<StoryboardCanvasHandle>(null);
  const [activeSceneId, setActiveSceneId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch project data
  const projectQuery = trpc.project.getProject.useQuery(
    { projectId },
    { enabled: !!projectId }
  );

  // Poll scene status every 3 seconds when a scene is active
  const sceneStatusQuery = trpc.scene.getSceneStatus.useQuery(
    { sceneId: activeSceneId! },
    {
      enabled: !!activeSceneId,
      refetchInterval: (query) => {
        const status = query.state.data?.status;
        if (status === "COMPLETE" || status === "FAILED") return false;
        return 3000;
      },
    }
  );

  const submitSceneMutation = trpc.scene.submitScene.useMutation();

  // Poll character reel status every 4 seconds while generating
  const reelStatusQuery = trpc.project.getCharacterReelStatus.useQuery(
    { projectId },
    {
      enabled: !!projectId,
      refetchInterval: (query) => {
        const status = query.state.data?.status;
        if (status === "GENERATING") return 4000;
        return false;
      },
    }
  );

  const characterReelStatus = (reelStatusQuery.data?.status ?? "NONE") as CharacterReelStatus;
  const characterRefUrls = reelStatusQuery.data?.refImageUrls ?? [];

  // Upload a data URL (canvas export) to fal storage via presigned URL
  const uploadSketch = useCallback(
    async (dataUrl: string): Promise<string> => {
      // Convert data URL to a File
      const resp = await fetch(dataUrl);
      const blob = await resp.blob();
      const file = new File([blob], `sketch-${Date.now()}.png`, {
        type: "image/png",
      });

      // Step 1: Get presigned upload URL
      const initiateResp = await fetch("/api/fal/storage/upload/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          file_name: file.name,
          content_type: file.type,
        }),
      });

      if (!initiateResp.ok) {
        const errBody = await initiateResp.text();
        console.error("Initiate sketch upload failed:", errBody);
        throw new Error("Failed to initiate sketch upload");
      }

      const { upload_url, file_url } = (await initiateResp.json()) as {
        upload_url: string;
        file_url: string;
      };

      // Step 2: PUT file to presigned URL
      const uploadResp = await fetch(upload_url, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });

      if (!uploadResp.ok) {
        throw new Error("Failed to upload sketch to storage");
      }

      return file_url;
    },
    []
  );

  const handleSubmit = useCallback(
    async (data: SceneFormData) => {
      if (!canvasRef.current) return;

      setIsSubmitting(true);
      try {
        // 1. Export sketch from canvas
        const sketchDataUrl = canvasRef.current.getSketchDataUrl();

        // 2. Upload sketch to fal storage via proxy
        const sketchUrl = await uploadSketch(sketchDataUrl);

        // 3. Submit scene via tRPC — reference image comes from project character refs (server-side)
        const result = await submitSceneMutation.mutateAsync({
          projectId,
          title: data.title,
          motionPrompt: data.motionPrompt,
          sketchDataUrl: sketchUrl,
        });

        setActiveSceneId(result.sceneId);
      } catch (error) {
        console.error("Failed to submit scene:", error);
      } finally {
        setIsSubmitting(false);
      }
    },
    [projectId, submitSceneMutation, uploadSketch]
  );

  // Auto-select the latest active scene on page load
  useEffect(() => {
    if (projectQuery.data?.scenes && !activeSceneId) {
      const activeScene = projectQuery.data.scenes.find(
        (s: ProjectScene) => s.status !== "COMPLETE" && s.status !== "FAILED"
      );
      if (activeScene) {
        setActiveSceneId(activeScene.id);
      }
    }
  }, [projectQuery.data, activeSceneId]);

  const sceneStatus = sceneStatusQuery.data?.status as
    | SceneStatus
    | undefined;
  const videoUrl = sceneStatusQuery.data?.videoUrl;
  const uprenderUrl = sceneStatusQuery.data?.uprenderUrl;

  const isJobActive =
    activeSceneId &&
    sceneStatus &&
    sceneStatus !== "COMPLETE" &&
    sceneStatus !== "FAILED" &&
    sceneStatus !== "PENDING";

  if (projectQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  if (projectQuery.error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p className="text-red-400">Failed to load project</p>
        <Button variant="outline" onClick={() => router.push("/")}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to projects
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Top bar */}
      <header className="flex items-center gap-4 border-b border-gray-800 px-6 py-3">
        <Button variant="ghost" size="sm" onClick={() => router.push("/")}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Projects
        </Button>
        <div className="flex items-center gap-2">
          <Film className="h-5 w-5 text-indigo-500" />
          <h1 className="text-lg font-semibold text-gray-100">
            {projectQuery.data?.title ?? "Untitled"}
          </h1>
        </div>
      </header>

      {/* Main layout */}
      <div className="flex h-[calc(100vh-57px)]">
        {/* Left panel: Canvas + Character Panel + Scene Card */}
        <div className="flex w-[60%] flex-col gap-4 overflow-y-auto border-r border-gray-800 p-6">
          <StoryboardCanvas ref={canvasRef} />

          {/* Character reference panel */}
          <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-indigo-400" />
                <h3 className="text-sm font-semibold text-gray-300">Character Identity</h3>
              </div>
              {characterReelStatus !== "NONE" && (
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-medium",
                    {
                      "bg-amber-500/15 text-amber-400": characterReelStatus === "PENDING",
                      "bg-indigo-500/15 text-indigo-400": characterReelStatus === "GENERATING",
                      "bg-emerald-500/15 text-emerald-400": characterReelStatus === "COMPLETE",
                      "bg-red-500/15 text-red-400": characterReelStatus === "FAILED",
                    }
                  )}
                >
                  {characterReelStatus === "PENDING" && "Pending"}
                  {characterReelStatus === "GENERATING" && "Generating reel…"}
                  {characterReelStatus === "COMPLETE" && "Reel ready"}
                  {characterReelStatus === "FAILED" && "Reel failed"}
                </span>
              )}
            </div>
            <CharacterRefUpload
              projectId={projectId}
              initialRefUrls={characterRefUrls}
              initialReelStatus={characterReelStatus}
            />
          </div>

          <SceneCard onSubmit={handleSubmit} isSubmitting={isSubmitting} />
        </div>

        {/* Right panel: Status / Video */}
        <div className="flex w-[40%] flex-col gap-6 overflow-y-auto p-6">
          {/* Show status board when a job is active */}
          {activeSceneId && sceneStatus && (
            <div className="space-y-6">
              <JobStatusBoard status={sceneStatus} reelStatus={characterReelStatus} />

              {/* Show uprendered image once available */}
              {uprenderUrl && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-gray-400">
                    Uprendered Frame
                  </h3>
                  <div className="overflow-hidden rounded-xl border border-gray-700">
                    <img
                      src={uprenderUrl}
                      alt="Uprendered first frame"
                      className="h-auto w-full"
                    />
                  </div>
                </div>
              )}

              {/* Show video player when complete */}
              {videoUrl && sceneStatus === "COMPLETE" && (
                <VideoPlayer src={videoUrl} title="Generated Video" />
              )}

              {/* Error message */}
              {sceneStatus === "FAILED" && (
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4">
                  <p className="text-sm text-red-300">
                    Scene generation failed. Please try again.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Empty state */}
          {!activeSceneId && (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-gray-600">
              <Film className="h-12 w-12" />
              <p className="text-center text-sm">
                Draw your scene on the canvas, fill in the details, and hit
                Generate to see the magic happen.
              </p>
            </div>
          )}

          {/* Previous scenes */}
          {projectQuery.data?.scenes &&
            projectQuery.data.scenes.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-400">
                  Previous Scenes
                </h3>
                {projectQuery.data.scenes
                  .filter((s: ProjectScene) => s.id !== activeSceneId)
                  .map((scene: ProjectScene) => (
                    <div
                      key={scene.id}
                      className="cursor-pointer rounded-lg border border-gray-700 bg-gray-900 p-3 transition-colors hover:border-gray-600"
                      onClick={() => setActiveSceneId(scene.id)}
                    >
                      <p className="text-sm font-medium text-gray-200">
                        {scene.title}
                      </p>
                      <p className="text-xs text-gray-500">
                        {scene.status} •{" "}
                        {new Date(scene.createdAt).toLocaleTimeString()}
                      </p>
                    </div>
                  ))}
              </div>
            )}
        </div>
      </div>
    </div>
  );
}
