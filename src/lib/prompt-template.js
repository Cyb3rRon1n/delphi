// Builds the prompt sent to whichever LLM provider is active.
// Kept as pure functions (no DOM/network) so they're trivially testable.

export const MODES = Object.freeze({
  EXPLAIN: "explain", // reasoning first, answer on the last line
  ANSWER_ONLY: "answer_only", // just the answer — for a quick self-check pass
});

const INSTRUCTIONS = Object.freeze({
  [MODES.ANSWER_ONLY]: "Reply with only the letter/choice of the most likely correct answer. No explanation.",
  [MODES.EXPLAIN]: "Keep it short and scannable, one point per line, not one dense paragraph: one line on " +
    "why the correct choice is right, then one short line per incorrect choice explaining " +
    "briefly why it's wrong (this is often the part practice tests skip, and it's the part " +
    "that actually helps someone learn — but each point still gets its own line). Then, on " +
    "its own final line by itself, write 'Answer: <the answer>'.",
});

// Shared by every prompt builder below (text, image, page-check): asks the
// model to restate the question and name its answer format before it
// answers, rather than answering straight off — catches a misread (a messy
// DOM chunk, a tight image crop) before it becomes a wrong answer, the same
// reason a person reads all the options before picking one. The two labeled
// lines this produces are what parseIdentifiedReply()/parsePageCheckReply()
// pull off the front of a reply so the UI can show them as their own fields.
//
// Two things this specifically guards against, found live on a real reply:
// (1) the model transcribing the question+choices as plain text first (very
// tempting when reading straight off a screenshot) and *then* also writing
// the labeled lines, so everything shows up twice in the panel — the
// "don't repeat" clause exists only because that happened; (2) the choices
// coming back as one run-on sentence with no separators between options,
// unreadable once rendered — the "|"-separated shape gives the renderer
// something to split on for a real per-choice list instead of a wall of text.
const IDENTIFY_LINES =
  "start with exactly these two labeled lines, each on its own line, and do not repeat the " +
  "question text or the choices anywhere else in your reply: 'Question: <the question text>' " +
  "then 'Choices: <each option separated by \" | \", e.g. \"A) foo | B) bar | C) baz\" — or " +
  "True/False, or, for fill-in-the-blank, a note that it's fill-in-the-blank and what fills it>'. " +
  "Use those to determine the best answer, then continue";

export function buildPrompt(questionText, mode = MODES.EXPLAIN) {
  if (!questionText || !questionText.trim()) {
    throw new Error("buildPrompt: questionText is empty");
  }

  const preamble =
    "You are a study assistant helping a learner practice for themselves " +
    "(this is self-study, not a live exam). The learner selected the " +
    "following practice question from a page:";

  return `${preamble}\n\n---\n${questionText.trim()}\n---\n\nFirst, ${IDENTIFY_LINES} below.\n\n${INSTRUCTIONS[mode]}`;
}

// Same idea, but for a captured image with no separately-extracted text —
// the model reads the question directly off the image (vision input).
export function buildImagePrompt(mode = MODES.EXPLAIN) {
  const preamble =
    "You are a study assistant helping a learner practice for themselves " +
    "(this is self-study, not a live exam). The attached image contains a " +
    `practice question. Read directly off the image and ${IDENTIFY_LINES} ` +
    "below in the same format as a text question: one line on why the " +
    "correct choice is right, one short line per incorrect choice " +
    "explaining briefly why it's wrong, then on its own final line write " +
    "'Answer: <the answer>'.";

  return `${preamble}\n\n${INSTRUCTIONS[mode]}`;
}

// Pulls the "Question:"/"Choices:" identification lines the prompts above
// ask for off the front of the reply, leaving the rest for parseReply. Used
// for both text (selection/auto-detect) and image (region-capture) replies —
// same lead-in shape either way. Anchored to the very start (^) — these are
// only meaningful as the lead-in the prompt asked for, not text that happens
// to say "Question:" mid-reply. Falls back gracefully (null fields, whole
// text still parsed for explanation/answer) if the model didn't follow the
// format, same as every other format-compliance fallback in this file.
const QUESTION_LINE = /^\s*Question\s*:\s*(.+?)\s*\n+/i;
const CHOICES_LINE = /^\s*Choices\s*:\s*(.+?)\s*\n+/i;
export function parseIdentifiedReply(rawText) {
  let text = (rawText || "").trim();
  let question = null;
  let choices = null;

  const qMatch = text.match(QUESTION_LINE);
  if (qMatch) {
    question = qMatch[1].trim();
    text = text.slice(qMatch[0].length);
  }
  const cMatch = text.match(CHOICES_LINE);
  if (cMatch) {
    choices = cMatch[1].trim();
    text = text.slice(cMatch[0].length);
  }

  return { question, choices, ...parseReply(text) };
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
    "happens to appear in more than one image due to overlap at the edges. " +
    "There may be many questions — work through them one at a time and keep " +
    "going block by block until every question you can see has been covered; " +
    "do not stop after just the first one.";

  // Strict, parseable format instead of "number each question clearly" prose
  // — a small local model's numbering/formatting is inconsistent enough that
  // regex-splitting on that alone was unreliable. One delimiter line is a
  // much lower bar for a model to actually follow consistently.
  const format =
    "Format your reply as one block per question, in this exact shape, with no extra text " +
    "before the first block or after the last, and without repeating the question or its " +
    "choices anywhere outside these two lines: a one-line question label, then a newline, then " +
    "'Choices: <each option separated by \" | \", e.g. \"A) foo | B) bar | C) baz\" — or " +
    "True/False, or, for fill-in-the-blank, a note that it's fill-in-the-blank and what fills " +
    "it>', then a newline, then " +
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
    return { ...parsed, explanation: null, answer: parsed.explanation };
  }
  return parsed;
}

// Splits a "Check this page" reply into one {question, choices, explanation,
// answer} per question, using the ### delimiter buildPageCheckPrompt asks
// for. Returns null (not an empty array) if the model didn't follow the
// format — the caller falls back to showing the raw reply as one blob rather
// than losing content. A single block still counts when it carries an
// "Answer:" line (a one-question page is a success, not a format failure);
// prose without one ("no questions found") stays null so it's shown verbatim.
export function parsePageCheckReply(rawText) {
  const toEntry = (block) => {
    const [label, ...rest] = block.split("\n");
    let body = rest.join("\n");
    let choices = null;
    const cMatch = body.match(CHOICES_LINE);
    if (cMatch) {
      choices = cMatch[1].trim();
      body = body.slice(cMatch[0].length);
    }
    return { question: label.trim(), choices, ...parseReply(body) };
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
