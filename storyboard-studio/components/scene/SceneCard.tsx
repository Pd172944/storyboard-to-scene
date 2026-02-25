"use client";

import { useState, useCallback, type FormEvent } from "react";
import { z } from "zod";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { CharacterRefUpload } from "@/components/scene/CharacterRefUpload";

const sceneFormSchema = z.object({
  title: z.string().min(1, "Scene title is required").max(200),
  motionPrompt: z.string().min(1, "Motion prompt is required").max(2000),
});

export interface SceneFormData {
  title: string;
  motionPrompt: string;
  referenceFile: File;
}

interface SceneCardProps {
  onSubmit: (data: SceneFormData) => Promise<void>;
  isSubmitting: boolean;
  className?: string;
}

export function SceneCard({ onSubmit, isSubmitting, className }: SceneCardProps) {
  const [title, setTitle] = useState("");
  const [motionPrompt, setMotionPrompt] = useState("");
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [referencePreview, setReferencePreview] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleRefUpload = useCallback((file: File) => {
    setReferenceFile(file);
    const url = URL.createObjectURL(file);
    setReferencePreview(url);
    setErrors((prev) => {
      const next = { ...prev };
      delete next.referenceFile;
      return next;
    });
  }, []);

  const handleRefRemove = useCallback(() => {
    setReferenceFile(null);
    if (referencePreview) {
      URL.revokeObjectURL(referencePreview);
    }
    setReferencePreview(null);
  }, [referencePreview]);

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      setErrors({});

      // Validate text fields
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

      // Validate reference image
      if (!referenceFile) {
        setErrors({ referenceFile: "Character reference image is required" });
        return;
      }

      await onSubmit({
        title: result.data.title,
        motionPrompt: result.data.motionPrompt,
        referenceFile,
      });
    },
    [title, motionPrompt, referenceFile, onSubmit]
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

          <CharacterRefUpload
            onUpload={handleRefUpload}
            onRemove={handleRefRemove}
            previewUrl={referencePreview}
            disabled={isSubmitting}
          />
          {errors.referenceFile && (
            <p className="text-xs text-red-400">{errors.referenceFile}</p>
          )}

          <Button
            type="submit"
            size="lg"
            disabled={isSubmitting}
            className="w-full"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating…
              </>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" />
                Generate Scene
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
