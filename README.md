# Delphi

<p align="center">
  <a href="https://github.com/Cyb3rRon1n/delphi/actions/workflows/ci.yml">
    <img src="https://img.shields.io/github/actions/workflow/status/Cyb3rRon1n/delphi/ci.yml?label=CI" alt="CI">
  </a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT"></a>
  <img src="https://img.shields.io/badge/manifest-v3-blue.svg" alt="Manifest V3">
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/Cyb3rRon1n/delphi/main/docs/images/banner.svg"
       alt="Delphi - A self-study explainer that reads the page with you"
       style="max-width: 100%; height: auto;">
</p>

<p align="center">
  📖 <a href="docs/walkthrough.md">Walkthrough</a> · <a href="ROADMAP.md">Roadmap</a> · <a href="CLAUDE.md">Architecture &amp; Verification Log</a> · <a href="https://cyb3rron1n.github.io/">Sibling Projects</a> · <a href="docs/images/favicon.svg">Favicon</a>
</p>

A browser extension (Chrome, Brave, Firefox) for self-study: get an explanation of the reasoning behind a practice question — including why the *other* choices are wrong, which is the part most practice tests and mock exams skip — with the answer revealed on click.

**Not for live/proctored exams.** Every answer requires an explicit click from you — nothing auto-answers, ever. The panel and buttons it shows are normal in-page UI elements, not something designed to hide from a screen share or a proctor. It exists to fix a specific self-study problem: mock tests that tell you an answer is wrong without ever saying why.

## How it works

Four ways to hand Delphi a question:

1. **Select text** → right-click → "Explain with Delphi", or `Ctrl+Shift+E`. Works even for text selected inside an iframe.
2. **Capture a region** → right-click anywhere (or on an image) → "Capture region with Delphi", or `Ctrl+Shift+D` → drag a box around a question that isn't selectable text (an image, a canvas-rendered quiz, a PDF viewer). Sent to a vision-capable model — no separate OCR step needed, the model reads the image directly.
3. **Check this page** (side panel button, right-click → "Check this page with Delphi", or `Ctrl+Shift+C`) → scrolls through the whole page (not just what's visible), screenshotting each section (capped at 8), and sends all of them together asking the model to find and answer *every* question across the whole page. Screenshot-based like region capture, so it works inside iframes too (checks every frame, not just the top one, so it also handles a course player that scrolls inside its own iframe rather than the page itself) — useful for LMS/knowledge-check pages (e.g. `.jsp`-based courses) where the question content isn't reachable by the DOM-based paths at all. Each question found lands in the side panel's history as its **own separate collapsible entry**, not one long blob of text. **Stay on that tab while it runs** — it needs to actually scroll and screenshot the page, and switching away partway through will interrupt that. More screenshots means proportionally longer processing on a local model, on top of already being the slowest path here — expect several minutes for a long page.
4. **Auto-detect** (optional, off by default) → toggle it on in the side panel for the current tab. Delphi scans the page for question-shaped text — a `?` plus multiple `A) B) C)`- or `1) 2) 3)`-style choices, or a true/false statement — and adds two small buttons next to each one it finds:
   - **Explain** — full reasoning, answer hidden behind reveal, rendered as a card next to that question.
   - **Answer** — skips straight to answer-only for that one question (regardless of the global mode set in Options), rendered as a small compact badge right where the buttons were, since there's no explanation to show.

   Neither goes to the shared corner panel — with several questions on a page, one shared panel cycling through answers would just overwrite itself. A "Delphi watching (N)" badge stays visible the whole time with a one-click stop, and the toggle resets automatically when you navigate to a new page.

**A whole page of questions**: the badge also has **"explain all"** and **"answer all"** buttons — one click runs every currently-detected question through the LLM, one at a time, with a progress indicator ("Explaining 3 of 20…") and a one-click cancel. Sequential rather than parallel on purpose: a local model (on-device Gemini Nano, or CPU-only Ollama) is a single shared resource, so firing off many requests at once wouldn't be faster, just contended — and each real question can take anywhere from several seconds to a couple of minutes depending on your hardware. Still one explicit click fanning out to several calls you asked for, not detection triggering anything on its own.

In every case, Delphi sends the content to an LLM with a prompt asking for reasoning first, then the answer. The answer is hidden behind a "Reveal answer" button by default — read the explanation, think about it, then check yourself.

## Side panel

Click the toolbar icon (Chrome/Brave) to open Delphi as a docked side panel instead of a popup that closes on you — it stays open while you work through a page. It has **Capture region** and **Check this page** buttons (same as the right-click menu / keyboard shortcuts, just one click away without leaving the panel), the auto-detect toggle, and a running history of every answer given on the current tab (newest first). History is per-tab and clears on navigation, same as auto-detect.

**While anything is actually running** (selection, region capture, or check-page — auto-detect already shows its own per-button/badge status directly on the page), the panel shows a "Delphi is thinking — stay on this tab until it finishes" banner with a spinner, and the two action buttons disable themselves. This reflects real background state (not a guess tied to whichever button you clicked), so it stays correct no matter which surface actually triggered the request.

The bottom-right floating panel used for selection/region-capture results now shows the same answers, so it stays collapsed to a small "Δ" tab and no longer pops open on its own — click it to check the latest result, click it (or the ✕) to collapse again. With the side panel doing that job now, having both surfaces push the same content at you was just noise.

**Side panel history is collapsed per entry too** — each answer shows just the question label until you click it, except the one you most recently asked for, which stays open. Click any entry to expand/collapse it. A history header above the list has **Copy** (copies everything to your clipboard as plain text) and **Clear** (wipes history for the current tab); each entry also has its own "✕" to delete just that one.

**Firefox doesn't have this yet** — its own sidebar mechanism (`sidebar_action`) is a different manifest key than Chrome's `side_panel`, and Chrome errors on unrecognized keys, so it can't just be added alongside without a per-browser build. Firefox's toolbar icon opens Options instead for now.

## LLM providers

Configurable in the extension's Options page:

- **Chrome built-in AI (default)** — Gemini Nano via Chrome's [Prompt API](https://developer.chrome.com/docs/ai/prompt-api). Free, on-device, no API key, no network call once the model is downloaded. Requires a recent Chrome (148+); the on-device model isn't instant on first use — the first `LanguageModel.create()` call triggers a real download, so give it a few minutes before assuming it's broken. Behind two `chrome://flags` on some Chrome builds (`#prompt-api-for-gemini-nano`, `#optimization-guide-on-device-model`) until it's fully rolled out.
- **Ollama (local)** — points at a local `ollama serve` instance. Free, private, works offline, needs Ollama installed with a model pulled. Has **separate text and vision model fields** — one general-purpose model is rarely both a strong text reasoner and vision-capable, so this avoids forcing a compromise pick for one path or the other (defaults: `llama3.2` for text, `llava` for vision).
- **Custom API** — any OpenAI-compatible chat completions endpoint (OpenAI, OpenRouter, Groq, etc.) with a key you supply and that stays in local extension storage.

## Modes

- **Explain first** (default) — reasoning, then a hidden answer you reveal when ready.
- **Answer only** — for a quick self-check pass once you've already reasoned it out yourself.

## Install

```
git clone https://github.com/Cyb3rRon1n/delphi.git
cd delphi && ./install.sh          # Linux/macOS
cd delphi; .\install.ps1           # Windows (PowerShell)
```

Launches Chrome/Chromium/Brave with Delphi loaded, in a throwaway profile — no manual "Load unpacked" clicking. `install.ps1` checks PATH first, then the usual Chrome/Brave install locations under `Program Files`/`LocalAppData`, since those browsers aren't normally on `PATH` on Windows. Full first-run walkthrough (verifying the LLM backend, testing all four input paths against the included test page): **[docs/walkthrough.md](docs/walkthrough.md)**.

**Manual load, or Firefox**: `chrome://extensions` (Brave: `brave://extensions`) → enable Developer mode → "Load unpacked" → select this directory. For Firefox, `about:debugging#/runtime/this-firefox` → "Load Temporary Add-on" → select `manifest.json`. **Firefox is untested** — two manifest keys tried for compat (`background.scripts`, `sidebar_action`) both broke Chrome loading and were reverted, so whether the background script even starts there is unconfirmed; try it and report what happens. Chrome's built-in AI works with zero setup if available; **Brave doesn't ship it** (no Gemini Nano component) and Firefox has no equivalent either, so use Ollama or Custom API on both.

## Permissions

Delphi requests access to all sites (`host_permissions: ["<all_urls>"]`), which Chrome will show you as "Read and change all your data on all websites" when you install it. This is specifically for the side panel's auto-detect toggle to work reliably no matter which tab is active — Chrome only grants temporary per-tab access when you first open the panel or click the toolbar icon, and that grant doesn't carry over to tabs you switch to afterward while the panel stays open, so a narrower permission left the toggle broken most of the time in practice. It's still not used for anything passive: nothing runs, is scanned, or is sent anywhere until you click something — select text, drag-capture a region, or toggle auto-detect on a specific tab yourself.

## A note on limits

Chrome's built-in AI has no cross-question cap worth worrying about — each explanation gets its own fresh model session, so nothing accumulates across a long "explain all" run. The only real per-question limit is a single question being too long for one session's own context window, which shows up as a plain, readable error on that question's card rather than a cryptic failure. A **custom API** provider is different: a hosted service's rate limit is a genuine shared constraint, so a 429 during a busy "explain all" run shows up as "Rate limited by the API — wait a moment, or switch provider" on that question, and the batch keeps going rather than aborting.

## Status

v0.9 — text selection, region capture, whole-page "check this page" (iframe-aware, structured per-question output), opt-in per-tab auto-detect (lettered/numbered/true-false detection, "explain all"/"answer all"), a docked side panel with history management and a live "thinking" indicator, and separate Ollama text/vision models. Every path still starts from a manual click before any LLM call happens. Core paths manually verified end-to-end against Chrome's built-in AI (real on-device Gemini Nano) and Ollama — see [CLAUDE.md](CLAUDE.md) for the specific bugs found and fixed along the way (service worker idle-kill on long local-model calls, iframe-scrolled full-page capture, etc.).

## Tests

```
node tests/test_prompt_template.js
```

CI (`.github/workflows/ci.yml`) runs this plus a manifest-validity check and a syntax check across every script on each push — the same checks done by hand throughout this project's development, now automated.
