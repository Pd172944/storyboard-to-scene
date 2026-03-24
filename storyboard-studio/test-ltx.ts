import { submitLtxJob } from "./lib/fal/ltx";
import { fal } from "./lib/fal/client";

async function main() {
  try {
    console.log("Submitting...");
    const req = await submitLtxJob("https://picsum.photos/1024/1024", "A cat");
    console.log("Request ID:", req);
  } catch (e) {
    console.error("Error:", e);
  }
}
main();
