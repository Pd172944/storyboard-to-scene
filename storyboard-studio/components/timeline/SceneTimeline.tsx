"use client";

import { Film, Loader2, CheckCircle2, XCircle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SceneStatus } from "@/lib/studio/status";

export interface TimelineScene {
  id: string;
  title: string;
  status: SceneStatus;
  uprenderUrl?: string | null;
  videoUrl?: string | null;
  createdAt: Date | string;
}

interface SceneTimelineProps {
  scenes: TimelineScene[];
  activeSceneId?: string | null;
  onSelect: (sceneId: string) => void;
  className?: string;
}

function StatusIcon({ status }: { status: SceneStatus }) {
  if (status === "COMPLETE") return <CheckCircle2 className="h-3 w-3 text-emerald-500" />;
  if (status === "FAILED" || status === "PREVIEW_FAILED")
    return <XCircle className="h-3 w-3 text-red-500" />;
  if (status === "PREVIEW_READY") return <CheckCircle2 className="h-3 w-3 text-amber-500" />;
  if (
    status === "PREVIEWING" ||
    status === "UPRENDERING" ||
    status === "GENERATING_VIDEO"
  )
    return <Loader2 className="h-3 w-3 animate-spin text-[var(--accent)]" />;
  return <Clock className="h-3 w-3 text-[var(--text-muted)]" />;
}

function statusLabel(status: SceneStatus): string {
  const map: Record<SceneStatus, string> = {
    PENDING: "Queued",
    UPLOADING: "Uploading",
    PREVIEWING: "Generating frame...",
    PREVIEW_READY: "Ready to render",
    PREVIEW_FAILED: "Preview failed",
    UPRENDERING: "Uprendering...",
    GENERATING_VIDEO: "Rendering...",
    COMPLETE: "Complete",
    FAILED: "Failed",
  };
  return map[status] ?? status;
}

export function SceneTimeline({
  scenes,
  activeSceneId,
  onSelect,
  className,
}: SceneTimelineProps) {
  if (scenes.length === 0) {
    return (
      <div className={cn("flex items-center gap-3 py-4 text-sm text-[var(--text-muted)]", className)}>
        <Film className="h-4 w-4 shrink-0" />
        <span>Your scenes will appear here as a film strip.</span>
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      <p className="text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">
        Scenes · {scenes.length}
      </p>

      {/* Horizontal film strip */}
      <div className="flex gap-3 overflow-x-auto pb-2">
        {[...scenes].reverse().map((scene, idx) => {
          const isActive = scene.id === activeSceneId;
          const thumb = scene.uprenderUrl ?? scene.videoUrl;

          return (
            <button
              key={scene.id}
              type="button"
              onClick={() => onSelect(scene.id)}
              className={cn(
                "group relative shrink-0 w-[120px] rounded-xl border overflow-hidden transition-all shadow-sm",
                isActive
                  ? "border-[var(--accent)]/60 ring-2 ring-[var(--accent)]/30 scale-[1.03]"
                  : "border-[var(--line-strong)] hover:border-[var(--accent)]/30 hover:scale-[1.02]"
              )}
            >
              {/* Thumbnail */}
              <div className="aspect-video bg-[var(--line)] relative">
                {thumb ? (
                  <img
                    src={thumb}
                    alt={scene.title}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="h-full w-full flex items-center justify-center">
                    <Film className="h-5 w-5 text-[var(--text-muted)]" />
                  </div>
                )}

                {/* Scene number badge */}
                <div className="absolute top-1 left-1 rounded-md bg-black/50 px-1.5 py-0.5 text-[9px] font-bold text-white backdrop-blur-sm">
                  {String(scenes.length - idx).padStart(2, "0")}
                </div>
              </div>

              {/* Footer */}
              <div className="bg-white px-2 py-1.5 border-t border-[var(--line)]">
                <p className="truncate text-[10px] font-medium text-[var(--text-primary)] leading-tight">
                  {scene.title}
                </p>
                <div className="mt-0.5 flex items-center gap-1">
                  <StatusIcon status={scene.status} />
                  <span className="text-[9px] text-[var(--text-muted)] leading-tight truncate">
                    {statusLabel(scene.status)}
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
