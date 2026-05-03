import OpenAI from "openai";

export interface ParsedScene {
  order: number;
  title: string;
  location: string;
  weather: string;
  action: string;
  additional: string;
  dialogue: string | null;
  speakingCharacter: string | null;
  characters: string[];
}

export interface ParsedScript {
  title: string | null;
  characters: string[];
  scenes: ParsedScene[];
}

const SYSTEM_PROMPT = `You are a professional screenplay analyst. Parse the provided script and extract every distinct scene.

For each scene extract:
- title: A short, vivid title (e.g. "Rooftop Confrontation", "Coffee Shop Reunion") — invent one if the script doesn't name it
- location: Physical setting only, rich and specific (e.g. "rain-soaked alley, brick walls plastered with torn posters", "sterile hospital corridor, harsh fluorescent lighting")
- weather: Lighting and atmosphere (e.g. "golden hour, warm backlight", "overcast, diffuse grey light", "night, neon glow") — if not specified, infer from tone
- action: What physically happens — movements, expressions, blocking (2-3 crisp sentences, present tense, cinematic)
- additional: Camera intent, mood, pacing, or anything that doesn't fit above (empty string if nothing)
- dialogue: The single most important line of dialogue in the scene, verbatim — null if none
- speakingCharacter: Who delivers that line — null if no dialogue
- characters: All character names present in this scene (ALL-CAPS as written in script)

Also extract the complete list of unique named characters across the whole script.

Respond ONLY with valid JSON — no markdown fences, no extra text:
{
  "title": "script title or null",
  "characters": ["CHARACTER1", "CHARACTER2"],
  "scenes": [
    {
      "order": 0,
      "title": "Scene title",
      "location": "rich location description",
      "weather": "lighting and atmosphere",
      "action": "what physically happens",
      "additional": "camera/mood notes or empty string",
      "dialogue": "key line or null",
      "speakingCharacter": "CHARACTER or null",
      "characters": ["CHARACTER1"]
    }
  ]
}`;

export async function parseScript(scriptText: string): Promise<ParsedScript> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");

  const openai = new OpenAI({ apiKey });

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: scriptText.slice(0, 30000) }, // cap at ~30k chars
    ],
    response_format: { type: "json_object" },
    temperature: 0.2,
  });

  const raw = response.choices[0]?.message?.content;
  if (!raw) throw new Error("OpenAI returned an empty response");

  const parsed = JSON.parse(raw) as ParsedScript;

  if (!Array.isArray(parsed.scenes) || parsed.scenes.length === 0) {
    throw new Error("No scenes could be extracted from the script");
  }

  // Ensure order field is correct regardless of what GPT returns
  parsed.scenes = parsed.scenes.map((s, i) => ({ ...s, order: i }));
  parsed.characters = parsed.characters ?? [];

  return parsed;
}
