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
    <div className="group relative overflow-hidden rounded-xl border border-gray-700 bg-black">
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

      {/* Controls — hidden when dimmed (final rendering overlay takes over) */}
      {!dimmed && (
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-3 opacity-0 transition-opacity group-hover:opacity-100">
          <div
            className="mb-2 h-1 cursor-pointer rounded-full bg-gray-700"
            onClick={handleProgressClick}
          >
            <div
              className="h-full rounded-full bg-indigo-500 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={togglePlay}>
              {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </Button>
            <div className="flex-1" />
            <Button variant="ghost" size="sm" onClick={handleFullscreen}>
              <Maximize2 className="h-4 w-4" />
            </Button>
            <a href={src} download target="_blank" rel="noopener noreferrer">
              <Button variant="ghost" size="sm">
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
      {title && <h3 className="text-sm font-semibold text-gray-300">{title}</h3>}

      {/* ── PREVIEWING — skeleton shimmer ─────────────────────────────────── */}
      {sceneStatus === "PREVIEWING" && (
        <div className="relative overflow-hidden rounded-xl border border-gray-700 bg-gray-900 aspect-video">
          {previewFrameUrl ? (
            <img
              src={previewFrameUrl}
              alt="Photoreal preview frame"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/5 to-transparent" />
          )}
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/45">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-400" />
            <p className="text-sm font-medium text-gray-200">
              {previewFrameUrl ? "Animating preview…" : "Building preview frame…"}
            </p>
            <span className="rounded-full bg-indigo-500/20 px-2.5 py-0.5 text-xs text-indigo-200 font-medium">
              {previewFrameUrl ? "Another ~10-15 seconds" : "~30-40 seconds total"}
            </span>
          </div>
        </div>
      )}

      {/* ── PREVIEW_READY — draft with render button ───────────────────────── */}
      {sceneStatus === "PREVIEW_READY" && previewVideoUrl && (
        <div className="relative rounded-xl ring-2 ring-amber-400/40 ring-offset-1 ring-offset-gray-950">
          <VideoCore src={previewVideoUrl} loop />
          {/* Draft badge */}
          <span className="absolute left-2 top-2 rounded-md bg-amber-400/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gray-900">
            Draft
          </span>
          {/* Render Final button */}
          <div className="absolute bottom-3 right-3">
            <Button
              size="sm"
              onClick={onRenderFinal}
              disabled={isApproving}
              className="bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg"
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

      {sceneStatus === "PREVIEW_READY" && !previewVideoUrl && previewFrameUrl && (
        <div className="relative rounded-xl ring-2 ring-amber-400/40 ring-offset-1 ring-offset-gray-950 overflow-hidden border border-gray-700 bg-black">
          <img
            src={previewFrameUrl}
            alt="Preview frame"
            className="h-auto w-full"
          />
          <span className="absolute left-2 top-2 rounded-md bg-amber-400/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gray-900">
            Preview Frame
          </span>
          <div className="absolute bottom-3 right-3">
            <Button
              size="sm"
              onClick={onRenderFinal}
              disabled={isApproving}
              className="bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg"
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

      {/* ── PREVIEW_FAILED — error with bypass option ──────────────────────── */}
      {sceneStatus === "PREVIEW_FAILED" && (
        <div className="space-y-3">
          {previewFrameUrl && (
            <div className="overflow-hidden rounded-xl border border-gray-700 bg-black">
              <img
                src={previewFrameUrl}
                alt="Preview frame"
                className="h-auto w-full"
              />
            </div>
          )}
          <div className="overflow-hidden rounded-xl border border-red-500/30 bg-red-500/10 p-6 flex flex-col items-center gap-4">
            <p className="text-sm text-red-300 text-center">
              Draft video generation failed. The preview frame is still usable, and you can send the scene through the full render path.
            </p>
            <Button
              size="sm"
              onClick={onRenderFinal}
              disabled={isApproving}
              className="bg-indigo-600 hover:bg-indigo-500 text-white"
            >
              {isApproving ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Zap className="mr-1.5 h-3.5 w-3.5" />
              )}
              Render Final anyway
            </Button>
          </div>
        </div>
      )}

      {/* ── UPRENDERING / GENERATING_VIDEO — draft dimmed + overlay ──────────── */}
      {(sceneStatus === "UPRENDERING" || sceneStatus === "GENERATING_VIDEO") && (
        <div className="relative">
          {previewVideoUrl ? (
            <VideoCore src={previewVideoUrl} loop dimmed />
          ) : (
            <div className="rounded-xl border border-gray-700 bg-gray-900 aspect-video" />
          )}
          {/* Rendering overlay */}
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-xl">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-400" />
            <p className="text-sm font-medium text-gray-200">Rendering final version…</p>
            <span className="rounded-full bg-gray-800 px-2.5 py-0.5 text-xs text-gray-400">
              ~60–90 seconds
            </span>
          </div>
        </div>
      )}

      {/* ── COMPLETE — final video full quality ───────────────────────────── */}
      {sceneStatus === "COMPLETE" && videoUrl && (
        <div className="relative">
          <VideoCore src={videoUrl} />
          <span className="absolute left-2 top-2 rounded-md bg-emerald-500/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gray-900">
            Final
          </span>
        </div>
      )}

      {/* ── FAILED — final render failed ──────────────────────────────────── */}
      {sceneStatus === "FAILED" && (
        <div className="overflow-hidden rounded-xl border border-red-500/30 bg-red-500/10 p-4">
          <p className="text-sm text-red-300">Final render failed. Please try again.</p>
        </div>
      )}
    </div>
  );
}
