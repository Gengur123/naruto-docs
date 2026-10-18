---
title: Commands
description: Every dandori command and the flags it takes, as the program prints them.
sidebar:
  order: 1
---

This is a copy of the output of `dandori help`, word for word, for the version of the program this page was written against. Nothing checks it against your build. After you build a newer `dandori`, paste its `dandori help` output over the block below.

```text
dandori: programmatic support for the Dandori skill

usage: dandori <command> [options]

  provenance check --source <original.md> [--addendum name=path]...
                   [--name-heading name=Heading]... [--html <out.html>]
                   [--page-form <folder>] [--fragment <out.html>]
                   [--contents <out.html>] [--json] <skill.md>...
      Compare skill files with the user's original text, both ways. Exits 1
      when unmarked wording differs or part of the original is absent.
      --addendum adds a later text by the user under the same two rules,
      with its own line numbers and its own line in the result.
      --name-heading lets one heading through that is not the user's text:
      the name the user gave in that addendum, set as a heading. It passes
      only when the name is in the addendum and the addendum's text comes
      straight after it, and the result lists it under "declared".
      --html writes a page: a contents list, then every file as a closed
      section with its headings as closed sections inside it. --page-form
      names the folder holding report.css and report.js (the skill's
      assets/report-page), which give that page its styles, filter and copy
      controls. --fragment writes the sections alone and --contents the
      contents entries alone, for a larger page in the same form.

  provenance weave --source <original.md> [--addendum name=path]...
                   [--with name=path]... <template> <out>
      Build a skill file from a template. {{source:5-7}} copies lines of the
      original; {{quote:5-7}} copies them as a quotation of the user;
      {{addendum:name:1-2}} copies lines of an addendum;
      {{section:name#Heading}} copies a section of another file.

  tree [--since <rev>] [--format ansi|md|html|json] [--out <file>] [--all]
       [--depth <n>] [--mark] [<dir>]
      Show the file tree, colour coded by what changed since the last
      report: new, edited (+added -deleted lines), unchanged, removed.
      The working tree is compared with --since, else the saved mark, else
      HEAD; before the first commit every file is new. In ansi and md,
      unchanged directories and files are folded unless --all is given, and
      --depth limits the levels shown. html leaves nothing out: there the
      two only choose which blocks start open. json always lists every
      row and ignores both. Use md for chat, html for a page, json for
      programs. --mark saves HEAD as the baseline for the next report.

  layout <file.json> [--id <entry id>] [--rule <rule>] [--format text|svg|json] [--out <file>]
      Offsets, padding and wasted bytes of a struct under a layout rule: c,
      std140, std430, scalar, wgsl or hlsl-cbuffer. The file is one struct
      ({ "rule", "fields", "types" }) or a dataflow ledger, from which --id
      picks an entry. A bare entry id reads <site>/ledgers/dataflow.json
      (--site, default docs/site). --json is --format json. Exits 1 when
      a type has no layout under the rule. An array is written [T; N] or
      array<T, N>. For rule c, "pack": n applies #pragma pack(n) and
      "align": n applies repr(align(n)) to the struct itself. An entry
      whose rule is unfixed is refused: its layout was never fixed by the
      source, so there is nothing to compute.

  tracker check [--strict] [--site <dir>] [--json]
      Reopen every anchor in the allocation and dataflow ledgers, enforce the
      colour rules, and list stale entries. Exits 1 when any entry is stale
      or breaks a rule. <dir> defaults to docs/site. A parity or dataflow
      entry may carry "checked", the day its confidence was last checked;
      a value that is not a date such as 2026-10-11 breaks a rule. Nothing
      writes that date: it is typed into the ledger. Green needs evidence
      that resolves: the evidence begins with the path of a file that exists
      (path, path:line or path::test_name, with no space in the path), the
      line is in that file and the test name is in its text. Or the entry
      has a measure whose scope counted zero allocations; a count above zero
      is not evidence for green. A proposed green fails, and so does a
      measure with no count.
      A dataflow entry the struct scan added (state unreviewed) needs no
      destination and no confidence, and is counted the way an unreviewed
      allocation entry is. Its rule may be unfixed, and a move may carry
      "to", "by" and "text".
      Entries the scan added and nobody has judged are counted and do not
      fail. When the line of such an entry moved or is gone it is counted as
      drifted, which does not fail either: `tracker scan --write` refreshes
      it. With --strict both fail.

  tracker render [--max-age-days <n>] [--site <dir>] [--json]
      Write trackers/allocation.md, parity.md and dataflow.md under
      <dir>/src/content/docs from the ledgers. Same exit codes as check.
      --max-age-days is as in bench check, so the page shows what the check says.
      Unreviewed and stale allocation entries get their own sections, a
      proposal is shown as a proposal, and counts sit beside a measure.
      A parity or dataflow entry's "checked" date is printed under its
      confidence in the table. A dataflow entry is drawn only when its rule
      fixes the layout and every field type is known to the layout code;
      otherwise the page says why it is not drawn.

  tracker scan [--root <dir>] [--changed-since <rev>] [--write] [--quiet]
               [--rules <dir>] [--ast-grep <path>] [--from <file>]
               [--today <YYYY-MM-DD>] [--site <dir>] [--json]
      List the allocation sites under --root (default .) and set them against
      <site>/ledgers/allocation.json. Sites come from ast-grep rules for Rust,
      C, C++, TypeScript and JavaScript, and from a plain text search of
      MoonBit files (not tests), which has no parser behind it and is labelled
      a text match: approximate. A scan lists common spellings. It does not
      see into macros, generic code or dependencies, so a missing site is not
      proof of no allocation.
      Paths in the ledger are relative to the folder dandori runs in, so run
      the scan in the folder those paths start from. --root is a folder below
      it. An absolute --root, or one that leaves the folder with .., is
      refused, and so is a scan from a folder where none of the ledger's
      files can be found (exit 2).
      Prints sites with no entry, entries whose line moved and entries whose
      anchor is gone. Exits 1 when a site has no entry. --write records it:
      new sites become entries with the state unreviewed and no colour, moved
      lines are refreshed, a lost anchor makes the entry stale. No other
      field of an existing entry changes, and the scan never sets a colour.
      Entries of one file that share an anchor text keep their order. When
      fewer lines with that text are left than entries, none is moved and
      all are reported gone: set `where` by hand on the ones still right.
      --write saves the whole file as two-space JSON with LF line ends, so
      the first write of a hand-formatted ledger changes its layout and
      not its data.
      --changed-since <rev> looks only at files changed since that revision,
      and files git does not track yet. --quiet prints one line.
      --rules is the rule folder (default .dandori/rules/alloc), --ast-grep
      the program to run (default ast-grep), --from a saved
      `ast-grep scan --json=stream` output to read instead of running it.
      --today replaces the clock for the date on new entries. Exits 2 when
      ast-grep cannot be started or the rules are missing. On Windows, pass
      --ast-grep the real ast-grep.exe (npm puts it in
      node_modules/@ast-grep/cli-win32-x64-msvc); the .cmd wrapper npm adds
      to PATH cannot be started.
  tracker scan --init-rules [--rules <dir>]
      Write the built-in rule files. A file that is already there is kept.

  tracker scan --structs [--root <dir>] [--changed-since <rev>] [--write]
               [--quiet] [--rules <dir>] [--ast-grep <path>] [--from <file>]
               [--today <YYYY-MM-DD>] [--site <dir>] [--json]
      List the struct definitions under --root (default .) and the places
      where a struct's name appears, and set them against
      <site>/ledgers/dataflow.json. Rust, C and C++ are read by ast-grep
      rules. WGSL (*.wgsl) and MoonBit files (not tests) are read by a plain
      text pass, which has no parser behind it: approximate.
      Not listed: a C++ class, a union, an enum, a struct a macro writes, and
      HLSL or GLSL structs.
      For each struct: where it is, its fields with names and types as the
      source writes them, and what the source says about its layout. The
      layout rule is c only when the source says repr(C) (a C struct is c; a
      C++ struct with a base or a virtual method is not), wgsl for a WGSL
      struct, and unfixed otherwise: the compiler may reorder the fields, so
      `dandori layout` refuses the entry and nothing is drawn as if it had
      been measured. repr items and the derives Pod, Zeroable, Copy and Clone
      are recorded as written; repr(packed) is also "pack" and repr(align(N))
      also "align", which `dandori layout` reads. A field whose type the
      layout code has no size for is kept as written and marked
      "unknown": true; an entry with such a field is not drawn. A Rust field
      under #[cfg(...)] keeps the attribute in front of its type and is
      marked the same way: the field is in some builds and not in others, so
      no one layout is right. The layout code does not know C type names
      (int, float, uint32_t) yet, so no scanned C or C++ struct is drawn, and
      #pragma pack is not read.
      A place is recorded in the struct's "moves" with "by": "scan", the line
      as "text", and a "how": cast, transmute, bytemuck, from-impl,
      parameter, return, field, extern-c or binding. When the place names a
      second known struct in an ordered way, that struct's id is "to":
      transmute::<A, B> and impl From<A> for B are recorded on A with to B, a
      field on the struct its type names with to the struct that holds it.
      These are places where the type's name appears, found by syntax. This
      is not an analysis of a value's lifetime: a struct passed through a
      generic, a macro, a trait object or a type alias is not seen, and
      neither is Self, nor a call such as bytemuck::cast_slice(&v) that names
      no type. Names are matched as text and `use` lines are not read, so a
      type from a dependency that is spelled like a struct of the project is
      recorded on that struct; only a path that starts at std, core or alloc
      is left out. A name two structs of one language share goes to the one
      in the same file, else (not in Rust, where a file is its own module)
      the one in the same folder, else it is counted and passed over.
      A new entry's id is the path's folders without src and crates, the file
      name without its extension unless it is mod, lib or main, then the
      struct's name, joined by dots (crates/render/src/mesh.rs and Mesh give
      render.mesh.Mesh). An entry and a struct match by file and name, so the
      id stays when lines move. When one file has two structs of one name,
      an entry keeps the one with its first line and its fields; order
      decides only between structs alike in both. A struct that is renamed
      or moved to another file is a new struct: its old entry becomes stale.
      Prints structs with no entry, entries whose line moved, entries whose
      struct is gone, and entries whose sites changed. Exits 1 when a struct
      has no entry. --write records it: a new struct becomes an entry with the
      state unreviewed, no destination and no confidence; lines are
      refreshed; an entry whose struct is gone becomes stale; the moves marked
      "by": "scan" are replaced by the ones found now, and a note typed on one
      is kept. Fields and rule are rewritten only while the entry is
      unreviewed, and the line of an entry a person judged follows that
      entry's own anchor. The scan never sets a destination, a confidence,
      a GPU claim or a concern, and never touches a move a person wrote. A
      second run changes nothing.
      --changed-since, --quiet, --ast-grep, --from, --today and the rule
      about where paths start are as in the allocation scan. --rules
      defaults to .dandori/rules/structs.
  tracker scan --structs --init-rules [--rules <dir>]
      Write the built-in struct rule files. A file already there is kept.

  tracker ingest <file|-> [--today <YYYY-MM-DD>] [--site <dir>] [--json]
      Take in allocation counts printed by counting tests: one JSON object
      per line, { "test", "scope", "allocs", "bytes", "frames", "instrument",
      "commit" }; test, scope and allocs are required. A record starts its
      line with {. A line that starts with { and is not a whole record is
      an error; every other line is skipped.
      Records go to <site>/ledgers/allocation-counts.json, one per
      test and scope, the latest wins, dated today (or --today). An entry
      names a scope with its "measure" field. A count is for a scope, not
      a line. A reviewed per-frame entry on the global allocator whose
      scope counted allocations in a frame loop is raised to red; nothing
      is ever lowered or set green. Exits 1 when the input holds no record
      or a broken one.

  bench check [--stamp <id> [--compiler <text>] [--workload <text>]
              [--machine <text>]] [--max-age-days <n>] [--write]
              [--site <dir>] [--json]
      Hash each benchmark's inputs and report it fresh, stale, unfair or
      deprecated. --stamp records the digest and today's date as `ran` after
      a real run; --write saves the states. --max-age-days <n> makes a
      benchmark whose `ran` is more than n days old stale, with the reason
      "not run for N days". `unfair` and `deprecated` set by hand in the
      ledger are kept as written. --today <YYYY-MM-DD> replaces the
      clock. Exits 1 when any benchmark is stale.
      A benchmark can record three signatures: "compiler", "machine" and
      "workload", short texts that say what its number came from. --stamp
      records the machine as the system reports it (logical cores and total
      memory, not the processor's name) or as --machine states it, and the
      compiler and workload from --compiler and --workload. Without their
      option the compiler and the workload keep what the ledger says; the
      machine is read from the system again unless --machine is given.
      Spaces at the ends of a signature are dropped. Two benchmarks of one
      parity entry are compared on each signature both record. When one
      differs, both are unfair and the line names the signature, the other
      benchmark and the two values; the check works this out again on every
      run. A benchmark with no signature is listed as unsigned. That is a
      notice and does not fail.

  gloss link <file> [--all] [--out <file>] [--site <dir>]
      Link the first mention of each glossary term or alias in a Markdown file
      to its page, with the brief as the link title. --all links every
      mention. Prints to stdout unless --out is given. Headings, code, links,
      HTML and frontmatter are left alone.

  gloss add <term> --brief <text> [--page <url>] [--alias <a>]... [--tag <t>]... [--site <dir>]
      Insert a term into <site>/ledgers/glossary.json in alphabetical order.
      Exits 1 when the term or an alias is already in the glossary.

  delta <folder> --reader <name> [--mark] [--max-lines <n>] [--json] [--hook <Event>]
      What changed under a folder since this reader last looked: commits,
      lines added and removed per file, and the changed lines, including
      uncommitted work. A reader who never looked gets file sizes only, at
      most --max-lines of them and a count of the rest.
      --mark records the current commit (inside the git directory).
      --hook prints the JSON a Claude Code or Codex hook injects, and
      nothing at all when there is nothing new.
      A folder named send, ack, pending or inbox is written ./send and so on.

  delta send --from <name> --to <parent> (--text <text> | --file <path>)
             [--store <dir>] [--today <YYYY-MM-DD>]
      Record a delta you are passing to the agent that spawned you, and
      print its id. Put the id and the text in your report to that agent.
      The text is stored as one line: line breaks and runs of spaces become
      one space. While the parent has not acknowledged a delta, the same
      text for the same parent adds nothing, and the call says so. Once the
      parent has acknowledged it, the same text is recorded as a new delta
      with a new id, because the same words after a later change are a
      later report.
  delta ack --to <name> <id>... [--store <dir>] [--today <YYYY-MM-DD>]
      As the parent, write a receipt for each delta you have taken in. An id
      that nobody sent to <name> is an error that names it (exit 2), and
      then no receipt is written for any of the ids.
  delta pending --from <name> [--to <parent>] [--store <dir>] [--json]
      As the sender, list what you recorded that has no receipt yet.
  delta inbox --to <name> [--from <child>] [--store <dir>] [--json]
      As the parent, list what is waiting for you from all your children.
  What delta send, ack, pending and inbox share:
      --from is always the sender and --to always its parent. A name is
      letters, digits, `-`, `_` and `.`. Capitals are read as small
      letters, so Boss and boss are one agent. Give each agent its own
      name: two agents writing under one name can lose a line.
      Each sender has one file, outbox-<name>.txt, and each parent one
      file, receipts-<name>.txt: UTF-8 plain text, one line per delta, tab
      separated, that a person can read. A file that is not UTF-8 is
      passed over with a warning that names it, and the others still
      answer. The files live in dandori/outbox inside the git directory
      every worktree of the repository shares, so a child in one worktree
      and its parent in another see the same files and nothing is
      committed or merged. --store <dir> puts them elsewhere. A relative
      <dir> starts at the folder you run in, so give the full path when
      parent and child run in different folders.
      The four answer from those files alone, so they still work after a
      compaction. A new line is written to a copy that then takes the
      place of the file, so a crash part way leaves the old file whole.
      They do not move the --reader cursor, and --mark writes no receipt:
      the cursor is what git says changed under a folder since you looked,
      the outbox is what a child told its parent about it and whether the
      parent has it. --today <YYYY-MM-DD> replaces the clock.

  sprint new <nn-name> [--site <dir>] [--json]
      Create the ledger <site>/ledgers/sprints/<nn-name>.json and its pages.
  sprint render [<nn-name>] [--site <dir>] [--json] [--archive-after-days <n>] [--today YYYY-MM-DD]
      Write the page for people and the page for agents from the ledger, and
      refresh public/llms/index.md. With no name, every sprint. A sprint
      whose tracks are all merged and whose request is more than
      --archive-after-days (default 14, 0 = never) before today goes under
      Archived in the index and is hidden from the sidebar. --today
      replaces the clock.
  sprint lint [<nn-name>] [--site <dir>] [--json]
      Fail (exit 1) on estimates and dates, merges without permission, tracks
      without criteria or reviewer, and shared paths in a wave.
      <site> is docs/site unless --site says otherwise. Exits 2, not 0, when
      there is no site or no sprint ledger to read.

  pool plan [--per-build-mb <n>] [--reserve-mb <n>] [--free-mb <n>] [--cores <n>] [--json]
      How many heavy builds may run at once and how many jobs each may use,
      with the arithmetic. Reads free memory and cores from the operating
      system when the flags are absent and says which figures were read.
  pool list [--base <branch>] [--json]
      One row per git worktree: merged or not, clean or not, and whether it
      looks safe to remove. Removes nothing.

  dex add <folder> [--name <n>]
      Register a project folder with Dandori-Dex, the index of all your
      projects. The name defaults to the folder's, made safe for a URL. The
      registry is $DANDORI_DEX_HOME/dex.json, else ~/.dandori/dex.json.
  dex remove <name>
  dex list
      Take a project out of the registry (its folder is not touched), or
      print every project with its folder.
  dex build [--out <dir>]
      Write a static hub to <dir> (default ~/.dandori/dex/site): index.html
      with one row per project (last commit date, sprint summary), and
      <name>/index.html with the project's table of contents from its built
      docs/site/dist, its report pages and HTML artifacts, and HANDOFF.md
      and README.md as text. The built site is copied to <name>/site with
      relative links, so the folder works from disk or any static host.
      A missing piece shows as a dash and a warning; nothing is run.

Only the commands whose line above shows --site read a site; only those that
show --json print JSON with it. Exit codes: 0 on success, 1 when a check
finds a problem, 2 when the command line or the site is wrong.

```

Which of these exist today is on the newest page under Sprints in the sidebar. The site lives in `docs/site`; see [Live page](/tools/live-page/) for how to open it.
