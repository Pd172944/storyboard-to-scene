"use client";

import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface DialogueInputProps {
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
  disabled?: boolean;
  className?: string;
}

export function DialogueInput({
  value,
  onChange,
  maxLength = 500,
  disabled = false,
  className,
}: DialogueInputProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor="dialogue-input">Character Dialogue (optional)</Label>
      <div className="relative">
        <Textarea
          id="dialogue-input"
          placeholder={`The character says: "I can't believe we're finally here..."`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={maxLength}
          disabled={disabled}
          rows={3}
          className="resize-none bg-gray-800 border-gray-700 text-gray-100 placeholder:text-gray-500 pr-16"
          style={{ minHeight: "4.5rem", maxHeight: "9rem" }}
        />
        {/* Character counter */}
        <span
          className={cn(
            "absolute bottom-2 right-3 text-[10px] tabular-nums select-none",
            value.length > maxLength * 0.9 ? "text-amber-400" : "text-gray-600"
          )}
        >
          {value.length}/{maxLength}
        </span>
      </div>
      <p className="text-[11px] text-gray-500">
        Leave empty to generate video without spoken dialogue
      </p>
    </div>
  );
}
