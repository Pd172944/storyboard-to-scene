"use client";

import { useMemo } from "react";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  Circle,
  Upload,
  Sparkles,
  Film,
  PartyPopper,
  User,
  MinusCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

type SceneStatus =
  | "PENDING"
  | "UPLOADING"
  | "UPRENDERING"
  | "GENERATING_VIDEO"
  | "COMPLETE"
  | "FAILED";

type CharacterReelStatus = "NONE" | "PENDING" | "GENERATING" | "COMPLETE" | "FAILED";

interface PipelineStep {
  key: string;
  label: string;
  icon: React.ReactNode;
  state: "pending" | "active" | "complete" | "failed" | "skipped";
}

interface JobStatusBoardProps {
  status: SceneStatus;
  reelStatus?: CharacterReelStatus;
  className?: string;
}

const STEP_DEFINITIONS = [
  { key: "uploading", label: "Uploading assets", icon: Upload },
  { key: "uprendering", label: "Uprendering sketch", icon: Sparkles },
  { key: "character_reel", label: "Generating character reel", icon: User },
  { key: "generating_video", label: "Generating video", icon: Film },
  { key: "complete", label: "Complete", icon: PartyPopper },
] as const;

function getStepStates(
  status: SceneStatus,
  reelStatus?: CharacterReelStatus
): PipelineStep[] {
  const statusOrder: SceneStatus[] = [
    "UPLOADING",
    "UPRENDERING",
    "GENERATING_VIDEO",
    "COMPLETE",
  ];

  const currentIndex = statusOrder.indexOf(status);
  const isFailed = status === "FAILED";

  return STEP_DEFINITIONS.map((def, i) => {
    const Icon = def.icon;

    // Handle the character reel step specially
    if (def.key === "character_reel") {
      // No reference images uploaded — skip this step entirely
      if (!reelStatus || reelStatus === "NONE") {
        return {
          key: def.key,
          label: def.label,
          icon: <MinusCircle className="h-4 w-4" />,
          state: "skipped" as const,
        };
      }

      // Reel was cached / already complete — show as complete immediately
      if (reelStatus === "COMPLETE") {
        return {
          key: def.key,
          label: def.label,
          icon: <Icon className="h-4 w-4" />,
          state: "complete" as const,
        };
      }

      // Reel is generating
      if (reelStatus === "GENERATING") {
        // If scene status has already passed uprendering, show active
        const isUprendered = currentIndex >= 1; // past UPRENDERING
        return {
          key: def.key,
          label: def.label,
          icon: <Icon className="h-4 w-4" />,
          state: isUprendered ? "active" as const : "pending" as const,
        };
      }

      // Reel pending or failed
      if (reelStatus === "FAILED") {
        return {
          key: def.key,
          label: def.label,
          icon: <Icon className="h-4 w-4" />,
          state: "failed" as const,
        };
      }

      // PENDING — not yet started
      return {
        key: def.key,
        label: def.label,
        icon: <Icon className="h-4 w-4" />,
        state: "pending" as const,
      };
    }

    // For non-reel steps, map indices accounting for the reel step insertion
    // Steps: 0=uploading, 1=uprendering, 2=character_reel, 3=generating_video, 4=complete
    // Status order indices: 0=UPLOADING, 1=UPRENDERING, 2=GENERATING_VIDEO, 3=COMPLETE
    const statusIndex =
      i < 2 ? i : // uploading (0), uprendering (1) → direct map
      i === 3 ? 2 : // generating_video → statusOrder[2]
      i === 4 ? 3 : // complete → statusOrder[3]
      -1;

    let state: PipelineStep["state"] = "pending";

    if (isFailed) {
      if (statusIndex < currentIndex) {
        state = "complete";
      } else if (
        statusIndex === currentIndex ||
        (currentIndex === -1 && statusIndex === 0)
      ) {
        state = "failed";
      } else {
        state = "pending";
      }
    } else if (currentIndex === -1) {
      // PENDING status — nothing started yet
      state = "pending";
    } else if (statusIndex < currentIndex) {
      state = "complete";
    } else if (statusIndex === currentIndex) {
      state = status === "COMPLETE" ? "complete" : "active";
    } else {
      state = "pending";
    }

    return {
      key: def.key,
      label: def.label,
      icon: <Icon className="h-4 w-4" />,
      state,
    };
  });
}

export function JobStatusBoard({ status, reelStatus, className }: JobStatusBoardProps) {
  const steps = useMemo(() => getStepStates(status, reelStatus), [status, reelStatus]);

  return (
    <div className={cn("space-y-3", className)}>
      <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-400">
        Pipeline Status
      </h3>

      <div className="space-y-2">
        {steps.map((step, index) => (
          <div key={step.key}>
            <div
              className={cn(
                "flex items-center gap-3 rounded-xl px-4 py-3 transition-all duration-300",
                {
                  "bg-gray-800/50 text-gray-500": step.state === "pending",
                  "bg-gray-800/30 text-gray-600 opacity-60": step.state === "skipped",
                  "bg-indigo-500/15 text-indigo-300 ring-1 ring-indigo-500/30":
                    step.state === "active",
                  "bg-emerald-500/10 text-emerald-400":
                    step.state === "complete",
                  "bg-red-500/10 text-red-400": step.state === "failed",
                }
              )}
            >
              {/* Status indicator */}
              <div className="flex-shrink-0">
                {step.state === "active" && (
                  <Loader2 className="h-5 w-5 animate-spin text-indigo-400" />
                )}
                {step.state === "complete" && (
                  <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                )}
                {step.state === "failed" && (
                  <XCircle className="h-5 w-5 text-red-400" />
                )}
                {step.state === "pending" && (
                  <Circle className="h-5 w-5 text-gray-600" />
                )}
                {step.state === "skipped" && (
                  <MinusCircle className="h-5 w-5 text-gray-600" />
                )}
              </div>

              {/* Step icon */}
              <div className="flex-shrink-0">{step.icon}</div>

              {/* Label */}
              <span
                className={cn("text-sm font-medium", {
                  "text-gray-500": step.state === "pending",
                  "text-gray-600 line-through": step.state === "skipped",
                  "text-indigo-200": step.state === "active",
                  "text-emerald-300": step.state === "complete",
                  "text-red-300": step.state === "failed",
                })}
              >
                {step.label}
              </span>

              {/* Pulse dot for active step */}
              {step.state === "active" && (
                <span className="ml-auto flex h-2 w-2">
                  <span className="absolute inline-flex h-2 w-2 animate-ping rounded-full bg-indigo-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-indigo-500" />
                </span>
              )}
            </div>

            {/* Connector line */}
            {index < steps.length - 1 && (
              <div className="ml-6 flex h-4 items-center">
                <div
                  className={cn("h-full w-px", {
                    "bg-gray-700": step.state === "pending",
                    "bg-emerald-500/40": step.state === "complete",
                    "bg-indigo-500/40": step.state === "active",
                    "bg-red-500/40": step.state === "failed",
                  })}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
