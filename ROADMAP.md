# Roadmap

A status snapshot and prioritized next steps — not a promise or a schedule, just a living plan for a solo project. Companion to [CLAUDE.md](CLAUDE.md) (architecture + verification log) and the [README](README.md): this file is the durable source of truth for *what's next and why*, CLAUDE.md is the durable source of truth for *how it works and what was already tried*. Read both before proposing changes — several "obvious" ideas (activeTab-only permissions, `sidebar_action` alongside `side_panel`, jsdom tests) were tried and deliberately rejected, with reasons recorded there.

Priority order below follows a **ship-1.0 track**: resolve the browser-support unknowns first (they gate every claim the listing will make), then store-readiness, then study features.

## Current state (done) — v0.9.1

- Four input paths, all ending in an explanation-first answer with the answer hidden behind a reveal: text selection (context menu / `Ctrl+Shift+E`, iframe-safe), region capture (`Ctrl+Shift+D`, screenshot → OffscreenCanvas crop → vision model, no OCR step), whole-page "check this page" (`Ctrl+Shift+C`, iframe-aware scroll-and-screenshot, structured per-question output), and opt-in per-tab auto-detect (heuristic question detection, per-question Explain/Answer buttons, "explain all"/"answer all" batch with progress and cancel).
- Docked side panel (replaced the popup entirely): per-tab history in `storage.session` (cap 50, cleared on navigation/tab-close), collapsed entries with copy/clear/per-entry delete, live "thinking" state driven by real background state.
- Providers: Chrome built-in AI (Gemini Nano via Prompt API, default), Ollama with separate text/vision models, any OpenAI-compatible custom endpoint. Mode switch: explain-first / answer-only.
- The one product invariant holds everywhere: **every LLM call traces back to an explicit user click** — auto-detect finds candidates and renders buttons; it never calls `generate()` itself. See CLAUDE.md before touching anything that bends this.
- Cross-browser `api = globalThis.browser ?? chrome` pattern in every API-touching file. Manifest carries `browser_specific_settings.gecko` (id + `strict_min_version: "121.0"`).
- Verification: all three non-auto-detect paths manually verified end-to-end against real Chrome + real on-device Gemini Nano, plus Ollama end-to-end (text and vision, `qwen2.5vl:7b`). CI: node test suite (prompt template + question heuristic), manifest-validity check, syntax check across every script.
- Install helpers (`install.sh` / `install.ps1`) launch a throwaway-profile browser with the extension loaded; full first-run walkthrough in [docs/walkthrough.md](docs/walkthrough.md).

## Phase 1 — Resolve the Firefox/Brave unknowns (verify before building)

Everything browser-compat in CLAUDE.md is currently either reverted-on-contact (`sidebar_action`, `background.scripts`) or explicitly unconfirmed. None of Phase 2 can make honest store-listing claims until these are settled against real browsers, not docs-from-memory.

1. **~~Does Firefox even start the background context from `background.service_worker` alone?~~ VERIFIED (2026-08-22, Firefox 154.0, headless + webdriver temporary install).** It doesn't get the chance: **Firefox rejects the install outright** — `InvalidWebExtensionError: background.service_worker is currently disabled. Add background.scripts.` Not a silent no-start; a hard manifest rejection at install time. Also verified the other half: swapping only the `background` key to `{"scripts": ["src/background.js"], "type": "module"}` makes the same unpacked extension **install cleanly and evaluate Delphi's entire unmodified background module chain** (probe entry → dynamic import of `src/background.js` → all providers/libs resolve, zero errors). Conclusion of record: the Firefox delta is exactly the one manifest key, and the two-manifest/transform approach from CLAUDE.md's rejected-single-manifest note is now confirmed mandatory — not guessed. Methodology note for reruns: network probes from the background context are unreliable here (MV3 CSP can quietly upgrade `http://127.0.0.1` probes); visible `console.log` markers captured via geckodriver's service log (`browser.console.dump`) are the dependable channel.
2. **Side panel on Firefox.** Check current MDN + Firefox release notes for whether Firefox has adopted the standardized `side_panel` key (the earlier revert happened precisely because this was assumed instead of checked). If unsupported: two manifests become the plan-of-record for both gaps at once — step 1 already confirmed the background half of that requirement — and Firefox keeps the Options fallback meanwhile.
3. **Verify `storage.session` behaves on Firefox** (history + auto-state keys depend on it) during the same load test — untested alongside everything else.
4. **Brave:** expected to work as-Chrome for everything except built-in AI (Brave doesn't ship the on-device model component — already handled by provider fallback). Confirm side panel + region capture + Ollama on a real install; document "Ollama/Custom required" for Brave users in the listing rather than leaving it discoverable-by-failure.
5. **Update the README/CLAUDE.md claims to whatever was verified** — including retracting Firefox support to "untested" if steps 1–3 stall. Honest scope beats aspirational scope.

## Phase 2 — v1.0: store-readiness

Definition of done for 1.0: all four paths verified on Chrome + Brave (Phase 1 step 4), Firefox either resolved or explicitly scoped out of the listing, package uploads clean from this repo with no build step added.

1. **MV3 remote-code audit** — walk `src/providers/*.js` and confirm nothing loads/evals remote code (fetching *responses* from a user-configured endpoint is fine; loading *code* isn't). Should be clean today; write down the check so it's repeatable per release.
2. **Permissions justification text** — `<all_urls>` has a real, documented reason (side-panel auto-detect needs tab access beyond the opening grant; activeTab-only was tried live and failed — CLAUDE.md has the post-mortem). Turn that into the Web Store dashboard's per-permission justification strings before review asks.
3. **Privacy policy + listing copy** — data flow is: page content goes only to the LLM backend the user chose (on-device, their local Ollama, or their keyed endpoint); nothing else leaves the machine. One static privacy-policy page + screenshots from `manual-test/index.html`.
4. **Packaging** — a documented `zip` incantation (or 10-line script if the two-manifest path landed in Phase 1) that produces an upload-ready artifact excluding `.git/`, `docs/`, `tests/`, `manual-test/`. Keep it out of the extension dir itself so "load unpacked" keeps working unchanged.
5. **Release discipline** — bump `manifest.json` version per release, tag the commit, note the release in this file's status section.

## Phase 3 — Study features (after 1.0)

1. **History export** — the side panel already has Copy-as-plain-text; add Markdown and CSV export (question / explanation / answer columns), which doubles as Anki-importable output (`Front` = question, `Back` = explanation + answer). Export lives in the existing history header, operates on the current tab's history.
2. **Optional history persistence across navigation** — today history dies with the tab on purpose (a new page is a new set of questions). If export proves people want longer-lived material, add an opt-in keep-history toggle, default off — not a rethink of the default.
3. Explicitly **not** planned: built-in spaced-repetition scheduling, cross-device sync. Anki (or similar) owns scheduling; Delphi's job ends at producing good importable cards. Revisit only if export proves insufficient in practice.

## Boundaries that outrank this roadmap

- **No proctored-exam features.** Nothing auto-answers, nothing hides; see README. Any feature request that leans toward continuous/covert capture gets refused, not scoped-later.
- **No screen/desktop capture beyond the visible-tab region tool**, no cross-tab or background scanning — different trust level than this project asks for.
- **The click invariant** (first bullet of Current state) is architecture, not policy — it survives feature work in all three phases above.
