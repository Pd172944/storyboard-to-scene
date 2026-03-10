import { fal } from "@/lib/fal/client";

interface ChatterboxInput {
  text: string;
  exaggeration: number;
  cfg_weight: number;
  audio_prompt_url?: string;
}

interface ChatterboxOutput {
  audio: {
    url: string;
    content_type: string;
  };
}

/**
 * Synthesize dialogue audio using Chatterbox HD.
 *
 * Returns a fal CDN URL pointing to the generated audio file.
 * When voiceSampleUrl is provided, Chatterbox uses zero-shot voice cloning
 * from the sample — the output audio will resemble the provided voice.
 * Without a sample, Chatterbox uses its default expressive voice.
 *
 * Uses fal.run() (synchronous) because Chatterbox is fast enough
 * that async queue overhead would waste time.
 *
 * @param dialogue - The text to synthesize into speech
 * @param voiceSampleUrl - Optional fal CDN URL of a 5-second voice sample
 * @returns URL of the generated audio file
 */
export async function synthesizeDialogue(
  dialogue: string,
  voiceSampleUrl?: string
): Promise<string> {
  if (!dialogue.trim()) {
    throw new Error("Dialogue cannot be empty");
  }

  const input: ChatterboxInput = {
    text: dialogue,
    exaggeration: 0.5,   // 0.0–1.0 expressiveness
    cfg_weight: 0.5,     // classifier-free guidance weight
    ...(voiceSampleUrl && { audio_prompt_url: voiceSampleUrl }),
  };

  const result = await fal.run("resemble-ai/chatterboxhd/text-to-speech", {
    input,
  });

  // fal.run() returns output directly (not wrapped in .data)
  const data = result as unknown as ChatterboxOutput;

  if (!data?.audio?.url) {
    throw new Error("Chatterbox HD completed but no audio URL in response");
  }

  return data.audio.url;
}
