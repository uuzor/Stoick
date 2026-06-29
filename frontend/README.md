# Wraith — Frontend

The React app for **Wraith**, a privacy platform on Stellar. Four modules —
**Bridge**, **Portfolio**, **Pay**, and **Swap** — over a shared shielded layer.

> **This app is wired to the LIVE WraithPool on Stellar Testnet.** By default
> `createWraithSdk()` returns the real `RealWraithSdk` (in `src/lib/real-sdk.ts`),
> backed by `@wraith/sdk` (Poseidon2 commitments, notes, Merkle tree, Soroban op
> building), `@stellar/stellar-sdk` (RPC submit) and Freighter (signing). Set
> `VITE_USE_MOCK=true` to fall back to the offline `MockWraithSdk` for UI dev with
> no wallet / network.

## Status: live vs experimental vs mock

| Flow | Status | What actually happens |
|------|--------|-----------------------|
| **Deposit** (Bridge) | **LIVE** | Generates a shielded note (random spending key + blinding, persisted in `localStorage`), computes the Poseidon2 commitment via `@wraith/sdk`, builds the `deposit(from, asset, amount, commitment)` invoke, prepares it on a Testnet Soroban RPC, signs with Freighter, submits, and waits for on-chain confirmation against pool `CA7G45QP…GXYSK`. Native **XLM only** (the testnet pool is single-asset). |
| **Portfolio** | **LIVE** | Real per-asset balances derived from your locally-stored unspent notes. Starts empty; populates after a confirmed deposit. |
| **Open orders** | **LIVE (empty)** | Read from local storage; empty until order placement ships. |
| **Withdraw** (Bridge) | **EXPERIMENTAL** | Off by default. With `VITE_ENABLE_WITHDRAW=true`, generates a **real** in-browser UltraHonk proof (Noir + Barretenberg WASM, keccak transcript) against the compiled `withdraw` circuit and submits `withdraw(...)`. Consumes one full note (no change); requires the local note tree to match the pool root. Heavy and not guaranteed to land in every browser — see caveats below. |
| **Pay** (transfer) | **MOCK / coming soon** | The live client returns a clear "coming soon" error; use `VITE_USE_MOCK=true` to demo the UI. |
| **Swap** (place / cancel order) | **MOCK / coming soon** | Same as Pay. |

### How a deposit works end-to-end

1. `RealWraithSdk.deposit({ asset: 'XLM', amount })` parses the amount to stroops
   (7 dp) and draws/loads the wallet's single `spending_key`.
2. `createNote({ assetId: 0, amount, spendingKey })` →
   `commitment = hash4(asset_id, amount, owner_key, blinding)` (SHARED §4).
3. `WraithContract.depositOp` builds the Soroban invoke; `prepareTransaction`
   simulates it (footprint + the source-account auth that covers the SAC transfer).
4. Freighter signs the prepared XDR; the tx is submitted via `rpc.Server` and polled
   to `SUCCESS`. The pool returns the new **leaf index**, which is stored with the note.
5. The note (secret material + leaf index) is saved to `localStorage` so Portfolio
   shows it and the experimental withdraw can rebuild its Merkle witness.

### Experimental withdraw caveats

- Enabled only with `VITE_ENABLE_WITHDRAW=true`. It loads `@noir-lang/noir_js` +
  `@aztec/bb.js` (WASM, may fetch a CRS) lazily — these are excluded from the default
  bundle (`vite.config.ts`), so they are runtime-resolved only on this path.
- The compiled circuit must be present at `public/circuits/withdraw.json`
  (regenerate with `nargo compile` in `circuits/noir/withdraw`).
- The local note tree is reconstructed from your stored notes and must equal the pool's
  current root (no foreign deposits interleaved) — otherwise the client refuses to
  prove rather than submit a stale proof. **Success is never faked.**

## Stack

- **Vite 5** + **React 18** + **TypeScript** (strict)
- **TailwindCSS 3** (dark "dark-pool / privacy" theme, single spectral accent)
- **react-router-dom 6** (hash routing: `/bridge`, `/portfolio`, `/pay`, `/swap`)
- **@stellar/freighter-api** for wallet connection

## Run

From the repo root (uses the pnpm workspace):

```bash
pnpm install
pnpm --filter frontend dev      # dev server on http://localhost:5173
pnpm --filter frontend build    # type-check + production build (zero type errors)
pnpm --filter frontend preview  # serve the production build
pnpm --filter frontend lint     # ESLint
```

`source ./env.sh` first if `pnpm` / `node` aren't on your PATH.

## What's here

| Area | File(s) | Notes |
|------|---------|-------|
| App shell / nav | `src/components/Layout.tsx`, `src/App.tsx` | Top bar (Wraith wordmark + Connect Wallet), tab nav, footer. |
| **Bridge** | `src/components/Bridge.tsx` | Deposit (asset, amount) and Withdraw (asset, amount, Stellar recipient) forms. |
| **Portfolio** | `src/components/Portfolio.tsx` | Per-asset shielded balance cards, total estimate, loading + empty states. |
| **Pay** | `src/components/Pay.tsx` | Recipient key, asset, amount → private transfer via the proof overlay. |
| **Swap** | `src/components/Swap.tsx` | Pair selector, Buy/Sell toggle, price + amount, Place Order; Open Orders list with Cancel. |
| Wallet | `src/hooks/useWallet.ts` | Freighter connect, active public key, Testnet check, graceful "Install Freighter" prompt. |
| Proof UX | `src/hooks/useProofFlow.ts`, `src/components/ProofProgress.tsx` | Reusable overlay cycling *Generating witness → Computing proof → Submitting transaction → Confirmed*. Wired into Pay and Swap. |
| **SDK seam** | `src/lib/wraith-sdk.ts` | `WraithSdk` interface, `MockWraithSdk`, and `createWraithSdk()` (live vs mock switch). **The only place protocol calls live.** |
| **Live client** | `src/lib/real-sdk.ts` | `RealWraithSdk` — deposit/withdraw/portfolio against the deployed pool. |
| Deployment config | `src/lib/config.ts` | Pool id, native SAC, RPC URL, network passphrase (from `deployments.json`), with `VITE_*` overrides. |
| Local wallet | `src/lib/note-store.ts` | `localStorage` persistence for the spending key + shielded notes. |
| SDK context | `src/hooks/useWraith.tsx` | Provides the SDK client + cached balances/orders, shared across tabs. |
| UI kit | `src/components/ui.tsx` | Typed Button, Card, Field, Select, Badge, icons, etc. |

## Configuration (env)

All optional; defaults target the live testnet deployment in `deployments.json`.

| Var | Default | Purpose |
|-----|---------|---------|
| `VITE_USE_MOCK` | `false` | Use the offline `MockWraithSdk` (no wallet/network). |
| `VITE_ENABLE_WITHDRAW` | `false` | Enable the experimental in-browser withdraw prover. |
| `VITE_SOROBAN_RPC_URL` | `https://soroban-testnet.stellar.org` | Soroban RPC endpoint. |
| `VITE_WRAITH_POOL` | `CA7G45QP…GXYSK` | WraithPool contract id. |
| `VITE_NATIVE_SAC` | `CDLZFC3S…GCYSC` | Native XLM SAC address. |
| `VITE_NETWORK_PASSPHRASE` | `Test SDF Network ; September 2015` | Stellar network passphrase. |
| `VITE_USDC_SAC` | _(unset)_ | Optional USDC SAC, if a multi-asset pool is deployed. |

## The SDK seam

All protocol access is behind one interface in `src/lib/wraith-sdk.ts`:

```ts
export interface WraithSdk {
  deposit(params: DepositParams): Promise<TxResult>
  withdraw(params: WithdrawParams): Promise<TxResult>
  transfer(params: TransferParams): Promise<TxResult>
  placeOrder(params: PlaceOrderParams): Promise<PlaceOrderResult>
  cancelOrder(orderId: string): Promise<TxResult>
  getShieldedBalances(): Promise<ShieldedBalance[]>
  getOpenOrders(): Promise<OpenOrder[]>
}
```

`createWraithSdk()` returns `RealWraithSdk` by default (live) or `MockWraithSdk`
when `VITE_USE_MOCK=true`. The UI is written against the interface only, so no
component or hook changes are needed to switch.

## What's left to wire

- **transfer / placeOrder / cancelOrder**: return clear "coming soon" errors in the
  live client. Wiring these needs the transfer / place_order / cancel_order circuits
  proven in-browser (same path as withdraw) plus the matcher for Swap fills.
- **Withdraw hardening**: reconstruct the Merkle tree from on-chain deposit events
  (not just local notes) so it works regardless of foreign deposits, and support
  partial withdraws (change output).
- **Proof overlay progress**: Pay/Swap still animate proof steps on timers; once those
  flows go live, drive the overlay from real prover progress.
- **USDC / multi-asset**: the testnet pool is single-asset (native XLM); set
  `VITE_USDC_SAC` once a multi-asset pool is deployed.
