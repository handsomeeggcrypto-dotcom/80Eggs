# MoeMode (`moemode/`)

The user's personal "what should I do right now?" app: Main Quest → campaigns (Income / Build & Learn / Life) → quests → tasks. WHAT NOW picks the next thing. Hidden: noindex, not linked from the homepage, at www.81eggs.com/moemode/. Installable on a phone (`manifest.json`).

## Rules

- **The user's data never goes in the repo.** Everything lives in the browser's localStorage under `moemode_v1`, one copy per device. Backup is export/import. Never hardcode the user's quests, tasks or anything personal in the code, because the repo is public.
- **No AI in v1, on purpose.** WHAT NOW uses a deterministic `score()` in `app.js`, and the reasons come from templates. Brain-dump sorting is keyword-based. A Claude add-on is a possible later step, not a default.
- It was cut down from a huge ChatGPT spec so it wouldn't become another abandoned project. Keep additions small.
- **Git tracking:** it reads public commits from the GitHub API and maps a commit's prefix (text before the first `:`) to a quest's `prefix`. That's why every commit in this repo starts with the project name.
- The look is a temporary plain dark/cyan style. The user wants to design a custom style once they know how they use it, so don't polish the style unasked.

## Files

`index.html`, `app.js` (state, scoring, views), `style.css`, `manifest.json`, `icon.png`.

## Roadmap (not built)

Daily check-in, weekly review, pattern feedback, Money Mode decision journal, sync between devices (maybe a private repo), AI.
