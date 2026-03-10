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

export interface SceneFormData {
  title: string;
  motionPrompt: string;
  dialogue: string;
}

interface SceneCardProps {
  onPreview: (data: SceneFormData) => Promise<void>;   // Phase 4: creates draft via LTX
  onRenderFinal?: () => void;                          // Phase 4: approves draft for Kling
  canRenderFinal?: boolean;                            // enabled once PREVIEW_READY
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

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Scene Details</CardTitle>
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
              placeholder="A detective walks slowly through a rain-soaked alley, looking left and right"
              value={motionPrompt}
              onChange={(e) => setMotionPrompt(e.target.value)}
              disabled={isSubmitting}
              rows={3}
            />
            {errors.motionPrompt && (
              <p className="text-xs text-red-400">{errors.motionPrompt}</p>
            )}
          </div>

          <DialogueInput
            value={dialogue}
            onChange={setDialogue}
            disabled={isSubmitting}
          />

          {/* Two-stage buttons */}
          <div className="flex gap-2">
            {/* Preview — fast LTX draft */}
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
                  <span className="ml-1.5 text-[10px] opacity-60">~5s</span>
                </>
              )}
            </Button>

            {/* Render Final — full Kling quality */}
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
