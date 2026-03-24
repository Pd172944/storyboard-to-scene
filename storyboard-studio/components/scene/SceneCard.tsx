"use client";

import { useState, useCallback, type FormEvent } from "react";
import { z } from "zod";
import { Loader2, Eye, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { DialogueInput } from "@/components/scene/DialogueInput";

const sceneFormSchema = z.object({
  title: z.string().min(1, "Scene title is required").max(200),
  motionPrompt: z.string().min(1, "Motion prompt is required").max(2000),
});

const PROMPT_BOARDS = [
  {
    label: "Shot Language",
    helper: "Anchor the framing and lens intent.",
    options: [
      "wide establishing frame with architectural depth",
      "tight close-up with shallow depth of field",
      "medium tracking shot at shoulder height",
      "low-angle hero frame with strong foreground separation",
    ],
  },
  {
    label: "Motion",
    helper: "Describe what the camera and subject actually do.",
    options: [
      "slow push-in while the subject locks eye contact",
      "gentle handheld drift with natural body motion",
      "controlled dolly left as the subject turns",
      "subtle pause, then a decisive step forward",
    ],
  },
  {
    label: "Atmosphere",
    helper: "Tell the model what kind of world it should feel like.",
    options: [
      "soft overcast daylight with realistic skin tones",
      "golden-hour warmth with cinematic contrast",
      "rain-soaked night reflections and practical street lights",
      "quiet interior ambience with natural window light",
    ],
  },
];

function appendPromptSegment(currentPrompt: string, segment: string): string {
  const trimmed = currentPrompt.trim();
  if (!trimmed) return segment;
  if (trimmed.toLowerCase().includes(segment.toLowerCase())) return trimmed;
  const suffix = /[.!?]$/.test(trimmed) ? " " : ". ";
  return `${trimmed}${suffix}${segment}`;
}

export interface SceneFormData {
  title: string;
  motionPrompt: string;
  dialogue: string;
}

interface SceneCardProps {
  onPreview: (data: SceneFormData) => Promise<void>;
  onRenderFinal?: () => void;
  canRenderFinal?: boolean;
  isSubmitting: boolean;
  isApproving?: boolean;
  className?: string;
}

export function SceneCard({
  onPreview,
  onRenderFinal,
  canRenderFinal = false,
  isSubmitting,
  isApproving = false,
  className,
}: SceneCardProps) {
  const [title, setTitle] = useState("");
  const [motionPrompt, setMotionPrompt] = useState("");
  const [dialogue, setDialogue] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      setErrors({});

      const result = sceneFormSchema.safeParse({ title, motionPrompt });
      if (!result.success) {
        const fieldErrors: Record<string, string> = {};
        for (const issue of result.error.issues) {
          const field = issue.path[0];
          if (typeof field === "string") {
            fieldErrors[field] = issue.message;
          }
        }
        setErrors(fieldErrors);
        return;
      }

      await onPreview({
        title: result.data.title,
        motionPrompt: result.data.motionPrompt,
        dialogue,
      });
    },
    [title, motionPrompt, dialogue, onPreview]
  );

  const handlePromptChip = useCallback((segment: string) => {
    setMotionPrompt((current) => appendPromptSegment(current, segment));
  }, []);

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Scene Blueprint</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="scene-title">Scene Title</Label>
            <Input
              id="scene-title"
              placeholder="Scene 1 — Rainy Alley"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={isSubmitting}
            />
            {errors.title && (
              <p className="text-xs text-red-400">{errors.title}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="motion-prompt">Motion Prompt</Label>
            <Textarea
              id="motion-prompt"
              placeholder="A woman steps into a rain-soaked alley, pauses under flickering neon, then turns toward camera as the lens slowly pushes in"
              value={motionPrompt}
              onChange={(e) => setMotionPrompt(e.target.value)}
              disabled={isSubmitting}
              rows={5}
            />
            {errors.motionPrompt && (
              <p className="text-xs text-red-400">{errors.motionPrompt}</p>
            )}
            <p className="text-[11px] text-gray-500">
              Strong prompts describe framing, physical action, and lighting. Keep it cinematic and concrete.
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            {PROMPT_BOARDS.map((board) => (
              <div
                key={board.label}
                className="rounded-2xl border border-white/10 bg-black/20 p-3"
              >
                <div className="mb-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-200/75">
                    {board.label}
                  </p>
                  <p className="mt-1 text-[11px] leading-5 text-gray-500">
                    {board.helper}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {board.options.map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => handlePromptChip(option)}
                      className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-gray-300 transition hover:border-amber-300/40 hover:bg-amber-300/10 hover:text-amber-50"
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <DialogueInput
            value={dialogue}
            onChange={setDialogue}
            disabled={isSubmitting}
          />

          <div className="flex gap-2">
            <Button
              type="submit"
              size="lg"
              disabled={isSubmitting}
              className="flex-1"
              variant="outline"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Previewing…
                </>
              ) : (
                <>
                  <Eye className="mr-2 h-4 w-4" />
                  Preview
                  <span className="ml-1.5 text-[10px] opacity-60">~35s</span>
                </>
              )}
            </Button>

            <Button
              type="button"
              size="lg"
              disabled={!canRenderFinal || isApproving || isSubmitting}
              onClick={onRenderFinal}
              className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-40"
            >
              {isApproving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending…
                </>
              ) : (
                <>
                  <Zap className="mr-2 h-4 w-4" />
                  Render Final
                  <span className="ml-1.5 text-[10px] opacity-60">~90s</span>
                </>
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
