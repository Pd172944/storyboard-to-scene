"use client";

import { useRef, useState, useCallback } from "react";
import { Play, Pause, Maximize2, Download, Loader2, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SceneStatus } from "@/lib/studio/status";

interface VideoPlayerProps {
  videoUrl?: string | null;
  previewVideoUrl?: string | null;
  previewFrameUrl?: string | null;
  sceneStatus: SceneStatus;
  onRenderFinal?: () => void;
  isApproving?: boolean;
  title?: string;
  className?: string;
}

function VideoCore({
  src,
  loop = false,
  dimmed = false,
}: {
  src: string;
  loop?: boolean;
  dimmed?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.paused ? v.play() : v.pause();
  }, []);

  const handleTimeUpdate = useCallback(() => {
    const v = videoRef.current;
    if (!v || !v.duration) return;
    setProgress((v.currentTime / v.duration) * 100);
  }, []);

  const handleProgressClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const v = videoRef.current;
    if (!v || !v.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    v.currentTime = ((e.clientX - rect.left) / rect.width) * v.duration;
  }, []);

  const handleFullscreen = useCallback(() => {
    videoRef.current?.requestFullscreen?.();
  }, []);

  return (
    <div className="group relative overflow-hidden rounded-xl border border-[var(--line-strong)] bg-[var(--bg)]">
      <video
        ref={videoRef}
        src={src}
        loop={loop}
        autoPlay={loop}
        muted={loop}
        className={cn("h-auto w-full transition-opacity duration-300", dimmed && "opacity-40")}
        onTimeUpdate={handleTimeUpdate}
        onEnded={() => setIsPlaying(false)}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        playsInline
        preload="metadata"
      />

      {/* Controls — hidden when dimmed */}
      {!dimmed && (
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3 opacity-0 transition-opacity group-hover:opacity-100">
          <div
            className="mb-2 h-1 cursor-pointer rounded-full bg-white/30"
            onClick={handleProgressClick}
          >
            <div
              className="h-full rounded-full bg-[var(--accent)] transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={togglePlay} className="text-white hover:text-white hover:bg-white/20">
              {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </Button>
            <div className="flex-1" />
            <Button variant="ghost" size="sm" onClick={handleFullscreen} className="text-white hover:text-white hover:bg-white/20">
              <Maximize2 className="h-4 w-4" />
            </Button>
            <a href={src} download target="_blank" rel="noopener noreferrer">
              <Button variant="ghost" size="sm" className="text-white hover:text-white hover:bg-white/20">
                <Download className="h-4 w-4" />
              </Button>
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

export function VideoPlayer({
  videoUrl,
  previewVideoUrl,
  previewFrameUrl,
  sceneStatus,
  onRenderFinal,
  isApproving = false,
  title,
  className,
}: VideoPlayerProps) {
  return (
    <div className={cn("space-y-3", className)}>
      {title && <h3 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h3>}

      {/* ── PREVIEWING — keyframe generation ─────────────────────────────── */}
      {sceneStatus === "PREVIEWING" && (
        <div className="relative overflow-hidden rounded-xl border border-[var(--line-strong)] bg-[var(--line)] aspect-video">
          {previewFrameUrl ? (
            <img
              src={previewFrameUrl}
              alt="Photoreal preview frame"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/40 to-transparent" />
          )}
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/30">
            <Loader2 className="h-8 w-8 animate-spin text-white" />
            <p className="text-sm font-medium text-white drop-shadow">
              {previewFrameUrl ? "Refining keyframe…" : "Generating keyframe…"}
            </p>
            <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-xs text-white font-medium backdrop-blur-sm">
              {previewFrameUrl ? "Almost there" : "~10–20 seconds total"}
            </span>
          </div>
        </div>
      )}

      {sceneStatus === "PREVIEW_READY" && !previewVideoUrl && previewFrameUrl && (
        <div className="relative rounded-xl ring-2 ring-amber-400/50 overflow-hidden border border-[var(--line-strong)] bg-[var(--bg)]">
          <img
            src={previewFrameUrl}
            alt="Preview frame"
            className="h-auto w-full"
          />
          <span className="absolute left-2 top-2 rounded-md bg-amber-400 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white shadow-sm">
            Keyframe
          </span>
          <div className="absolute bottom-3 right-3">
            <Button
              size="sm"
              onClick={onRenderFinal}
              disabled={isApproving}
              className="btn-accent shadow-lg"
            >
              {isApproving ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Zap className="mr-1.5 h-3.5 w-3.5" />
              )}
              Render Final
            </Button>
          </div>
        </div>
      )}

      {/* ── PREVIEW_FAILED ───────────────────────────────────────────────── */}
      {sceneStatus === "PREVIEW_FAILED" && (
        <div className="space-y-3">
          {previewFrameUrl && (
            <div className="overflow-hidden rounded-xl border border-[var(--line-strong)] bg-[var(--bg)]">
              <img
                src={previewFrameUrl}
                alt="Preview frame"
                className="h-auto w-full"
              />
            </div>
          )}
          <div className="overflow-hidden rounded-xl border border-red-200 bg-red-50 p-6 flex flex-col items-center gap-4">
            <p className="text-sm text-red-600 text-center">
              Keyframe generation failed. Adjust the prompt and try again.
            </p>
          </div>
        </div>
      )}

      {/* ── UPRENDERING / GENERATING_VIDEO ───────────────────────────────── */}
      {(sceneStatus === "UPRENDERING" || sceneStatus === "GENERATING_VIDEO") && (
        <div className="relative">
          {previewVideoUrl ? (
            <VideoCore src={previewVideoUrl} loop dimmed />
          ) : (
            <div className="rounded-xl border border-[var(--line-strong)] bg-[var(--line)] aspect-video" />
          )}
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-xl">
            <Loader2 className="h-8 w-8 animate-spin text-white drop-shadow" />
            <p className="text-sm font-medium text-white drop-shadow">Rendering final version…</p>
            <span className="rounded-full bg-white/80 px-2.5 py-0.5 text-xs text-[var(--text-secondary)] shadow-sm">
              ~60–90 seconds
            </span>
          </div>
        </div>
      )}

      {/* ── COMPLETE ─────────────────────────────────────────────────────── */}
      {sceneStatus === "COMPLETE" && videoUrl && (
        <div className="relative">
          <VideoCore src={videoUrl} />
          <span className="absolute left-2 top-2 rounded-md bg-emerald-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white shadow-sm">
            Final
          </span>
        </div>
      )}

      {/* ── FAILED ───────────────────────────────────────────────────────── */}
      {sceneStatus === "FAILED" && (
        <div className="overflow-hidden rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-600">Final render failed. Please try again.</p>
        </div>
      )}
    </div>
  );
}
