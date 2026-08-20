// Builds the prompt sent to whichever LLM provider is active.
// Kept as pure functions (no DOM/network) so they're trivially testable.

export const MODES = Object.freeze({
  EXPLAIN: "explain", // reasoning first, answer on the last line
  ANSWER_ONLY: "answer_only", // just the answer — for a quick self-check pass
});

function instructionFor(mode) {
  return mode === MODES.ANSWER_ONLY
    ? "Reply with only the letter/choice of the most likely correct answer. No explanation."
    : "First give a brief explanation of the reasoning: why the correct choice is right, " +
      "and briefly why the other choices are wrong (this is often the part practice tests " +
      "skip, and it's the part that actually helps someone learn). Then on its own final " +
      "line write 'Answer: <the answer>'.";
}

export function buildPrompt(questionText, mode = MODES.EXPLAIN) {
  if (!questionText || !questionText.trim()) {
    throw new Error("buildPrompt: questionText is empty");
  }

  const preamble =
    "You are a study assistant helping a learner practice for themselves " +
    "(this is self-study, not a live exam). The learner selected the " +
    "following practice question from a page:";

  return `${preamble}\n\n---\n${questionText.trim()}\n---\n\n${instructionFor(mode)}`;
}

// Same idea, but for a captured image with no separately-extracted text —
// the model reads the question directly off the image (vision input).
export function buildImagePrompt(mode = MODES.EXPLAIN) {
  const preamble =
    "You are a study assistant helping a learner practice for themselves " +
    "(this is self-study, not a live exam). The attached image contains a " +
    "practice question — read the question and any answer choices directly from it.";

  return `${preamble}\n\n${instructionFor(mode)}`;
}

// Whole-tab screenshot that may contain several questions at once (e.g. a
// multi-question knowledge check) — asks for a numbered list rather than
// one answer, so the reply is rendered as-is (no parseReply split; there's
// no single trailing "Answer:" line to find).
export function buildPageCheckPrompt(mode = MODES.EXPLAIN) {
  const preamble =
    "You are a study assistant helping a learner practice for themselves " +
    "(this is self-study, not a live exam). The attached image is a screenshot " +
    "of a page that may contain one or more practice questions (e.g. a multi-" +
    "question knowledge check). Find every question visible in the image.";

  const instruction =
    mode === MODES.ANSWER_ONLY
      ? "For each question, on its own line write a short label for the question and its " +
        "answer, e.g. '1. <short label> — Answer: <answer>'. No explanations. If there are " +
        "no questions in the image, say so plainly."
      : "For each question, briefly explain the reasoning — why the correct choice is right " +
        "and briefly why the other choices are wrong — then end that question's entry with " +
        "'Answer: <the answer>' on its own line. Number each question clearly. If there are " +
        "no questions in the image, say so plainly.";

  return `${preamble}\n\n${instruction}`;
}

// Splits a provider's raw reply into { explanation, answer } for display.
// Falls back gracefully if the model didn't follow the "Answer:" convention.
export function parseReply(rawText) {
  const text = (rawText || "").trim();
  const match = text.match(/Answer:\s*(.+)\s*$/is);
  if (!match) {
    return { explanation: text, answer: null };
  }
  const answer = match[1].trim();
  const explanation = text.slice(0, match.index).trim();
  return { explanation, answer };
}
