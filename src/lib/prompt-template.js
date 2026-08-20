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
    "(this is self-study, not a live exam). The attached images are screenshots " +
    "covering an entire page from top to bottom (several images only because the " +
    "page needed scrolling to capture fully — treat them as one continuous page, " +
    "not separate unrelated images) that may contain one or more practice " +
    "questions (e.g. a multi-question knowledge check). Find every question " +
    "visible across all of the images, without duplicating a question that " +
    "happens to appear in more than one image due to overlap at the edges.";

  // Strict, parseable format instead of "number each question clearly" prose
  // — a small local model's numbering/formatting is inconsistent enough that
  // regex-splitting on that alone was unreliable. One delimiter line is a
  // much lower bar for a model to actually follow consistently.
  const format =
    "Format your reply as one block per question, in this exact shape, with no extra text " +
    "before the first block or after the last: a one-line question label, then a newline, then " +
    (mode === MODES.ANSWER_ONLY
      ? "'Answer: <the answer>'"
      : "a brief explanation of the reasoning (why the correct choice is right and briefly why " +
        "the others are wrong), then on its own line 'Answer: <the answer>'") +
    ". Separate each question's block from the next with a line containing only ###. " +
    "If there are no questions across the images, just say so plainly with no ### blocks.";

  return `${preamble}\n\n${format}`;
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

// Splits a "Check this page" reply into one {question, explanation, answer}
// per question, using the ### delimiter buildPageCheckPrompt asks for.
// Returns null (not an empty array) if the model didn't follow the format
// (fewer than 2 blocks) — the caller falls back to showing the raw reply
// as one blob rather than presenting a single "question" with no label.
export function parsePageCheckReply(rawText) {
  const blocks = (rawText || "")
    .split(/\n*###\n*/)
    .map((b) => b.trim())
    .filter(Boolean);
  if (blocks.length < 2) return null;
  return blocks.map((block) => {
    const [label, ...rest] = block.split("\n");
    return { question: label.trim(), ...parseReply(rest.join("\n")) };
  });
}
