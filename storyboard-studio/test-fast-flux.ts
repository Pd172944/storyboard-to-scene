import { fal } from "./lib/fal/client";

async function main() {
  console.log("Submitting to flux/dev/image-to-image...");
  const start = Date.now();
  try {
    const res = await fal.subscribe("fal-ai/flux/dev/image-to-image", {
      input: {
        image_url: "https://v3b.fal.media/files/b/0a91f7c6/QgRpIqqXIXPz6Da5i-ljP_sketch-1773383101795.png",
        prompt: "A boy enjoys an Asian dinner and smiles as he eats the noodles, photorealistic",
        strength: 0.85,
      }
    });
    console.log("Result:", res.data);
    console.log("Time:", Date.now() - start, "ms");
  } catch(e) { console.error(e) }
}
main();
