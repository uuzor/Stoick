# Toolchain

Pinned versions used to build Wraith. Source `env.sh` to put these on your `PATH`.

| Tool | Version | Install |
|------|---------|---------|
| `nargo` (Noir) | `1.0.0-beta.22` | `curl -L https://raw.githubusercontent.com/noir-lang/noirup/main/install \| bash && noirup` |
| `bb` (Barretenberg) | `5.0.0-nightly.20260522` | `bbup -nv 1.0.0-beta.22` (resolves the matching bb) |
| `stellar` (CLI) | `27.0.0` | `brew install stellar-cli` |
| `rustc` / `cargo` | `1.91.0` | `rustup`; add target `wasm32-unknown-unknown` |
| `node` | `20.19.2` | — |
| `pnpm` | `10.11.0` | `corepack enable` |

> `bb` and `nargo` versions MUST stay matched (bbup resolves bb from the Noir version via
> `bb-versions.json`). Mismatched versions produce proofs the on-chain verifier will reject.
> If the `rs-soroban-ultrahonk` verifier requires a different pin, this table is updated to match it
> (see SHARED.md).

## Paths

- `nargo`   → `~/.nargo/bin/nargo`
- `bb`      → `~/.bb/bb`
- `stellar` → `/opt/homebrew/bin/stellar`
