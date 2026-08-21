// Builds the prompt sent to whichever LLM provider is active.
// Kept as pure functions (no DOM/network) so they're trivially testable.

export const MODES = Object.freeze({
  EXPLAIN: "explain", // reasoning first, answer on the last line
  ANSWER_ONLY: "answer_only", // just the answer — for a quick self-check pass
});

const INSTRUCTIONS = Object.freeze({
  [MODES.ANSWER_ONLY]: "Reply with only the letter/choice of the most likely correct answer. No explanation.",
  EXPLAIN: "Keep it short and scannable, one point per line, not one dense paragraph: one line on " +
    "why the correct choice is right, then one short line per incorrect choice explaining " +
    "briefly why it's wrong (this is often the part practice tests skip, and it's the part " +
    "that actually helps someone learn — but each point still gets its own line). Then, on " +
    "its own final line by itself, write 'Answer: <the answer>'.",
});

export function buildPrompt(questionText, mode = MODES.EXPLAIN) {
  if (!questionText || !questionText.trim()) {
    throw new Error("buildPrompt: questionText is empty");
  }

  const preamble =
    "You are a study assistant helping a learner practice for themselves " +
    "(this is self-study, not a live exam). The learner selected the " +
    "following practice question from a page:";

  return `${preamble}\n\n---\n${questionText.trim()}\n---\n\n${INSTRUCTIONS[mode]}`;
}

// Same idea, but for a captured image with no separately-extracted text —
// the model reads the question directly off the image (vision input).
export function buildImagePrompt(mode = MODES.EXPLAIN) {
  const preamble =
    "You are a study assistant helping a learner practice for themselves " +
    "(this is self-study, not a live exam). The attached image contains a " +
    "practice question — read the question and any answer choices directly from it. " +
    "Use the same format as a text question: one line on why the correct choice is right, " +
    "one short line per incorrect choice explaining briefly why it's wrong, then on its own " +
    "final line write 'Answer: <the answer>'.";

  return `${preamble}\n\n${INSTRUCTIONS[mode]}`;
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
      : "one short line on why the correct choice is right, one short line per incorrect choice " +
        "on why it's wrong (each point on its own line, not one dense paragraph), then on its " +
        "own line 'Answer: <the answer>'") +
    ". Separate each question's block from the next with a line containing only ###. " +
    "If there are no questions across the images, just say so plainly with no ### blocks.";

  return `${preamble}\n\n${format}`;
}

// Splits a provider's raw reply into { explanation, answer } for display.
// Falls back gracefully if the model didn't follow the "Answer:" convention
// at all. The prompt always asks for the literal "Answer:" — this also
// catches a few near-miss phrasings a model sometimes uses instead,
// especially across a longer multi-question reply where consistency slips.
// Anchored to the start of a line (not "anywhere in the text") so it can't
// false-match a word like "correct" showing up mid-explanation.
const ANSWER_LINE = /(?:^|\n)\s*(?:Answer|The answer is|Correct answer(?: is)?)\s*:?\s*(.+)\s*$/is;
export function parseReply(rawText) {
  const text = (rawText || "").trim();
  const match = text.match(ANSWER_LINE);
  if (!match) {
    return { explanation: text, answer: null };
  }
  const answer = match[1].trim();
  const explanation = text.slice(0, match.index).trim();
  return { explanation, answer };
}

// In answer_only mode the prompt asks for a bare choice ("B") — a compliant
// reply parses as { explanation: "B", answer: null }, which would render as
// plain text instead of the styled answer. Move it where the UI expects it.
export function finalizeReply(parsed, mode) {
  if (mode === MODES.ANSWER_ONLY && !parsed.answer && parsed.explanation) {
    return { explanation: null, answer: parsed.explanation };
  }
  return parsed;
}

// Splits a "Check this page" reply into one {question, explanation, answer}
// per question, using the ### delimiter buildPageCheckPrompt asks for.
// Returns null (not an empty array) if the model didn't follow the format —
// the caller falls back to showing the raw reply as one blob rather than
// losing content. A single block still counts when it carries an "Answer:"
// line (a one-question page is a success, not a format failure); prose
// without one ("no questions found") stays null so it's shown verbatim.
export function parsePageCheckReply(rawText) {
  const toEntry = (block) => {
    const [label, ...rest] = block.split("\n");
    return { question: label.trim(), ...parseReply(rest.join("\n")) };
  };
  const blocks = (rawText || "")
    .split(/\n*###\n*/)
    .map((b) => b.trim())
    .filter(Boolean);
  if (blocks.length === 1) {
    const entry = toEntry(blocks[0]);
    return entry.answer ? [entry] : null;
  }
  if (blocks.length < 1) return null;
  return blocks.map(toEntry);
}
