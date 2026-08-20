// Minimal assert-based self-check. No framework, no fixtures.
// Run with: node tests/test_prompt_template.js
import assert from "node:assert/strict";
import { buildPrompt, buildImagePrompt, parseReply, MODES } from "../src/lib/prompt-template.js";
import { looksLikeQuestion } from "../src/lib/detect-questions.js";

// buildPrompt
assert.throws(() => buildPrompt(""), /empty/);
assert.throws(() => buildPrompt("   "), /empty/);

const explainPrompt = buildPrompt("2+2=? A) 3 B) 4 C) 5", MODES.EXPLAIN);
assert.match(explainPrompt, /2\+2=\? A\) 3 B\) 4 C\) 5/);
assert.match(explainPrompt, /final line write/);

const answerOnlyPrompt = buildPrompt("2+2=?", MODES.ANSWER_ONLY);
assert.match(answerOnlyPrompt, /No explanation/);

// parseReply
const withAnswer = parseReply(
  "4 is the sum of 2 and 2, a basic addition fact.\nAnswer: B) 4"
);
assert.equal(withAnswer.answer, "B) 4");
assert.match(withAnswer.explanation, /basic addition fact/);

const withoutAnswer = parseReply("Just some rambling text, no marker.");
assert.equal(withoutAnswer.answer, null);
assert.equal(withoutAnswer.explanation, "Just some rambling text, no marker.");

// buildImagePrompt
const imgPrompt = buildImagePrompt(MODES.EXPLAIN);
assert.match(imgPrompt, /attached image/);
assert.match(imgPrompt, /final line write/);
const imgAnswerOnly = buildImagePrompt(MODES.ANSWER_ONLY);
assert.match(imgAnswerOnly, /No explanation/);

// looksLikeQuestion
assert.equal(
  looksLikeQuestion("What is 2+2?\nA) 3\nB) 4\nC) 5"),
  true
);
assert.equal(looksLikeQuestion("A) 3 B) 4 C) 5"), false); // no '?'
assert.equal(looksLikeQuestion("What is your favorite color?"), false); // no choices
assert.equal(looksLikeQuestion("Just some ordinary paragraph text with no question."), false);
assert.equal(looksLikeQuestion(""), false);
assert.equal(looksLikeQuestion("?".repeat(2000)), false); // too long

console.log("test_prompt_template: all assertions passed");
