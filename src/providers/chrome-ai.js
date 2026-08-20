// Chrome's built-in Gemini Nano (Prompt API). Free, on-device, no key,
// no network call once the model is downloaded. Default provider.
// https://developer.chrome.com/docs/ai/prompt-api

export const id = "chrome-ai";
export const label = "Chrome built-in AI (Gemini Nano, on-device)";

export async function isAvailable() {
  if (typeof LanguageModel === "undefined") return false;
  const availability = await LanguageModel.availability();
  return availability !== "unavailable";
}

// imageDataUrl, when present, is a "data:image/...;base64,..." string.
export async function generate(prompt, config = {}, imageDataUrl = null) {
  if (typeof LanguageModel === "undefined") {
    throw new Error(
      "Chrome's built-in AI (LanguageModel) isn't available in this browser/version."
    );
  }
  const session = await LanguageModel.create(
    imageDataUrl ? { expectedInputs: [{ type: "image" }] } : undefined
  );
  try {
    if (!imageDataUrl) return await session.prompt(prompt);

    const blob = await (await fetch(imageDataUrl)).blob();
    return await session.prompt([
      { role: "user", content: [{ type: "text", value: prompt }, { type: "image", value: blob }] },
    ]);
  } finally {
    session.destroy();
  }
}
