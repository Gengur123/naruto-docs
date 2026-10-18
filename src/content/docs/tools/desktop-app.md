---
title: Desktop app
description: The Shinobi Duel desktop app, its rules and how it is built.
---

Shinobi Duel is a native desktop app that plays a complete card duel. You play Player 1 against the built-in AI, or watch the AI play both sides. A Lab tab runs thousands of games with no interface and reports throughput and win rates, and a Cards tab lists the pool.

## Rules

- Each leader starts with 20 life. The second player starts with 28 to offset going second; 20,000 AI games split 49.7% to 50.3%.
- Decks hold 30 cards: fifteen different cards, two copies of each, from a pool of 29.
- Player 1 draws 3 cards and Player 2 draws 4. The active player draws at the start of each turn, except Player 1 on turn 1.
- Maximum chakra grows by 1 each turn up to 10 and refills at the start of the turn.
- Shinobi can attack the turn after they arrive, unless they have Swift. A Guard shinobi must be attacked before anything else. In combat both shinobi deal damage to each other; a leader never strikes back.
- Jutsu resolve at once: damage to a target or to every enemy shinobi, healing, drawing, or a +3/+3 boost.
- An empty deck costs 1 life, then 2, then 3, and so on. A duel ends when a leader reaches 0 life, or on turn 80 when the higher life wins.

These rules are a stand-in for the unreleased Naruto TCG. They are small enough to port when the real rules are known.

## How it is built

| Part | Where | What it does |
|---|---|---|
| Engine | `sim/` | MoonBit, native target. Pure game state, legal-action list, AI and JSON output. |
| Shell | `app/` | Electrobun 2.0.2. The Bun main process serves the page on a loopback port and runs the engine. |
| Interface | `app/src/ui/` | HTML, CSS and JavaScript in the system WebView2 window. |

A game is its seed plus the list of action codes played so far. Each request replays that list, so the engine keeps no state between calls and any position can be rebuilt exactly.

Action codes: 0 ends the turn; `100 + hand * 20 + target` plays a card; `1000 + attacker * 20 + target` attacks. Target 0 means none, 1 to 7 an enemy shinobi, 9 the enemy leader, and 10 to 16 a friendly shinobi.

## Run it

```sh
cd sim && moon build --target native --release
cd ../app && npm install && npx electrobun dev
```

The first `electrobun` run downloads Hutch, the Electrobun core and Bun for the exact pinned versions.
