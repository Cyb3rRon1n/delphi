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

// images, when present, is an array of "data:image/...;base64,..." strings —
// e.g. several viewport screenshots covering a full scrollable page.
export async function generate(prompt, config = {}, images = null) {
  if (typeof LanguageModel === "undefined") {
    throw new Error(
      "Chrome's built-in AI (LanguageModel) isn't available in this browser/version."
    );
  }
  const session = await LanguageModel.create(
    images?.length ? { expectedInputs: [{ type: "image" }] } : undefined
  );
  try {
    if (!images?.length) return await session.prompt(prompt);

    const blobs = await Promise.all(images.map(async (url) => (await fetch(url)).blob()));
    const content = [
      { type: "text", value: prompt },
      ...blobs.map((blob) => ({ type: "image", value: blob })),
    ];
    return await session.prompt([{ role: "user", content }]);
  } catch (err) {
    // Each call gets its own fresh session (destroyed below), so there's no
    // cross-call/whole-batch quota to run out of — the only real cap is a
    // single question's prompt exceeding *this* session's own context
    // window, which surfaces as QuotaExceededError. Give that a plain
    // message instead of letting the raw DOMException bubble up.
    if (err?.name === "QuotaExceededError") {
      throw new Error("This question is too long for the on-device model's context limit.");
    }
    throw err;
  } finally {
    session.destroy();
  }
}
