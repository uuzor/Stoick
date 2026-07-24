import { FIELD_BYTES, encodePublicInputs, type FieldHex } from "./bytes";

export type ClmmOperation = "mint" | "swap" | "collect" | "burn";

export const CLMM_PUBLIC_INPUT_ORDER = {
  mint: [
    "merkle_root",
    "position_nullifier",
    "old_position_commitment",
    "new_position_commitment",
    "pool_state_old",
    "pool_state_new",
    "input_note_nullifier",
  ],
  swap: ["merkle_root", "input_nullifier", "output_commitment", "pool_state_old", "pool_state_new"],
  collect: [
    "merkle_root",
    "position_nullifier",
    "old_position_commitment",
    "new_position_commitment",
    "pool_state_old",
    "output_commitment_0",
    "output_commitment_1",
  ],
  burn: [
    "merkle_root",
    "position_nullifier",
    "old_position_commitment",
    "new_position_commitment",
    "pool_state_old",
    "pool_state_new",
    "output_commitment_0",
    "output_commitment_1",
  ],
} as const;

export type MintPublicInputs = Record<(typeof CLMM_PUBLIC_INPUT_ORDER.mint)[number], FieldHex>;
export type SwapPublicInputs = Record<(typeof CLMM_PUBLIC_INPUT_ORDER.swap)[number], FieldHex>;
export type CollectPublicInputs = Record<(typeof CLMM_PUBLIC_INPUT_ORDER.collect)[number], FieldHex>;
export type BurnPublicInputs = Record<(typeof CLMM_PUBLIC_INPUT_ORDER.burn)[number], FieldHex>;

export type ClmmPublicInputMap = {
  mint: MintPublicInputs;
  swap: SwapPublicInputs;
  collect: CollectPublicInputs;
  burn: BurnPublicInputs;
};

export const CLMM_PUBLIC_INPUT_BYTES: Record<ClmmOperation, number> = {
  mint: CLMM_PUBLIC_INPUT_ORDER.mint.length * FIELD_BYTES,
  swap: CLMM_PUBLIC_INPUT_ORDER.swap.length * FIELD_BYTES,
  collect: CLMM_PUBLIC_INPUT_ORDER.collect.length * FIELD_BYTES,
  burn: CLMM_PUBLIC_INPUT_ORDER.burn.length * FIELD_BYTES,
};

export function encodeClmmPublicInputs<T extends ClmmOperation>(
  operation: T,
  inputs: ClmmPublicInputMap[T],
): Uint8Array {
  const order = CLMM_PUBLIC_INPUT_ORDER[operation] as readonly (keyof ClmmPublicInputMap[T])[];
  const fields = order.map((key) => inputs[key] as FieldHex);
  return encodePublicInputs(fields);
}

export function assertClmmPublicInputBytes(operation: ClmmOperation, publicInputs: Uint8Array): void {
  const expected = CLMM_PUBLIC_INPUT_BYTES[operation];
  if (publicInputs.length !== expected) {
    throw new Error(`invalid ${operation} public input length ${publicInputs.length}; expected ${expected}`);
  }
}
