#!/usr/bin/env bash
# Wraith toolchain environment.
# Source this before running nargo / bb / stellar:  `source ./env.sh`
export PATH="$HOME/.nargo/bin:$HOME/.bb:$HOME/.cargo/bin:/opt/homebrew/bin:$PATH"

# Pinned toolchain (see TOOLCHAIN.md):
#   nargo   1.0.0-beta.22
#   bb      5.0.0-nightly.20260522  (matched to nargo via bbup)
#   stellar 27.0.0
#   rustc   1.91.0  (wasm32-unknown-unknown)
