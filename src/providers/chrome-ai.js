export const id = "chrome-ai";
export const label = "Chrome built-in AI (Gemini Nano, on-device)";

export async function isAvailable() {
  if (typeof LanguageModel === "undefined") return false;
  const availability = await LanguageModel.availability();
  return availability !== "unavailable";
}

export async function generate(prompt, config = {}, images = null) {
  if (typeof LanguageModel === "undefined") {
    throw new Error(
      "Chrome's built-in AI (LanguageModel) isn't available in this browser/version."
    );
  }
  const createOptions = images?.length ? { expectedInputs: [{ type: "image" }], temperature: 0.3, topK: 3 } : { temperature: 0.3, topK: 3 };

  try {
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
      if (err?.name === "QuotaExceededError") {
        throw new Error("This question is too long for the on-device model's context limit.");
      }
      throw err;
    } finally {
      session.destroy();
    }
  } catch (err) {
    if (err?.name === "QuotaExceededError") {
      throw new Error("This question is too long for the on-device model's context limit.");
    }
    throw err;
  }
}