export function buildResultBody(result) {
  const body = document.createElement("div");
  if (result.error) {
    const p = document.createElement("p");
    p.className = "err";
    p.textContent = result.error;
    body.appendChild(p);
    return body;
  }
  // Question isn't shown here as its own field — the history entry / panel
  // title already carries it (see background.js's report()); repeating it
  // in the body would just duplicate what's already the visible label.
  if (result.choices) {
    body.appendChild(field("Choices", formatChoices(result.choices)));
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

// The prompt asks for "|"-separated choices (see IDENTIFY_LINES) so they can
// be rendered as one option per line instead of a run-on sentence; falls
// back to the raw string unchanged for True/False, fill-in-the-blank, or an
// older/non-compliant reply with no "|" in it.
function formatChoices(raw) {
  const items = raw.split("|").map((s) => s.trim()).filter(Boolean);
  return items.length > 1 ? items.map((i) => `• ${i}`).join("\n") : raw;
}

function field(label, value) {
  const wrap = document.createElement("div");
  wrap.className = "field";
  const l = document.createElement("div");
  l.className = "field-label";
  l.textContent = label;
  const v = document.createElement("div");
  v.className = "field-value";
  v.textContent = value;
  wrap.append(l, v);
  return wrap;
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