// Injected on demand (context menu / keyboard shortcut / popup toggle) —
// never runs automatically on page load, and is idempotent against
// re-injection (api.scripting.executeScript re-runs this whole file).
(async () => {
  // browser.* (Firefox, promise-only) when present, else chrome.* (Chrome/Brave).
  const api = globalThis.browser ?? chrome;

  if (window.__delphiInjected) {
    api.runtime.onMessage.addListener(window.__delphiListener);
    return;
  }
  window.__delphiInjected = true;

  // Shared with the side panel — see src/lib/render-result.js.
  const { buildResultBody } = await import(api.runtime.getURL("src/lib/render-result.js"));

  // --- result panel (bottom-right, for selection + region capture) ---------

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
      .panel p { all: initial; display: block; white-space: pre-wrap; margin: 0 0 8px; color: #cdd6f4; }
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
    body.appendChild(buildResultBody(msg));
  }

  // --- auto-detect overlay (badge + per-question buttons/cards) ------------

  const autoHost = document.createElement("div");
  autoHost.id = "delphi-auto-host";
  autoHost.style.cssText = "all: initial; position: fixed; inset: 0; z-index: 2147483646; pointer-events: none; display: none;";
  document.documentElement.appendChild(autoHost);
  const autoShadow = autoHost.attachShadow({ mode: "open" });
  autoShadow.innerHTML = `
    <style>
      .badge { all: initial; pointer-events: auto; position: fixed; bottom: 16px; left: 16px;
        display: flex; align-items: center; gap: 8px; font: 12px system-ui, sans-serif;
        background: #1e1e2e; color: #94e2d5; border-radius: 8px; padding: 6px 10px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.35); }
      .badge button { all: initial; cursor: pointer; font-size: 11px; }
      .badge .explain-all { color: #89b4fa; font-weight: 600; }
      .badge .stop { color: #f38ba8; }
      .auto-btn { all: initial; pointer-events: auto; position: fixed; cursor: pointer;
        font: 11px system-ui, sans-serif; font-weight: 600; background: #89b4fa; color: #1e1e2e;
        border-radius: 5px; padding: 3px 7px; box-shadow: 0 2px 6px rgba(0,0,0,0.3); z-index: 1; }
      .auto-btn:disabled { opacity: 0.6; cursor: default; }
      .auto-card { all: initial; pointer-events: auto; position: fixed; width: 280px;
        font: 13px/1.4 system-ui, sans-serif; background: #1e1e2e; color: #cdd6f4;
        border-radius: 8px; box-shadow: 0 4px 14px rgba(0,0,0,0.35); padding: 10px; z-index: 1; }
      .auto-card p { all: initial; display: block; white-space: pre-wrap; margin: 0 0 6px; color: #cdd6f4; }
      .auto-card .answer { display: none; background: #313244; border-radius: 6px; padding: 6px; margin-top: 4px; }
      .auto-card .answer.revealed { display: block; }
      .auto-card button { all: initial; cursor: pointer; display: inline-block; background: #89b4fa;
        color: #1e1e2e; border-radius: 5px; padding: 4px 8px; font-size: 11px; font-weight: 600; }
      .auto-card .err { color: #f38ba8; }
      .auto-card .card-close { all: initial; cursor: pointer; float: right; background: none;
        color: #cdd6f4; font-size: 11px; padding: 0 0 4px 6px; }
    </style>
    <div class="badge">
      <span class="count">Delphi watching (0)</span>
      <button class="explain-all">explain all</button>
      <button class="stop">stop</button>
    </div>
  `;
  const countLabel = autoShadow.querySelector(".count");
  const explainAllBtn = autoShadow.querySelector(".explain-all");
  autoShadow.querySelector(".stop").addEventListener("click", () => {
    stopAuto();
    api.runtime.sendMessage({ type: "DELPHI_AUTO_STOPPED_LOCALLY" });
  });

  let detectFns = null;
  let autoObserver = null;
  const blocks = new Map(); // element -> { btn: HTMLElement|null, card: HTMLElement|null }
  let batchRunning = false;
  let batchCancelled = false;

  function debounce(fn, ms) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  }

  function updateBadge() {
    if (batchRunning) return; // progress text owns the label while a batch runs
    countLabel.textContent = `Delphi watching (${blocks.size})`;
  }

  function createExplainButton(el) {
    const btn = document.createElement("button");
    btn.className = "auto-btn";
    btn.textContent = "Explain";
    btn.addEventListener("click", () => explainBlock(el, btn));
    autoShadow.appendChild(btn);
    return btn;
  }

  async function explainBlock(el, btn) {
    btn.disabled = true;
    btn.textContent = "…";
    const text = el.innerText ?? el.textContent ?? "";
    let result;
    try {
      result = await api.runtime.sendMessage({ type: "DELPHI_EXPLAIN_TEXT", text });
    } catch (err) {
      result = { error: String(err?.message ?? err) };
    }
    showCard(el, result);
  }

  function showCard(el, result) {
    const state = blocks.get(el);
    if (!state) return; // block disappeared (e.g. DOM changed) while awaiting
    state.btn?.remove();
    state.btn = null;

    const card = document.createElement("div");
    card.className = "auto-card";
    const close = document.createElement("button");
    close.className = "card-close";
    close.textContent = "✕";
    close.addEventListener("click", () => {
      state.card?.remove();
      state.card = null;
      state.btn = createExplainButton(el);
      repositionAll();
    });
    card.appendChild(close);
    card.appendChild(buildResultBody(result));
    autoShadow.appendChild(card);
    state.card = card;
    repositionAll();
  }

  function repositionAll() {
    for (const [el, state] of blocks) {
      const r = el.getBoundingClientRect();
      const visible = r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight;
      if (state.btn) {
        state.btn.style.display = visible ? "block" : "none";
        if (visible) {
          state.btn.style.top = `${Math.max(0, r.top)}px`;
          state.btn.style.left = `${Math.max(0, r.right - 60)}px`;
        }
      }
      if (state.card) {
        state.card.style.display = visible ? "block" : "none";
        if (visible) {
          state.card.style.top = `${r.bottom + 4}px`;
          state.card.style.left = `${Math.max(0, r.left)}px`;
        }
      }
    }
  }

  function scan() {
    const found = detectFns.findQuestionBlocks(document.body);
    const seen = new Set(found);
    for (const el of found) {
      if (!blocks.has(el)) blocks.set(el, { btn: createExplainButton(el), card: null });
    }
    for (const [el, state] of blocks) {
      if (!seen.has(el) || !document.contains(el)) {
        state.btn?.remove();
        state.card?.remove();
        blocks.delete(el);
      }
    }
    updateBadge();
    repositionAll();
  }

  const debouncedScan = debounce(scan, 800);

  async function startAuto() {
    autoHost.style.display = "block";
    if (!detectFns) {
      detectFns = await import(api.runtime.getURL("src/lib/detect-questions.js"));
    }
    scan();
    if (!autoObserver) {
      autoObserver = new MutationObserver(debouncedScan);
      autoObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
      window.addEventListener("scroll", repositionAll, true);
      window.addEventListener("resize", repositionAll);
    }
  }

  function stopAuto() {
    batchCancelled = true;
    if (autoObserver) {
      autoObserver.disconnect();
      autoObserver = null;
    }
    window.removeEventListener("scroll", repositionAll, true);
    window.removeEventListener("resize", repositionAll);
    for (const state of blocks.values()) {
      state.btn?.remove();
      state.card?.remove();
    }
    blocks.clear();
    autoHost.style.display = "none";
  }

  // Sequential, not parallel — a local model (on-device or CPU Ollama) is a
  // single shared resource; running many at once wouldn't be faster, just
  // contended. One click starts it, one click cancels it, still consistent
  // with "every LLM call is the direct result of a click."
  explainAllBtn.addEventListener("click", () => {
    if (batchRunning) {
      batchCancelled = true;
      return;
    }
    startBatch();
  });

  async function startBatch() {
    const pending = Array.from(blocks.entries()).filter(([, state]) => state.btn);
    if (pending.length === 0) return;
    batchRunning = true;
    batchCancelled = false;
    explainAllBtn.textContent = "cancel";

    let failed = 0;
    for (let i = 0; i < pending.length; i++) {
      if (batchCancelled) break;
      const [el, state] = pending[i];
      countLabel.textContent = `Explaining ${i + 1} of ${pending.length}${failed ? ` (${failed} failed)` : ""}…`;
      if (!state.btn || !document.contains(el)) continue; // answered individually or removed mid-batch
      await explainBlock(el, state.btn);
      if (blocks.get(el)?.card?.querySelector(".err")) failed++;
    }

    batchRunning = false;
    batchCancelled = false;
    explainAllBtn.textContent = "explain all";
    updateBadge();
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
      api.runtime.sendMessage({ type: "DELPHI_REGION_SELECTED", rect, dpr: window.devicePixelRatio || 1 });
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
  api.runtime.onMessage.addListener(window.__delphiListener);
})();
