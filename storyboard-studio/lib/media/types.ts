export type MediaBackend = "fal" | "runpod";

export interface VideoJobHandle {
  provider: MediaBackend;
  requestId?: string;
  videoUrl?: string;
}

export interface PreviewFrameInput {
  sketchUrl: string;
  motionPrompt: string;
  characterRefUrl?: string;
}

export interface FinalFrameInput extends PreviewFrameInput {}

export interface DraftVideoInput {
  imageUrl: string;
  motionPrompt: string;
}

export interface FinalVideoInput {
  imageUrl: string;
  motionPrompt: string;
  characterRefUrls?: string[];
  voiceId?: string;
}

export interface MediaProvider {
  backend: MediaBackend;
  generatePreviewFrame(input: PreviewFrameInput): Promise<string>;
  generateFinalFrame(input: FinalFrameInput): Promise<string>;
  submitDraftVideo(input: DraftVideoInput): Promise<VideoJobHandle>;
  waitForDraftVideo(job: VideoJobHandle): Promise<string>;
  submitFinalVideo(input: FinalVideoInput): Promise<VideoJobHandle>;
  waitForFinalVideo(job: VideoJobHandle): Promise<string>;
  synthesizeDialogue(dialogue: string, voiceSampleUrl?: string): Promise<string>;
  createVoice(audioUrl: string, voiceName: string): Promise<string>;
  cancelFinalVideo?(requestId: string): Promise<void>;
}
