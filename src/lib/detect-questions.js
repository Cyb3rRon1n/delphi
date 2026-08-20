// Heuristic for auto-detect mode: does this block of text look like a
// multiple-choice practice question? Pure string logic (no DOM) so it's
// unit-testable; findQuestionBlocks() below does the DOM walk and is thin
// glue around this, loaded into content scripts via dynamic import().

export function looksLikeQuestion(text) {
  if (!text) return false;
  const t = text.trim();
  if (t.length < 15 || t.length > 1000) return false;
  if (!/\?/.test(t)) return false;
  const choiceLines = t.match(/(^|\n)\s*[A-Da-d][.):]\s+\S/g) || [];
  return choiceLines.length >= 2;
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
