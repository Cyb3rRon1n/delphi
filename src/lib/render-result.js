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
      reveal.textContent = "Thinking…";
      reveal.className = "thinking-btn";
      const answerBox = document.createElement("div");
      answerBox.className = "answer";
      const label = document.createElement("div");
      label.className = "answer-label";
      label.textContent = "Answer";
      const value = document.createElement("div");
      value.className = "answer-value";
      answerBox.append(label, value);
      reveal.addEventListener("click", () => {
        reveal.textContent = "…";
        reveal.disabled = true;
        const choice = extractChoice(result.answer);
        value.textContent = choice;
        reveal.textContent = choice;
        reveal.disabled = false;
        reveal.classList.add("revealed");
        setTimeout(() => {
          reveal.classList.remove("revealed");
          reveal.textContent = "Reveal answer";
          reveal.disabled = false;
        }, 300);
      });
      body.appendChild(reveal);
      body.appendChild(answerBox);
    }
  }
  return body;
}

function extractChoice(answerText) {
  const t = (answerText || "").trim();
  if (!t) return "";
  const lower = t.toLowerCase();
  if (lower === "true") return "True";
  if (lower === "false") return "False";
  const letterMatch = t.match(/^([A-Da-d])\)?\s/);
  if (letterMatch) return letterMatch[1].toUpperCase();
  const numberMatch = t.match(/^([1-4])\)?\s/);
  if (numberMatch) return numberMatch[1];
  const parts = t.split(/\s+/);
  if (parts.length > 0) return parts[0];
  return t;
}