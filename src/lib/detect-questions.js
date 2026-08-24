// Heuristic for auto-detect mode: does this block of text look like a
// multiple-choice practice question? Pure string logic (no DOM) so it's
// unit-testable; findQuestionBlocks() below does the DOM walk and is thin
// glue around this, loaded into content scripts via dynamic import().

export function looksLikeQuestion(text) {
  if (!text) return false;
  const t = text.trim();
  if (t.length < 15 || t.length > 1000) return false;
  if (!/\?/.test(t)) return false;
  // A choice marker at the start of the text, or preceded by any whitespace —
  // covers both one-per-line lists and inline "A) x B) y" on a single line,
  // and numbered choices ("1. x 2. y") alongside lettered ones.
  const CHOICE_RE = /(^|\s)(?:[A-Da-d]|[1-9])[.):]\s+\S/g;
  const choiceLines = t.match(CHOICE_RE) || [];
  if (choiceLines.length >= 2) {
    // If there are 3+ choice lines and the question mark doesn't precede most
    // of them, it's likely an answer key, not a practice question.
    if (choiceLines.length >= 3) {
      // Answer keys list choices with no question before them — the '?' (if
      // any) sits after the choices. Compare against how many choice matches
      // follow the '?', not just the first match: a leading question number
      // ("1. What is...?") itself matches CHOICE_RE and sits before the '?',
      // which made every normal numbered question look like an answer key
      // when only the first match's position was checked.
      const qIdx = t.indexOf('?');
      const afterQ = [...t.matchAll(CHOICE_RE)].filter((m) => m.index >= qIdx).length;
      if (qIdx === -1 || afterQ < 2) return false;
    }
    return true;
  }
  // True/false questions have no lettered/numbered choices at all — just
  // both words present is a reasonable-enough signal alongside the '?'.
  if (/true/i.test(t) && /false/i.test(t)) return true;
  return /\btrue\b/i.test(t) || /\bfalse\b/i.test(t);
}

const CANDIDATE_SELECTOR = "p, div, li, td, fieldset, section";

// DOM-aware companion to looksLikeQuestion, for a real gap pure text
// matching can't cover: choices with no letter/number prefix at all.
// Confirmed live on testprepreview.com's ASVAB sample questions — choices
// rendered as plain <li> text ("1:5:5:2", or bare words like "belittled"),
// nothing for CHOICE_RE to match, so looksLikeQuestion never fires no
// matter how the regex is tuned. A '?' immediately followed by a short list
// is a strong structural signal of multiple-choice independent of any
// lettering convention — capped at 8 items so a big unrelated list (nav,
// FAQ) elsewhere in a large candidate doesn't false-match; the existing
// smallest-element/ancestor-skip logic below still prefers the actual
// question+list over that larger container whenever one exists.
function hasListedChoices(el) {
  const text = el.innerText ?? el.textContent ?? "";
  const t = text.trim();
  if (t.length < 15 || t.length > 1000 || !/\?/.test(t)) return false;
  const list = el.querySelector("ul, ol");
  if (!list) return false;
  const items = list.querySelectorAll(":scope > li");
  return items.length >= 2 && items.length <= 8;
}

// Returns the smallest elements under root whose text looks like a question
// — an ancestor of a matching element is skipped so a whole page/section
// container doesn't get flagged alongside the real question inside it.
export function findQuestionBlocks(root) {
  const candidates = Array.from(root.querySelectorAll(CANDIDATE_SELECTOR));
  const matches = (el) => looksLikeQuestion(el.innerText ?? el.textContent ?? "") || hasListedChoices(el);
  return candidates.filter((el) => {
    if (!matches(el)) return false;
    return !Array.from(el.querySelectorAll(CANDIDATE_SELECTOR)).some(matches);
  });
}
