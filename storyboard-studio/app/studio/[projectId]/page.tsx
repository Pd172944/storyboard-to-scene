"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft, Film, Loader2, Trash2, ChevronDown, ChevronUp,
  Share2, Check, Cpu, Zap, Plus,
} from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/routers/_app";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CharacterRefUpload } from "@/components/scene/CharacterRefUpload";
import { VoiceSampleUpload } from "@/components/scene/VoiceSampleUpload";
import { DropZone } from "@/components/drop-zone/DropZone";
import { SceneTimeline } from "@/components/timeline/SceneTimeline";
import { JobStatusBoard } from "@/components/status/JobStatusBoard";
import { VideoPlayer } from "@/components/player/VideoPlayer";
import { uploadFileToFalStorage } from "@/lib/fal/storage";
import {
  canRenderFinal, getSceneStage,
  type CharacterReelStatus, type SceneStatus, type VoiceStatus,
} from "@/lib/studio/status";

type RouterOutputs = inferRouterOutputs<AppRouter>;
type ProjectScene = RouterOutputs["project"]["getProject"]["scenes"][number];

function buildScenePrompt(
  location: string,
  weather: string,
  action: string,
  additional: string
): string {
  const parts: string[] = [];
  const context = [location.trim(), weather.trim()].filter(Boolean).join(", ");
  if (context) parts.push(context + ".");
  if (action.trim()) parts.push(action.trim());
  if (additional.trim()) parts.push(additional.trim());
  return parts.join(" ").trim();
}

export default function StudioPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = params.projectId as string;
  const seedImageUrl = searchParams.get("seed");

  const [activeSceneId, setActiveSceneId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isApproving, setIsApproving] = useState(false);

  const [imagePreview, setImagePreview] = useState<string | null>(seedImageUrl ?? null);
  const [imageUrl, setImageUrl] = useState<string | null>(seedImageUrl ?? null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  const [location, setLocation] = useState("");
  const [weather, setWeather] = useState("");
  const [action, setAction] = useState("");
  const [additional, setAdditional] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);

  const gpuEnabled = process.env.NEXT_PUBLIC_ENABLE_GPU === "true";
  const seedConsumed = useRef(false);

  // ---- Queries ----
  const projectQuery = trpc.project.getProject.useQuery({ projectId }, { enabled: !!projectId });

  const sceneStatusQuery = trpc.scene.getSceneStatus.useQuery(
    { sceneId: activeSceneId! },
    {
      enabled: !!activeSceneId,
      refetchInterval: (q) => {
        const s = q.state.data?.status;
        if (!s || s === "COMPLETE" || s === "FAILED" || s === "PREVIEW_READY" || s === "PREVIEW_FAILED") return false;
        return s === "PREVIEWING" ? 1000 : 3000;
      },
    }
  );

  const reelStatusQuery = trpc.project.getCharacterReelStatus.useQuery(
    { projectId },
    { enabled: !!projectId, refetchInterval: (q) => q.state.data?.status === "GENERATING" ? 4000 : false }
  );

  const voiceStatusQuery = trpc.project.getVoiceStatus.useQuery(
    { projectId },
    { enabled: !!projectId, refetchInterval: (q) => q.state.data?.voiceStatus === "CREATING" ? 4000 : false }
  );

  // ---- Mutations ----
  const submitFromImageMutation = trpc.scene.submitFromSingleImage.useMutation();
  const approveForRenderMutation = trpc.scene.approveForRender.useMutation();
  const createShareLinkMutation = trpc.share.createShareLink.useMutation();
  const deleteSceneMutation = trpc.scene.deleteScene.useMutation({
    onSuccess: (_d, v) => { if (activeSceneId === v.sceneId) setActiveSceneId(null); projectQuery.refetch(); },
  });

  const characterReelStatus = (reelStatusQuery.data?.status ?? "NONE") as CharacterReelStatus;
  const characterRefUrls = reelStatusQuery.data?.refImageUrls ?? [];
  const voiceSampleUrl = voiceStatusQuery.data?.voiceSampleUrl ?? null;
  const voiceStatus = (voiceStatusQuery.data?.voiceStatus ?? "NONE") as VoiceStatus;

  useEffect(() => {
    if (seedImageUrl && !seedConsumed.current) {
      seedConsumed.current = true;
      setImageUrl(seedImageUrl);
      setImagePreview(seedImageUrl);
    }
  }, [seedImageUrl]);

  const handleImageReady = useCallback(async (file: File, localPreview: string) => {
    setImagePreview(localPreview);
    setImageUrl(null);
    setIsUploadingImage(true);
    try {
      const url = await uploadFileToFalStorage(file);
      setImageUrl(url);
    } finally {
      setIsUploadingImage(false);
    }
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!imageUrl || !action.trim()) return;
    setIsSubmitting(true);
    try {
      const motionPrompt = buildScenePrompt(location, weather, action, additional);
      const titleHint = location.trim() || action.trim().split(/\s+/).slice(0, 6).join(" ");
      const result = await submitFromImageMutation.mutateAsync({
        projectId, imageUrl, motionPrompt, title: titleHint || undefined,
      });
      setActiveSceneId(result.sceneId);
      projectQuery.refetch();
    } finally {
      setIsSubmitting(false);
    }
  }, [imageUrl, location, weather, action, additional, projectId, submitFromImageMutation, projectQuery]);

  const handleApproveForRender = useCallback(async () => {
    if (!activeSceneId) return;
    setIsApproving(true);
    try {
      await approveForRenderMutation.mutateAsync({ sceneId: activeSceneId });
      sceneStatusQuery.refetch();
    } finally {
      setIsApproving(false);
    }
  }, [activeSceneId, approveForRenderMutation, sceneStatusQuery]);

  const handleShare = useCallback(async () => {
    if (!activeSceneId) return;
    try {
      const { shareToken } = await createShareLinkMutation.mutateAsync({ sceneId: activeSceneId });
      await navigator.clipboard.writeText(`${window.location.origin}/share/${shareToken}`);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2500);
    } catch {}
  }, [activeSceneId, createShareLinkMutation]);

  useEffect(() => {
    if (projectQuery.data?.scenes && !activeSceneId) {
      const active = projectQuery.data.scenes.find(
        (s: ProjectScene) => s.status !== "COMPLETE" && s.status !== "FAILED"
      );
      if (active) setActiveSceneId(active.id);
    }
  }, [projectQuery.data, activeSceneId]);

  const sceneStatus = sceneStatusQuery.data?.status as SceneStatus | undefined;
  const videoUrl = sceneStatusQuery.data?.videoUrl;
  const uprenderUrl = sceneStatusQuery.data?.uprenderUrl;
  const previewVideoUrl = sceneStatusQuery.data?.previewVideoUrl;
  const previewFrameUrl = sceneStatusQuery.data?.referenceImageUrl;
  const stage = getSceneStage(sceneStatus);
  const canRenderFinalAction = canRenderFinal(sceneStatus);
  const canShare = sceneStatus === "PREVIEW_READY" || sceneStatus === "COMPLETE";
  const canGenerate = !!imageUrl && !isUploadingImage && action.trim().length > 0 && !isSubmitting;

  const timelineScenes = (projectQuery.data?.scenes ?? []).map((s: ProjectScene) => ({
    id: s.id, title: s.title, status: s.status as SceneStatus,
    uprenderUrl: s.uprenderUrl, videoUrl: s.videoUrl, createdAt: s.createdAt,
  }));

  if (projectQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--accent)]" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-[var(--bg)]">
      {/* Header */}
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--line)] bg-white/80 px-5 py-3 backdrop-blur-lg">
        <button
          onClick={() => router.push("/")}
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-[var(--text-secondary)] transition hover:bg-[var(--line)] hover:text-[var(--text-primary)]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Projects
        </button>

        <div className="flex items-center gap-2">
          <Film className="h-4 w-4 text-[var(--accent)]" />
          <span className="text-sm font-semibold text-[var(--text-primary)]">
            {projectQuery.data?.title ?? "Studio"}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <div className="hidden items-center gap-1.5 rounded-full border border-[var(--line)] bg-white px-2.5 py-1 text-xs text-[var(--text-muted)] md:flex">
            {gpuEnabled ? <><Zap className="h-3 w-3 text-amber-500" />GPU</> : <><Cpu className="h-3 w-3" />API</>}
          </div>
          {canShare && (
            <button
              onClick={handleShare}
              disabled={createShareLinkMutation.isPending}
              className="flex items-center gap-1.5 rounded-lg border border-[var(--line)] bg-white px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] shadow-sm transition hover:border-[var(--accent)]/30 hover:text-[var(--accent)]"
            >
              {shareCopied ? <><Check className="h-3.5 w-3.5 text-green-500" />Copied!</> : <><Share2 className="h-3.5 w-3.5" />Share</>}
            </button>
          )}
        </div>
      </header>

      {/* Main — two columns */}
      <div className="flex flex-1 gap-0 overflow-hidden">
        {/* ---- LEFT: Input panel ---- */}
        <div className="flex w-[380px] shrink-0 flex-col gap-5 overflow-y-auto border-r border-[var(--line)] bg-white p-5">

          {/* Image */}
          <section>
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">
              Source Image
            </p>
            <DropZone
              onImageReady={handleImageReady}
              currentImage={imagePreview}
              uploading={isUploadingImage}
              compact
            />
          </section>

          {/* Scene Details — structured input */}
          <section className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">
              Scene Details
            </p>

            <div className="space-y-1.5">
              <p className="text-[11px] font-medium text-[var(--text-secondary)]">Location</p>
              <Input
                placeholder="Rain-soaked Tokyo alley, neon-lit"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                disabled={isSubmitting}
                className="rounded-xl border-[var(--line)] bg-[var(--bg)] text-sm placeholder:text-[var(--text-muted)] focus-visible:ring-[var(--accent)]/40"
              />
            </div>

            <div className="space-y-1.5">
              <p className="text-[11px] font-medium text-[var(--text-secondary)]">Weather / Lighting</p>
              <Input
                placeholder="Overcast, soft diffused daylight"
                value={weather}
                onChange={(e) => setWeather(e.target.value)}
                disabled={isSubmitting}
                className="rounded-xl border-[var(--line)] bg-[var(--bg)] text-sm placeholder:text-[var(--text-muted)] focus-visible:ring-[var(--accent)]/40"
              />
            </div>

            <div className="space-y-1.5">
              <p className="text-[11px] font-medium text-[var(--text-secondary)]">Action <span className="text-[var(--text-muted)] font-normal">— required</span></p>
              <Textarea
                placeholder="A woman steps into frame, pauses under flickering neon, then slowly turns toward camera"
                value={action}
                onChange={(e) => setAction(e.target.value)}
                disabled={isSubmitting}
                rows={3}
                className="resize-none rounded-xl border-[var(--line)] bg-[var(--bg)] text-sm placeholder:text-[var(--text-muted)] focus:border-[var(--accent)]/50 focus:ring-0"
              />
            </div>

            <div className="space-y-1.5">
              <p className="text-[11px] font-medium text-[var(--text-secondary)]">Additional <span className="text-[var(--text-muted)] font-normal">— optional</span></p>
              <Textarea
                placeholder="Camera language, specific lighting cues, mood, pacing, shot framing, or anything else that completes the scene…"
                value={additional}
                onChange={(e) => setAdditional(e.target.value)}
                disabled={isSubmitting}
                rows={4}
                className="resize-none rounded-xl border-[var(--line)] bg-[var(--bg)] text-sm placeholder:text-[var(--text-muted)] focus:border-[var(--accent)]/50 focus:ring-0"
              />
            </div>
          </section>

          {/* Primary CTA */}
          <button
            onClick={handleGenerate}
            disabled={!canGenerate}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent)] py-3 text-sm font-semibold text-white shadow-sm transition disabled:cursor-not-allowed disabled:opacity-40 hover:bg-[var(--accent-deep)] active:scale-[0.98]"
          >
            {isSubmitting ? <><Loader2 className="h-4 w-4 animate-spin" />Generating…</> : <><Plus className="h-4 w-4" />Generate Preview</>}
          </button>

          {/* Render final */}
          {canRenderFinalAction && (
            <button
              onClick={handleApproveForRender}
              disabled={isApproving}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--accent)]/30 bg-[var(--accent-light)] py-3 text-sm font-semibold text-[var(--accent)] transition disabled:opacity-50 hover:bg-[var(--accent)]/15 active:scale-[0.98]"
            >
              {isApproving ? <><Loader2 className="h-4 w-4 animate-spin" />Starting render…</> : <><Zap className="h-4 w-4" />Render Final Video</>}
            </button>
          )}

          {/* Advanced accordion */}
          <div className="rounded-xl border border-[var(--line)] bg-[var(--bg)]">
            <button
              type="button"
              onClick={() => setShowAdvanced(v => !v)}
              className="flex w-full items-center justify-between px-4 py-3 text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]"
            >
              <span>Character &amp; Voice</span>
              {showAdvanced ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
            {showAdvanced && (
              <div className="border-t border-[var(--line)] px-4 pb-4 pt-3 space-y-4">
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">Character Reference</p>
                  <CharacterRefUpload projectId={projectId} initialRefUrls={characterRefUrls} initialReelStatus={characterReelStatus} />
                </div>
                <div className="border-t border-[var(--line)] pt-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">Voice Sample</p>
                  <VoiceSampleUpload projectId={projectId} initialVoiceSampleUrl={voiceSampleUrl} initialVoiceStatus={voiceStatus} />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ---- RIGHT: Preview + Timeline ---- */}
        <div className="flex flex-1 flex-col overflow-y-auto bg-[var(--bg)] p-6 gap-5">
          {activeSceneId && sceneStatus ? (
            <>
              <JobStatusBoard status={sceneStatus} hasDialogue={false} previewFrameReady={!!previewFrameUrl} stage={stage} />

              <VideoPlayer
                videoUrl={videoUrl}
                previewVideoUrl={previewVideoUrl}
                previewFrameUrl={previewFrameUrl}
                sceneStatus={sceneStatus}
                onRenderFinal={handleApproveForRender}
                isApproving={isApproving}
              />

              {uprenderUrl && stage === "final" && sceneStatus === "UPRENDERING" && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">Start Frame</p>
                  <div className="overflow-hidden rounded-2xl border border-[var(--line)] shadow-sm">
                    <img src={uprenderUrl} alt="Uprendered frame" className="w-full" />
                  </div>
                </div>
              )}

              {(sceneStatus === "COMPLETE" || sceneStatus === "FAILED") && (
                <button
                  onClick={() => { if (confirm("Delete this scene?")) deleteSceneMutation.mutate({ sceneId: activeSceneId! }); }}
                  disabled={deleteSceneMutation.isPending}
                  className="flex items-center gap-1.5 self-start rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-500 transition hover:bg-red-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete scene
                </button>
              )}
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center py-20">
              <div className="rounded-2xl border border-[var(--line)] bg-white p-6 shadow-sm">
                <Film className="mx-auto h-8 w-8 text-[var(--text-muted)] opacity-40" />
                <p className="mt-3 text-sm font-medium text-[var(--text-secondary)]">No scene yet</p>
                <p className="mt-1 text-xs text-[var(--text-muted)] max-w-[220px] mx-auto leading-relaxed">
                  Drop a photo, fill in the scene details, and click <strong>Generate Preview</strong>.
                </p>
              </div>
            </div>
          )}

          {/* Timeline */}
          {timelineScenes.length > 0 && (
            <div className="mt-auto border-t border-[var(--line)] pt-4">
              <SceneTimeline
                scenes={timelineScenes}
                activeSceneId={activeSceneId}
                onSelect={setActiveSceneId}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
