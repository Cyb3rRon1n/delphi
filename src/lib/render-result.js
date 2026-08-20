// Shared DOM-building for a Delphi result — used by content.js's bottom
// panel + inline auto-detect cards (dynamic import, classic script) and the
// side panel (static import, real module page). Pure DOM, no extension API.

// result: {explanation?, answer?, mode?, error?, question?} — same shape
// whether it came from a DELPHI_RESULT broadcast, a direct
// DELPHI_EXPLAIN_TEXT reply, or a stored history entry.
export function buildResultBody(result) {
  const body = document.createElement("div");
  if (result.error) {
    const p = document.createElement("p");
    p.className = "err";
    p.textContent = result.error;
    body.appendChild(p);
    return body;
  }
  if (result.explanation) {
    const p = document.createElement("p");
    p.textContent = result.explanation;
    body.appendChild(p);
  }
  if (result.answer) {
    if (result.mode === "answer_only") {
      const p = document.createElement("p");
      p.textContent = `Answer: ${result.answer}`;
      body.appendChild(p);
    } else {
      const reveal = document.createElement("button");
      reveal.textContent = "Reveal answer";
      const answerBox = document.createElement("div");
      answerBox.className = "answer";
      answerBox.textContent = `Answer: ${result.answer}`;
      reveal.addEventListener("click", () => {
        answerBox.classList.add("revealed");
        reveal.remove();
      });
      body.appendChild(reveal);
      body.appendChild(answerBox);
    }
  }
  return body;
}
