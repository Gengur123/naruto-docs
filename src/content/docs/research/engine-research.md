---
title: Engine research
description: Open-source TCG engines compared as a base for a headless Naruto TCG simulator.
---

Researched 2026-10-18 from the repositories' READMEs and source. No games-per-second figures were found or measured, and none of the engines was benchmarked.

**Finding that changes the question:** [TheCardGoat/tcg-engines](https://github.com/TheCardGoat/tcg-engines) already has a Naruto workspace, `submodules/naruto`. It is a "Preview" TypeScript engine for the unreleased game. It has a pure reducer, a seeded RNG (mulberry32, seed in state), a card snapshot with provenance tracking, and a heuristic AI. Its README says the rules are provisional and not official.

## Comparison

| Project | Language | License | Activity | Headless, seeded, cloneable | Legal-action API | Card data | Fit |
|---|---|---|---|---|---|---|---|
| [tcg-engines](https://github.com/TheCardGoat/tcg-engines) (`submodules/naruto`) | TypeScript | MIT | 42 stars; pushed 2026-10-12; synced from a private repo | Yes to all three | None; an illegal action returns the same state | Stats are data; effects hand-coded (`effects.ts`, about 35 KB) with an `EFFECT_COVERAGE` table | Best Naruto starting point, but small and slow |
| [Forge](https://github.com/Card-Forge/forge) | Java | GPL-3.0 | 2.8k stars; active | Headless sim mode; heavy AI | Partial | Script-based, MTG-specific | Borrow ideas only |
| [XMage](https://github.com/magefree/mage) | Java | MIT | 2.4k stars; active | Possible, but heavy | Yes | One Java class per card | Poor fit |
| [ygopro-core](https://github.com/edo9300/ygopro-core) | C++ | Unclear | 79 stars; active | Yes, message-pump I/O | Response-driven callbacks | Lua per card | Chain and priority ideas only |
| [SabberStone](https://github.com/HearthSim/SabberStone) | C# | AGPL-3.0 | Last push 2022 | Yes, with `Clone` | Yes | Mostly code | Stale and copyleft |
| [Fireplace](https://github.com/jleclanche/fireplace) | Python | AGPL-3.0 | Last push Dec 2025 | Yes, but slow | Yes | Python classes | Poor fit |
| [Metastone](https://github.com/demilich1/metastone) | Java | GPL-2.0 | Last push 2018 | Yes | Yes | JSON spell and aura DSL | Dead; DSL reference |
| [OpenSpiel](https://github.com/google-deepmind/open_spiel) | C++/Python | Apache-2.0 | 5.5k stars; active | Yes: `Clone`, chance nodes | `LegalActions` | Not a TCG engine | Borrow the API shape |
| [RLCard](https://github.com/datamllab/rlcard) | Python | MIT | Last push 2024 | Env interface only | Yes | Not a TCG engine | Interface reference |
| [gym-locm](https://github.com/ronaldosvieira/gym-locm) | Python | MIT | 40 stars; active | Yes | Yes | Fixed card set | Observation and action-space design |
| [phase-rs/phase](https://github.com/phase-rs/phase) | Rust | Apache-2.0 | 307 stars; active | Native and WASM | Not checked | Not checked | Only Rust TCG engine found; internals not verified |

Not read: the Lorcana, One Piece and Gundam workspaces inside tcg-engines. Not assessed: Cockatrice and PettingZoo.

## Ranking

1. **tcg-engines Naruto workspace: borrow, do not adopt as the runtime.** It is the only open-source engine aimed at this game, and its architecture suits a fast sim: pure reducer, explicit `pendingChoice` state, serializable state with a `rulesProfile` version, seed in the state, and a card dataset with provenance. It is MIT-licensed. The gaps: no legal-action enumerator, state is cloned on every action, rules are provisional, and the effect DSL does not exist yet. At about 100 KB of TypeScript it is a small port.
2. **OpenSpiel: borrow the API contract.** `Clone`, `LegalActions`, `ApplyAction`, chance outcomes, observation tensors and returns. Matching it keeps existing self-play and search tooling usable.
3. **ygopro-core, with Metastone and Forge as secondary references: borrow ideas only.** ygopro-core's chain and response model fits Naruto's counter window; Metastone's JSON effect DSL shows declarative effects. Their licenses argue against copying code.

## Recommendation

Write the simulator from scratch in MoonBit (or Rust), borrowing from the three projects above. No existing engine is both fast and Naruto-ready, and the rules are not final, so the card and rules layer will change often while the core loop is where speed matters.

- Use the tcg-engines Naruto workspace as the reference for the action set, phase model and state shape, and as seed data for cards after checking the scraped data.
- Keep state a flat, copyable struct (arrays and integer ids) with a counter-based RNG in the state, so cloning is a memcpy and a replay is a seed plus an action list.
- Write `legal_actions(state)` as an explicit function, with `step`, `clone` and `observe` in OpenSpiel's style.
- Define cards as data plus a small effect-op set, with a coverage table so unfinished cards fail loudly.
- Version the rules profile in the state, and add a differential test against the TypeScript engine's replays.

## Caveats

- The tcg-engines Naruto code is a public export of a private repository and could change or stop at any time.
- Star counts and activity are from the research date.
