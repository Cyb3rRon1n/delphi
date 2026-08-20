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
    // One <p> per line instead of one dense block — the prompt now
    // explicitly asks for one point per line, so there's real structure
    // here to split on. Falls back to a single paragraph if the model
    // ignored that and just wrote one dense line anyway.
    for (const line of result.explanation.split(/\n+/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const p = document.createElement("p");
      p.textContent = trimmed;
      body.appendChild(p);
    }
  }
  if (result.answer) {
    if (result.mode === "answer_only") {
      const p = document.createElement("p");
      p.className = "answer-only-line";
      const label = document.createElement("span");
      label.className = "answer-label";
      label.textContent = "Answer";
      p.append(label, document.createTextNode(result.answer));
      body.appendChild(p);
    } else {
      const reveal = document.createElement("button");
      reveal.textContent = "Reveal answer";
      const answerBox = document.createElement("div");
      answerBox.className = "answer";
      const label = document.createElement("div");
      label.className = "answer-label";
      label.textContent = "Answer";
      const value = document.createElement("div");
      value.className = "answer-value";
      value.textContent = result.answer;
      answerBox.append(label, value);
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
