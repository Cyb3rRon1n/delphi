// Injected on demand (context menu / keyboard shortcut) — never runs
// automatically on page load, and is idempotent against re-injection.
(() => {
  if (window.__delphiInjected) {
    chrome.runtime.onMessage.addListener(window.__delphiListener);
    return;
  }
  window.__delphiInjected = true;

  const host = document.createElement("div");
  host.id = "delphi-host";
  host.style.cssText = "all: initial; position: fixed; z-index: 2147483647; bottom: 16px; right: 16px;";
  document.documentElement.appendChild(host);
  const shadow = host.attachShadow({ mode: "open" });

  shadow.innerHTML = `
    <style>
      .panel { all: initial; font: 14px/1.4 system-ui, sans-serif; display: block;
        width: 320px; max-height: 60vh; overflow-y: auto; background: #1e1e2e; color: #cdd6f4;
        border-radius: 10px; box-shadow: 0 8px 24px rgba(0,0,0,0.4); padding: 14px; }
      .panel h3 { all: initial; display: block; font-weight: 600; font-size: 13px;
        color: #94e2d5; margin-bottom: 8px; }
      .panel p { all: initial; display: block; white-space: pre-wrap; margin: 0 0 8px; }
      .panel .answer { display: none; background: #313244; border-radius: 6px; padding: 8px; margin-top: 6px; }
      .panel .answer.revealed { display: block; }
      .panel button { all: initial; cursor: pointer; display: inline-block; background: #89b4fa;
        color: #1e1e2e; border-radius: 6px; padding: 6px 10px; font-size: 12px; font-weight: 600; }
      .panel .close { position: absolute; top: 10px; right: 12px; background: none; color: #cdd6f4; padding: 0; }
      .panel .err { color: #f38ba8; }
    </style>
    <div class="panel" style="position: relative;">
      <button class="close" title="Close">✕</button>
      <h3>Delphi</h3>
      <div class="body">Thinking…</div>
    </div>
  `;

  shadow.querySelector(".close").addEventListener("click", () => (host.style.display = "none"));

  window.__delphiListener = (msg) => {
    const body = shadow.querySelector(".body");
    host.style.display = "block";
    if (msg.type === "DELPHI_SHOW") {
      body.textContent = "Thinking…";
    } else if (msg.type === "DELPHI_RESULT") {
      body.innerHTML = "";
      if (msg.error) {
        const p = document.createElement("p");
        p.className = "err";
        p.textContent = msg.error;
        body.appendChild(p);
        return;
      }
      if (msg.explanation) {
        const p = document.createElement("p");
        p.textContent = msg.explanation;
        body.appendChild(p);
      }
      if (msg.answer) {
        if (msg.mode === "answer_only") {
          const p = document.createElement("p");
          p.textContent = `Answer: ${msg.answer}`;
          body.appendChild(p);
        } else {
          const reveal = document.createElement("button");
          reveal.textContent = "Reveal answer";
          const answerBox = document.createElement("div");
          answerBox.className = "answer";
          answerBox.textContent = `Answer: ${msg.answer}`;
          reveal.addEventListener("click", () => {
            answerBox.classList.add("revealed");
            reveal.remove();
          });
          body.appendChild(reveal);
          body.appendChild(answerBox);
        }
      }
    }
  };
  chrome.runtime.onMessage.addListener(window.__delphiListener);
})();
