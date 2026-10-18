---
title: Scan, counts, signatures and receipts
description: What the newer dandori commands are for, in plain words, with one example each.
sidebar:
  order: 2
---

[Commands](/tools/commands/) lists every command and flag as the program prints them. This page says what the newer ones are for. Each example was run on a small test project and its output is pasted as printed.

## Where allocations are: `tracker scan`

The scan reads the code and lists each allocation site it knows how to spell. It then compares the list with the allocation ledger.

```text
$ dandori tracker scan --ast-grep <path to ast-grep.exe>
new    crates/render/src/draw.rs:2  rust-vec-with-capacity
         let mut scratch = Vec::with_capacity(names.len());
new    crates/render/src/draw.rs:4  rust-to-string
         scratch.push(n.to_string());
rule   rust-to-string: 1 hit
rule   rust-vec-with-capacity: 1 hit
tracker scan: 2 sites under .: 2 without an entry, 0 moved, 0 gone
ledger not changed; add --write to record this
```

With `--write`, each new site becomes a ledger entry marked unreviewed. An unreviewed entry has no colour: nobody has judged it yet. The scan also refreshes the line of an entry whose code moved, and marks an entry stale when its code is gone.

The scan needs ast-grep, a separate program, for Rust, C, C++, TypeScript and JavaScript. MoonBit files are searched as plain text.

What it cannot see: macros, generic code and dependencies. It lists common spellings only. A file with no site listed may still allocate.

## How many allocations happen: `tracker ingest`

A counting test runs the code and counts its allocations. It prints one line of JSON per measured scope. The ingest reads those lines and stores them in `ledgers/allocation-counts.json`.

```text
$ dandori tracker ingest counts.txt
count  3 allocations, 96 bytes over 600 frames in scope `draw_path` of test `draw_path_allocs` (counting allocator, commit 4c1e2aa, taken in 2026-10-11)
tracker ingest: records taken in 1, other lines skipped 2, records in the ledger 1, entries raised to red 0
saved docs/site/ledgers/allocation-counts.json
```

A ledger entry names a scope in its `measure` field, and the tracker page shows the count beside it. A count belongs to a scope, not to a line.

## Who may colour an entry green

No tool sets green. The scan sets no colour at all. The ingest can raise an entry to red and never lowers one.

A cheap model may draft a colour and a reason for an entry. Its draft goes in the entry's `proposed` field and the page shows it as a proposal. If the draft says green, the check fails:

```text
rule allocation scan.draw.bf327250 (crates/render/src/draw.rs:2)
  rule: a proposal may not be green: only a reviewer sets green, by hand
```

A reviewer sets green by hand, and `tracker check` then asks for evidence it can find: a test in a file that exists, or a scope that counted zero allocations.

## What a benchmark number came from: signatures

A benchmark can record three signatures: the compiler, the machine and the workload. Record them after a real run:

```text
$ dandori bench check --stamp shape-ours --compiler "rustc 1.90 release" --workload "latin 1k"
```

The machine is read from the system unless `--machine` states it. Two benchmarks of one parity entry are compared on each signature both record. A signature only one side records is not compared. When one differs, both are called unfair and the line says what differs:

```text
unfair      text.shaping/shape-ours: machine differs from `shape-harfbuzz`: `20 cores, 16176 MB` here, `laptop, 8 cores, 16 GB` there
              compiler rustc 1.90 release; machine 20 cores, 16176 MB; workload latin 1k
unfair      text.shaping/shape-harfbuzz: machine differs from `shape-ours`: `laptop, 8 cores, 16 GB` here, `20 cores, 16176 MB` there
              compiler rustc 1.90 release; machine laptop, 8 cores, 16 GB; workload latin 1k
bench check: 2 benchmarks, 0 fresh, 0 stale, 2 unfair, 0 deprecated, 0 unsigned
```

Rerun both sides on one machine, stamp both with the same compiler and workload, and they are fresh again.

## What was reported upward: outbox and receipts

An agent that passes a change to the agent that spawned it records it first. The record is a delta with an id, kept in the sender's outbox. Here it records two.

```text
$ dandori delta send --from track-render --to orchestrator --text "allocation: draw.rs scratch went from red to green, it comes from the frame arena and draw_path counts 0 over 600 frames"
Recorded 201c846567 from "track-render" to "orchestrator": allocation: draw.rs scratch went from red to green, it comes from the frame arena and draw_path counts 0 over 600 frames
$ dandori delta send --from track-render --to orchestrator --text "parity: shape-ours and shape-harfbuzz were rerun on one machine and stamped"
Recorded 6739362537 from "track-render" to "orchestrator": parity: shape-ours and shape-harfbuzz were rerun on one machine and stamped
```

The parent writes a receipt when it has taken a delta in:

```text
$ dandori delta ack --to orchestrator 201c846567
Acknowledged 201c846567 from "track-render": allocation: draw.rs scratch went from red to green, it comes from the frame arena and draw_path counts 0 over 600 frames
```

Either side can ask what is still open. The sender asks what has no receipt:

```text
$ dandori delta pending --from track-render
1 delta from "track-render" with no receipt yet (1 of 2 recorded have one):
  6739362537  to orchestrator  2026-10-11  parity: shape-ours and shape-harfbuzz were rerun on one machine and stamped
```

The parent asks `dandori delta inbox --to orchestrator` for what is waiting. Both answers come from files on disk, so they hold after a compaction, when an agent no longer remembers what it sent.

The files are plain text in the git directory that all worktrees of a repository share. Nothing is committed.
