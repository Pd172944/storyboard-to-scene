"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { Mic, X, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc/client";
import { uploadFileToFalStorage } from "@/lib/fal/storage";
import type { VoiceStatus } from "@/lib/studio/status";

interface VoiceSampleUploadProps {
  projectId: string;
  initialVoiceSampleUrl?: string | null;
  initialVoiceStatus?: VoiceStatus;
  className?: string;
}

export function VoiceSampleUpload({
  projectId,
  initialVoiceSampleUrl = null,
  initialVoiceStatus = "NONE",
  className,
}: VoiceSampleUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [sampleUrl, setSampleUrl] = useState<string | null>(initialVoiceSampleUrl);
  const [fileName, setFileName] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>(initialVoiceStatus);
  const [showReplaceWarning, setShowReplaceWarning] = useState(false);

  const setVoiceSampleMutation = trpc.project.setVoiceSample.useMutation();

  useEffect(() => {
    setSampleUrl(initialVoiceSampleUrl);
    setFileName(
      initialVoiceSampleUrl
        ? decodeURIComponent(initialVoiceSampleUrl.split("/").pop() ?? "Voice sample")
        : null
    );
  }, [initialVoiceSampleUrl]);

  useEffect(() => {
    setVoiceStatus(initialVoiceStatus);
  }, [initialVoiceStatus]);

  const handleFileSelect = useCallback(
    async (file: File) => {
      if (!file.type.startsWith("audio/")) return;

      setUploading(true);
      setShowReplaceWarning(false);

      try {
        const url = await uploadFileToFalStorage(file);
        setSampleUrl(url);
        setFileName(file.name);

        await setVoiceSampleMutation.mutateAsync({
          projectId,
          voiceSampleUrl: url,
        });

        // Voice ID will be created on next scene submission
        setVoiceStatus("PENDING");
      } catch (error) {
        console.error("Failed to upload voice sample:", error);
        setVoiceStatus("FAILED");
      } finally {
        setUploading(false);
      }
    },
    [projectId, setVoiceSampleMutation]
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFileSelect(file);
      if (inputRef.current) inputRef.current.value = "";
    },
    [handleFileSelect]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) handleFileSelect(file);
    },
    [handleFileSelect]
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  }, []);

  const handleRemove = useCallback(() => {
    setSampleUrl(null);
    setFileName(null);
    setVoiceStatus("NONE");
    setShowReplaceWarning(false);
  }, []);

  const handleUploadClick = useCallback(() => {
    if (sampleUrl) {
      setShowReplaceWarning(true);
    } else {
      inputRef.current?.click();
    }
  }, [sampleUrl]);

  const statusIndicator = () => {
    switch (voiceStatus) {
      case "NONE":
        return null;
      case "PENDING":
        return (
          <span className="flex items-center gap-1.5 text-xs text-amber-400">
            <AlertTriangle className="h-3 w-3" />
            Voice saved — ID will be created on first scene
          </span>
        );
      case "CREATING":
        return (
          <span className="flex items-center gap-1.5 text-xs text-indigo-400">
            <Loader2 className="h-3 w-3 animate-spin" />
            Creating voice ID...
          </span>
        );
      case "READY":
        return (
          <span className="flex items-center gap-1.5 text-xs text-emerald-400">
            <CheckCircle2 className="h-3 w-3" />
            Voice ready
          </span>
        );
      case "FAILED":
        return (
          <span className="flex items-center gap-1.5 text-xs text-red-400">
            <AlertTriangle className="h-3 w-3" />
            Failed to create voice — scenes will generate without voice
          </span>
        );
    }
  };

  return (
    <div className={cn("space-y-2", className)}>
      <Label>Character Voice (optional)</Label>

      <input
        ref={inputRef}
        type="file"
        accept=".wav,.mp3,.m4a,audio/*"
        onChange={handleInputChange}
        className="hidden"
        disabled={uploading}
      />

      {sampleUrl ? (
        /* Uploaded state — show filename, audio preview, and remove button */
        <div className="rounded-lg border border-gray-700 bg-gray-800 p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Mic className="h-4 w-4 flex-shrink-0 text-indigo-400" />
              <span className="text-xs text-gray-300 truncate">
                {fileName ?? "Voice sample"}
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRemove}
              disabled={uploading}
              className="h-6 w-6 flex-shrink-0 p-0 text-gray-500 hover:text-red-400"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
          {/* Audio playback preview */}
          <audio
            src={sampleUrl}
            controls
            className="w-full h-8"
            style={{ colorScheme: "dark" }}
          />
          {/* Re-upload option */}
          {showReplaceWarning ? (
            <div className="space-y-1.5">
              <p className="text-[11px] text-amber-400">
                Uploading a new sample will replace the existing voice and invalidate the Voice ID.
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 text-xs"
                  onClick={() => inputRef.current?.click()}
                >
                  Replace
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs text-gray-400"
                  onClick={() => setShowReplaceWarning(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <button
              onClick={handleUploadClick}
              className="text-[11px] text-gray-500 hover:text-gray-300 transition-colors"
              disabled={uploading}
            >
              Replace sample
            </button>
          )}
        </div>
      ) : (
        /* Empty state — drop zone */
        <div
          onClick={handleUploadClick}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          className={cn(
            "flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed py-5 cursor-pointer transition-colors",
            "border-gray-700 bg-gray-800/50 hover:border-gray-600 hover:bg-gray-800",
            uploading && "pointer-events-none opacity-50"
          )}
        >
          {uploading ? (
            <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
          ) : (
            <>
              <Mic className="h-5 w-5 text-gray-500" />
              <p className="text-xs text-gray-500 text-center px-4">
                Upload a 5-second voice sample for voice cloning
              </p>
              <p className="text-[10px] text-gray-600">WAV · MP3 · M4A</p>
            </>
          )}
        </div>
      )}

      {statusIndicator()}
    </div>
  );
}
