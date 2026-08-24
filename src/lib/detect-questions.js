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

// Returns the smallest elements under root whose text looks like a question
// — an ancestor of a matching element is skipped so a whole page/section
// container doesn't get flagged alongside the real question inside it.
export function findQuestionBlocks(root) {
  const candidates = Array.from(root.querySelectorAll(CANDIDATE_SELECTOR));
  return candidates.filter((el) => {
    const text = el.innerText ?? el.textContent ?? "";
    if (!looksLikeQuestion(text)) return false;
    return !Array.from(el.querySelectorAll(CANDIDATE_SELECTOR)).some((child) =>
      looksLikeQuestion(child.innerText ?? child.textContent ?? "")
    );
  });
}
