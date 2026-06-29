# Wraith — Frontend

The React app shell for **Wraith**, a privacy platform on Stellar. Four modules —
**Bridge**, **Portfolio**, **Pay**, and **Swap** — over a shared shielded layer.

> **This is a UI shell running on a MOCK SDK.** No real cryptography, proofs, or
> Stellar transactions happen yet. Every protocol call is intercepted by an
> in-memory mock that returns fake data with simulated delays. The mock is
> isolated behind a single TypeScript interface so going live is a one-file swap.

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
| **SDK seam** | `src/lib/wraith-sdk.ts` | `WraithSdk` interface + `MockWraithSdk`. **The only place protocol calls live.** |
| SDK context | `src/hooks/useWraith.tsx` | Provides the SDK client + cached balances/orders, shared across tabs. |
| UI kit | `src/components/ui.tsx` | Typed Button, Card, Field, Select, Badge, icons, etc. |

## The SDK seam (how to go live)

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

These method names match the real `@wraith/sdk`. To switch from mock to real,
change the body of `createWraithSdk()` to return the real client — no component
or hook changes required.

## What's left to wire

- Replace `MockWraithSdk` with the real `@wraith/sdk` (notes, Poseidon2
  commitments, Merkle proofs, in-browser UltraHonk proving via `@aztec/bb.js`).
- Drive the proof overlay from real proof-generation progress instead of timers.
- Use the connected Freighter key to sign and submit Soroban transactions; gate
  actions on a Testnet connection.
- Real portfolio data from on-chain `Deposit` events + local note storage.
- Order book / matcher integration for Swap (currently mock open orders).
