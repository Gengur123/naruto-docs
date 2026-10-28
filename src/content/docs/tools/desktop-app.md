---
title: Desktop app
description: The Shinobi Duel desktop app, Ruleset V0 and how it is built.
---

Shinobi Duel is a native desktop app that plays a complete card duel. You play seat 1 against the built-in AI, or watch the AI play both seats. Tabs: Duel, Rules, Lab (batch simulation with throughput and win rates) and Cards.

## Ruleset V0

Bandai has not published a rulebook for the Naruto card game, which launches in summer 2027. These rules are a reconstruction taken from the public behaviour of the unofficial Naruto Shinobi Arena simulator (narutoshinobiarena.com), which labels its own rules "provisional ruleset V0". The card pool here is our own stand-in and shares no card data with that site.

**Goal.** Each Leader has 15 life. A direct hit takes the attacker's DMG off it, usually 1. A Leader at 0 life loses, and so does a player who must draw from an empty deck.

**Decks.** 50 main-deck cards, at most 4 copies of each (2 for an EX Character), plus a Leader, a Summon card and 5 Chakra cards. All 5 Chakra start face-up.

**Setup.** The coin-toss winner chooses who goes first. Both draw 5. The second player may throw back the whole hand once, and draws 2 cards on their first turn instead of 1.

**Turn.** Wake everything, draw (1 card on the very first turn of the game, 2 afterwards), play in the Main phase, then end. A hand over 10 cards discards down on the way out.

**Summoning.** A normal summon costs no Chakra. It rests the Summon card, which wakes next turn, so there is one normal summon per turn. An EX Character is paid for by sending Characters to the Trash. The Battle area holds 5.

**Supports.** Set a Character face-down in the Support area for free, up to 5. Activating it costs its printed Chakra, which turns face-down. It is revealed, resolves, and goes to the Trash. Some Supports answer an attack, some work in your Main phase, and Quick ones work in both.

**Chakra.** It does not come back on its own. From your second turn, resting your Leader turns all Chakra face-up.

**Combat.** Nothing attacks on its owner's first turn. A Character cannot attack the turn it arrives unless it has Rush. Attacking rests the attacker. A Leader is always a legal target, a Character only while rested. An attacker deals its power to a Character and takes nothing back. Damage stays until the end of the turn, and a Character whose damage reaches its health is destroyed. The defender may answer a declared attack with a set Support.

### Choices we made

- The site's card data and effect text are not copied. Our 29 cards (2 Leaders, 23 Characters, 4 EX Characters) are original stat lines and effects with Naruto character names.
- An EX summon pays with the weakest Characters on the field instead of asking which.
- The reference does not publish a first-player balance; with this pool, 20,000 AI games gave the player who went first 56.3% and the second player 43.7%.

## How it is built

| Part | Where | What it does |
|---|---|---|
| Engine | `sim/` | MoonBit, native target. Game state, legal-action list, AI and JSON output. |
| Shell | `app/` | Electrobun 2.0.2. The Bun main process serves the page on a loopback port and runs the engine. |
| Interface | `app/src/ui/` | HTML, CSS and JavaScript in the system WebView2 window. |

A game is its seed plus the list of action codes played so far. Each request replays that list, so the engine keeps no state between calls and any position can be rebuilt exactly. The engine also names who must decide (`decider`): the coin-toss winner, the second player at the mulligan, the defender while an attack waits for an answer, or the active player.

Action codes: 0 end turn, 1 let an attack resolve, 2 Leader Recovery, 3 mulligan, 4 keep, 5 go first, 6 go second, `100 + h` summon from hand slot h, `200 + h` EX summon, `300 + h` set a Support, `400 + s * 20 + t` activate Support s on target t, `500 + a * 10 + t` attack with a (0 to 4 a Character, 5 the Leader) at t (0 the Leader, 1 to 5 a rested Character), `700 + h` discard.

## Run it

```sh
cd sim && moon build --target native --release
cd ../app && npm install && npx electrobun dev
```

The first `electrobun` run downloads Hutch, the Electrobun core and Bun for the exact pinned versions.
