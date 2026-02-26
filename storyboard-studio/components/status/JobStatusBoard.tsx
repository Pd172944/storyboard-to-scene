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
} from "lucide-react";
import { cn } from "@/lib/utils";

type SceneStatus =
  | "PENDING"
  | "UPLOADING"
  | "UPRENDERING"
  | "GENERATING_VIDEO"
  | "COMPLETE"
  | "FAILED";

interface PipelineStep {
  key: string;
  label: string;
  icon: React.ReactNode;
  state: "pending" | "active" | "complete" | "failed";
}

interface JobStatusBoardProps {
  status: SceneStatus;
  className?: string;
}

const STEP_DEFINITIONS = [
  { key: "uploading", label: "Uploading assets", icon: Upload },
  { key: "uprendering", label: "Uprendering sketch", icon: Sparkles },
  { key: "generating_video", label: "Generating video", icon: Film },
  { key: "complete", label: "Complete", icon: PartyPopper },
] as const;

function getStepStates(status: SceneStatus): PipelineStep[] {
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

    let state: PipelineStep["state"] = "pending";

    if (isFailed) {
      if (i < currentIndex) {
        state = "complete";
      } else if (
        i === currentIndex ||
        (currentIndex === -1 && i === 0)
      ) {
        state = "failed";
      } else {
        state = "pending";
      }
    } else if (currentIndex === -1) {
      // PENDING status — nothing started yet
      state = "pending";
    } else if (i < currentIndex) {
      state = "complete";
    } else if (i === currentIndex) {
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

export function JobStatusBoard({ status, className }: JobStatusBoardProps) {
  const steps = useMemo(() => getStepStates(status), [status]);

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
              </div>

              {/* Step icon */}
              <div className="flex-shrink-0">{step.icon}</div>

              {/* Label */}
              <span
                className={cn("text-sm font-medium", {
                  "text-gray-500": step.state === "pending",
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
