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

export async function generate(prompt) {
  if (typeof LanguageModel === "undefined") {
    throw new Error(
      "Chrome's built-in AI (LanguageModel) isn't available in this browser/version."
    );
  }
  const session = await LanguageModel.create();
  try {
    return await session.prompt(prompt);
  } finally {
    session.destroy();
  }
}
