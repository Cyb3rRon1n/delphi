// Minimal assert-based self-check. No framework, no fixtures.
// Run with: node tests/test_prompt_template.js
import assert from "node:assert/strict";
import {
  buildPrompt,
  buildImagePrompt,
  buildPageCheckPrompt,
  parsePageCheckReply,
  parseReply,
  finalizeReply,
  MODES,
} from "../src/lib/prompt-template.js";
import { looksLikeQuestion } from "../src/lib/detect-questions.js";

// buildPrompt
assert.throws(() => buildPrompt(""), /empty/);
assert.throws(() => buildPrompt("   "), /empty/);

const explainPrompt = buildPrompt("2+2=? A) 3 B) 4 C) 5", MODES.EXPLAIN);
assert.match(explainPrompt, /2\+2=\? A\) 3 B\) 4 C\) 5/);
assert.match(explainPrompt, /own final line/);
assert.match(explainPrompt, /one point per line/);

const answerOnlyPrompt = buildPrompt("2+2=?", MODES.ANSWER_ONLY);
assert.match(answerOnlyPrompt, /No explanation/);

// parseReply
const withAnswer = parseReply(
  "4 is the sum of 2 and 2, a basic addition fact.\nAnswer: B) 4"
);
assert.equal(withAnswer.answer, "B) 4");
assert.match(withAnswer.explanation, /basic addition fact/);

// near-miss phrasings a model sometimes uses instead of the literal "Answer:"
assert.equal(parseReply("Some reasoning here.\nThe answer is C) 5").answer, "C) 5");
assert.equal(parseReply("Some reasoning here.\nCorrect answer: D) 6").answer, "D) 6");
assert.equal(parseReply("Some reasoning here.\nCorrect answer is E) 7").answer, "E) 7");
// "correct" appearing mid-explanation must not false-match as the answer line
assert.equal(
  parseReply("B is correct because it sums to 4. A is not correct.").answer,
  null
);

const withoutAnswer = parseReply("Just some rambling text, no marker.");
assert.equal(withoutAnswer.answer, null);
assert.equal(withoutAnswer.explanation, "Just some rambling text, no marker.");

// buildImagePrompt
const imgPrompt = buildImagePrompt(MODES.EXPLAIN);
assert.match(imgPrompt, /attached image/);
assert.match(imgPrompt, /own final line/);
const imgAnswerOnly = buildImagePrompt(MODES.ANSWER_ONLY);
assert.match(imgAnswerOnly, /No explanation/);

// buildPageCheckPrompt
const pageCheckPrompt = buildPageCheckPrompt(MODES.EXPLAIN);
assert.match(pageCheckPrompt, /every question visible/);
assert.match(pageCheckPrompt, /containing only ###/);
const pageCheckAnswerOnly = buildPageCheckPrompt(MODES.ANSWER_ONLY);
assert.match(pageCheckAnswerOnly, /'Answer: <the answer>'/);

// parsePageCheckReply
const multi = parsePageCheckReply(
  "Q1: capital of France\nParis is the capital because...\nAnswer: Paris\n###\n" +
    "Q2: 2+2\nBasic addition.\nAnswer: 4"
);
assert.equal(multi.length, 2);
assert.equal(multi[0].question, "Q1: capital of France");
assert.equal(multi[0].answer, "Paris");
assert.match(multi[0].explanation, /Paris is the capital/);
assert.equal(multi[1].answer, "4");

assert.equal(parsePageCheckReply("No delimiter here at all, just plain prose."), null);
assert.equal(parsePageCheckReply(""), null);

// A single ###-less block still parses when it carries an Answer: line
// (one-question page = success, not a format failure)…
const single = parsePageCheckReply(
  "Q1: capital of France\nParis is the capital because...\nAnswer: Paris"
);
assert.equal(single.length, 1);
assert.equal(single[0].question, "Q1: capital of France");
assert.equal(single[0].answer, "Paris");
// …but prose without one ("no questions found") stays a format failure.
assert.equal(parsePageCheckReply("There are no questions on this page."), null);

// answer_only mode: a bare compliant reply ("B") is the answer, not explanation
assert.deepEqual(finalizeReply({ explanation: "B", answer: null }, MODES.ANSWER_ONLY), {
  explanation: null,
  answer: "B",
});
// empty reply stays untouched; already-parsed answers pass through; explain mode unaffected
assert.deepEqual(finalizeReply({ explanation: "", answer: null }, MODES.ANSWER_ONLY), {
  explanation: "",
  answer: null,
});
assert.deepEqual(finalizeReply({ explanation: "why...", answer: "B" }, MODES.ANSWER_ONLY), {
  explanation: "why...",
  answer: "B",
});
assert.deepEqual(finalizeReply({ explanation: "why...", answer: null }, MODES.EXPLAIN), {
  explanation: "why...",
  answer: null,
});

// looksLikeQuestion
assert.equal(
  looksLikeQuestion("What is 2+2?\nA) 3\nB) 4\nC) 5"),
  true
);
assert.equal(
  looksLikeQuestion("What is 7 x 8? A) 54 B) 56 C) 58 D) 64"),
  true
); // inline choices on one line, not one-per-line — regression case
assert.equal(
  looksLikeQuestion("What is 7 x 8?\n1. 54\n2. 56\n3. 58"),
  true
); // numbered choices, not just lettered
assert.equal(
  looksLikeQuestion("The sky is blue on a clear day. True or False?"),
  true
); // true/false, no lettered/numbered choices at all
assert.equal(looksLikeQuestion("A) 3 B) 4 C) 5"), false); // no '?'
assert.equal(looksLikeQuestion("What is your favorite color?"), false); // no choices
assert.equal(looksLikeQuestion("Just some ordinary paragraph text with no question."), false);
assert.equal(looksLikeQuestion(""), false);
assert.equal(looksLikeQuestion("?".repeat(2000)), false); // too long

console.log("test_prompt_template: all assertions passed");
