// Injected on demand (context menu / keyboard shortcut / popup toggle) —
// never runs automatically on page load, and is idempotent against
// re-injection (chrome.scripting.executeScript re-runs this whole file).
(() => {
  if (window.__delphiInjected) {
    chrome.runtime.onMessage.addListener(window.__delphiListener);
    return;
  }
  window.__delphiInjected = true;

  // --- result panel (bottom-right) ----------------------------------------

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

  function renderResult(msg) {
    const body = shadow.querySelector(".body");
    host.style.display = "block";
    if (msg.type === "DELPHI_SHOW") {
      body.textContent = "Thinking…";
      return;
    }
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

  // --- auto-detect overlay (badge + per-question buttons) ------------------

  const autoHost = document.createElement("div");
  autoHost.id = "delphi-auto-host";
  autoHost.style.cssText = "all: initial; position: fixed; inset: 0; z-index: 2147483646; pointer-events: none; display: none;";
  document.documentElement.appendChild(autoHost);
  const autoShadow = autoHost.attachShadow({ mode: "open" });
  autoShadow.innerHTML = `
    <style>
      .badge { all: initial; pointer-events: auto; position: fixed; bottom: 16px; left: 16px;
        font: 12px system-ui, sans-serif; background: #1e1e2e; color: #94e2d5; border-radius: 8px;
        padding: 6px 10px; box-shadow: 0 4px 12px rgba(0,0,0,0.35); }
      .badge button { all: initial; cursor: pointer; margin-left: 8px; color: #f38ba8; font-size: 11px; }
      .auto-btn { all: initial; pointer-events: auto; position: fixed; cursor: pointer;
        font: 11px system-ui, sans-serif; font-weight: 600; background: #89b4fa; color: #1e1e2e;
        border-radius: 5px; padding: 3px 7px; box-shadow: 0 2px 6px rgba(0,0,0,0.3); z-index: 1; }
    </style>
    <div class="badge">Delphi watching (0) <button class="stop">stop</button></div>
  `;
  const badge = autoShadow.querySelector(".badge");
  autoShadow.querySelector(".stop").addEventListener("click", () => {
    stopAuto();
    chrome.runtime.sendMessage({ type: "DELPHI_AUTO_STOPPED_LOCALLY" });
  });

  let detectFns = null;
  let autoObserver = null;
  const autoBlocks = new Map(); // element -> button

  function debounce(fn, ms) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  }

  function addButtonFor(el) {
    const btn = document.createElement("button");
    btn.className = "auto-btn";
    btn.textContent = "Explain";
    btn.addEventListener("click", () => {
      const text = el.innerText ?? el.textContent ?? "";
      chrome.runtime.sendMessage({ type: "DELPHI_EXPLAIN_TEXT", text });
    });
    autoShadow.appendChild(btn);
    autoBlocks.set(el, btn);
  }

  function repositionButtons() {
    for (const [el, btn] of autoBlocks) {
      const r = el.getBoundingClientRect();
      const visible = r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight;
      btn.style.display = visible ? "block" : "none";
      if (visible) {
        btn.style.top = `${Math.max(0, r.top)}px`;
        btn.style.left = `${Math.max(0, r.right - 60)}px`;
      }
    }
  }

  function scan() {
    const blocks = detectFns.findQuestionBlocks(document.body);
    const seen = new Set(blocks);
    for (const el of blocks) {
      if (!autoBlocks.has(el)) addButtonFor(el);
    }
    for (const [el, btn] of autoBlocks) {
      if (!seen.has(el) || !document.contains(el)) {
        btn.remove();
        autoBlocks.delete(el);
      }
    }
    badge.firstChild.textContent = `Delphi watching (${autoBlocks.size}) `;
    repositionButtons();
  }

  const debouncedScan = debounce(scan, 800);

  async function startAuto() {
    autoHost.style.display = "block";
    if (!detectFns) {
      detectFns = await import(chrome.runtime.getURL("src/lib/detect-questions.js"));
    }
    scan();
    if (!autoObserver) {
      autoObserver = new MutationObserver(debouncedScan);
      autoObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
      window.addEventListener("scroll", repositionButtons, true);
      window.addEventListener("resize", repositionButtons);
    }
  }

  function stopAuto() {
    if (autoObserver) {
      autoObserver.disconnect();
      autoObserver = null;
    }
    window.removeEventListener("scroll", repositionButtons, true);
    window.removeEventListener("resize", repositionButtons);
    for (const btn of autoBlocks.values()) btn.remove();
    autoBlocks.clear();
    autoHost.style.display = "none";
  }

  // --- drag-to-select region capture ---------------------------------------

  function startCapture() {
    const overlay = document.createElement("div");
    overlay.style.cssText =
      "position:fixed; inset:0; z-index:2147483647; cursor:crosshair; background:rgba(0,0,0,0.15);";
    const box = document.createElement("div");
    box.style.cssText =
      "position:fixed; border:2px solid #89b4fa; background:rgba(137,180,250,0.2); display:none;";
    overlay.appendChild(box);
    document.documentElement.appendChild(overlay);

    let startX = 0;
    let startY = 0;
    let dragging = false;

    function onDown(e) {
      dragging = true;
      startX = e.clientX;
      startY = e.clientY;
      Object.assign(box.style, { left: `${startX}px`, top: `${startY}px`, width: "0px", height: "0px", display: "block" });
    }
    function onMove(e) {
      if (!dragging) return;
      const x = Math.min(e.clientX, startX);
      const y = Math.min(e.clientY, startY);
      Object.assign(box.style, {
        left: `${x}px`,
        top: `${y}px`,
        width: `${Math.abs(e.clientX - startX)}px`,
        height: `${Math.abs(e.clientY - startY)}px`,
      });
    }
    function onUp() {
      dragging = false;
      const rect = {
        x: parseFloat(box.style.left),
        y: parseFloat(box.style.top),
        width: parseFloat(box.style.width),
        height: parseFloat(box.style.height),
      };
      cleanup();
      if (rect.width < 5 || rect.height < 5) return; // too small — treat as a cancel
      chrome.runtime.sendMessage({ type: "DELPHI_REGION_SELECTED", rect, dpr: window.devicePixelRatio || 1 });
    }
    function onKey(e) {
      if (e.key === "Escape") cleanup();
    }
    function cleanup() {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("keydown", onKey);
      overlay.remove();
    }

    overlay.addEventListener("mousedown", onDown);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("keydown", onKey);
  }

  // --- message dispatch ------------------------------------------------------

  window.__delphiListener = (msg) => {
    if (msg.type === "DELPHI_SHOW" || msg.type === "DELPHI_RESULT") {
      renderResult(msg);
    } else if (msg.type === "DELPHI_CAPTURE_START") {
      startCapture();
    } else if (msg.type === "DELPHI_AUTO_ON") {
      startAuto();
    } else if (msg.type === "DELPHI_AUTO_OFF") {
      stopAuto();
    }
  };
  chrome.runtime.onMessage.addListener(window.__delphiListener);
})();
