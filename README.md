# delphi

A browser extension (Chrome, Brave, Firefox) for self-study: get an explanation of the reasoning behind a practice question — including why the *other* choices are wrong, which is the part most practice tests and mock exams skip — with the answer revealed on click.

**Not for live/proctored exams.** Every answer requires an explicit click from you — nothing auto-answers, ever. The panel and buttons it shows are normal in-page UI elements, not something designed to hide from a screen share or a proctor. It exists to fix a specific self-study problem: mock tests that tell you an answer is wrong without ever saying why.

## How it works

Three ways to hand Delphi a question:

1. **Select text** → right-click → "Explain with Delphi", or `Ctrl+Shift+E`.
2. **Capture a region** → right-click anywhere (or on an image) → "Capture region with Delphi", or `Ctrl+Shift+D` → drag a box around a question that isn't selectable text (an image, a canvas-rendered quiz, a PDF viewer). Sent to a vision-capable model — no separate OCR step needed, the model reads the image directly.
3. **Auto-detect** (optional, off by default) → toggle it on in the side panel for the current tab. Delphi scans the page for question-shaped text (a `?` plus multiple `A) B) C)`-style choices) and adds a small "Explain" button next to each one it finds, with the result rendered as a small card right next to that question — not the shared corner panel, since with several questions on a page that would just overwrite itself. A "Delphi watching (N)" badge stays visible the whole time with a one-click stop, and the toggle resets automatically when you navigate to a new page — it's opt-in per page load, never silently persistent.

**A whole page of questions**: the badge also has an **"explain all"** button — one click runs every currently-detected question through the LLM, one at a time, with a "Explaining 3 of 20…" progress indicator and a one-click cancel. It's sequential rather than parallel on purpose: a local model (on-device Gemini Nano, or CPU-only Ollama) is a single shared resource, so firing off many requests at once wouldn't be faster, just contended — and each real question can take anywhere from several seconds to a couple of minutes depending on your hardware. "Explain all" is still one explicit click fanning out to several calls you asked for, not detection triggering anything on its own.

In every case, Delphi sends the content to an LLM with a prompt asking for reasoning first, then the answer. The answer is hidden behind a "Reveal answer" button by default — read the explanation, think about it, then check yourself.

## Side panel

Click the toolbar icon (Chrome/Brave) to open Delphi as a docked side panel instead of a popup that closes on you — it stays open while you work through a page. It shows the auto-detect toggle and a running history of every answer given on the current tab (newest first), so you can scroll back through earlier questions instead of losing them once a floating card/panel closes. History is per-tab and clears on navigation, same as auto-detect.

**Firefox doesn't have this yet** — its own sidebar mechanism (`sidebar_action`) is a different manifest key than Chrome's `side_panel`, and Chrome errors on unrecognized keys, so it can't just be added alongside without a per-browser build. Firefox's toolbar icon opens Options instead for now.

## LLM providers

Configurable in the extension's Options page:

- **Chrome built-in AI (default)** — Gemini Nano via Chrome's [Prompt API](https://developer.chrome.com/docs/ai/prompt-api). Free, on-device, no API key, no network call once the model is downloaded. Requires a recent Chrome (148+); the on-device model isn't instant on first use — the first `LanguageModel.create()` call triggers a real download, so give it a few minutes before assuming it's broken. Behind two `chrome://flags` on some Chrome builds (`#prompt-api-for-gemini-nano`, `#optimization-guide-on-device-model`) until it's fully rolled out.
- **Ollama (local)** — points at a local `ollama serve` instance. Free, private, works offline, needs Ollama installed with a model pulled.
- **Custom API** — any OpenAI-compatible chat completions endpoint (OpenAI, OpenRouter, Groq, etc.) with a key you supply and that stays in local extension storage.

## Modes

- **Explain first** (default) — reasoning, then a hidden answer you reveal when ready.
- **Answer only** — for a quick self-check pass once you've already reasoned it out yourself.

## Install (unpacked, for development)

**Chrome / Brave**: `chrome://extensions` (Brave: `brave://extensions`) → enable Developer mode → "Load unpacked" → select this directory. Chrome's built-in AI works with zero setup if available; **Brave doesn't ship it** (no Gemini Nano component), so pick Ollama or Custom API in Options there.

**Firefox**: `about:debugging#/runtime/this-firefox` → "Load Temporary Add-on" → select `manifest.json` in this directory. Temporary add-ons are removed when Firefox closes — reload after each restart. Firefox has no built-in on-device AI either (no Prompt API), so use Ollama or Custom API. Requires Firefox 121+ (background-script startup fix this relies on).

## A note on limits

Chrome's built-in AI has no cross-question cap worth worrying about — each explanation gets its own fresh model session, so nothing accumulates across a long "explain all" run. The only real per-question limit is a single question being too long for one session's own context window, which shows up as a plain, readable error on that question's card rather than a cryptic failure. A **custom API** provider is different: a hosted service's rate limit is a genuine shared constraint, so a 429 during a busy "explain all" run shows up as "Rate limited by the API — wait a moment, or switch provider" on that question, and the batch keeps going rather than aborting.

## Status

v0.3 — text selection, region capture (image input, vision-capable providers), opt-in per-tab auto-detect with inline per-question results, and a one-click "explain all" for a page with several questions. Every path still starts from a manual click before any LLM call happens. All three input paths manually verified end-to-end against Chrome's built-in AI (real on-device Gemini Nano) — selection, region-capture crop/vision, and auto-detect's heuristic + click-to-explain button all confirmed working against `manual-test/index.html`.

## Tests

```
node tests/test_prompt_template.js
```
