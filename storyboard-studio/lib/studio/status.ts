export type SceneStatus =
  | "PENDING"
  | "UPLOADING"
  | "PREVIEWING"
  | "PREVIEW_READY"
  | "PREVIEW_FAILED"
  | "UPRENDERING"
  | "GENERATING_VIDEO"
  | "COMPLETE"
  | "FAILED";

export type CharacterReelStatus =
  | "NONE"
  | "PENDING"
  | "GENERATING"
  | "COMPLETE"
  | "FAILED";

export type VoiceStatus =
  | "NONE"
  | "PENDING"
  | "CREATING"
  | "READY"
  | "FAILED";

export type SceneStage = "draft" | "final" | "idle";

export function getSceneStage(status?: SceneStatus): SceneStage {
  if (!status) return "idle";
  if (status === "PREVIEWING" || status === "PREVIEW_READY" || status === "PREVIEW_FAILED") {
    return "draft";
  }
  if (status === "UPRENDERING" || status === "GENERATING_VIDEO" || status === "COMPLETE" || status === "FAILED") {
    return "final";
  }
  return "idle";
}

export function canRenderFinal(status?: SceneStatus): boolean {
  return status === "PREVIEW_READY" || status === "PREVIEW_FAILED";
}
