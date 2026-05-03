export function buildScenePrompt(
  location: string,
  weather: string,
  action: string,
  additional: string
): string {
  const parts: string[] = [];
  const context = [location.trim(), weather.trim()].filter(Boolean).join(", ");
  if (context) parts.push(context + ".");
  if (action.trim()) parts.push(action.trim());
  if (additional.trim()) parts.push(additional.trim());
  return parts.join(" ").trim();
}
