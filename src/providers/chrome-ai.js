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
  const createOptions = images?.length ? { expectedInputs: [{ type: "image" }], temperature: 0.3 } : { temperature: 0.3 };
  // Lower-than-default temperature: this is a structured-format task (one
  // point per line, a literal "Answer:" line), not creative writing — less
  // sampling randomness means more consistent adherence to that format
  // from one run to the next. Chrome requires topK and temperature to be
  // set together, so read the model's own valid range via params() rather
  // than guessing a topK that might be out of bounds for it.
  try {
    const params = await LanguageModel.params();
    if (params) {
      createOptions.temperature = Math.min(0.3, params.maxTemperature ?? 0.3);
      createOptions.topK = params.defaultTopK ?? params.maxTopK ?? 3;
    }
  } catch {
    // params() unsupported on this Chrome version — just use its defaults.
  }
  const session = await LanguageModel.create(createOptions);
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
