---
title: Build setup
description: Toolchain, caching and linking choices for this project.
---

## Toolchain

| Tool | Used for |
|---|---|
| MoonBit (`moon`) | The simulation engine in `sim/`. |
| Visual Studio Build Tools (C++ workload) | MoonBit's native target on Windows needs the MSVC compiler and linker. |
| Electrobun 2.0.2 through npm | The desktop shell in `app/`. |
| Rust, Go, sccache | Installed for the shibapan and usagui forks and for future Rust crates. |

MoonBit's native build fails when the checkout path is very long, because the dependency cache nests deep. The engine has no dependencies, so `sim/` builds in place.

## sccache

`.cargo/config.toml` sets `rustc-wrapper = "sccache"`, so every Rust build in the repository is cached. A check with a one-crate project: the first release build took 6.2 s and the second, from cache after deleting `target`, took 1.1 s.

## Linking

- **wild is not used.** It links Linux programs only; this project builds on Windows.
- **Rust:** release builds use thin LTO with 16 codegen units, set in `.cargo/config.toml`.
- **MoonBit:** the engine's executable is compiled with MSVC's `/GL` whole-program optimisation, so the linker runs link-time code generation. MoonBit's native backend passes its C output to `cl`, which has no thin LTO; that needs clang.

## Fixed in this setup

- `npm ci` fails on Linux for the docs site because its lockfile was made on Windows, so the workflow uses `npm install`.
- Pages needs a public repository on this account's plan, so the docs are published from `naruto-docs`.
