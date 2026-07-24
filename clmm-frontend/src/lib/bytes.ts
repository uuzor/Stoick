export const FIELD_BYTES = 32;
export const PROOF_BYTES = 456 * FIELD_BYTES;

export type Hex = `0x${string}`;
export type FieldHex = Hex;

export function stripHexPrefix(value: string): string {
  return value.startsWith("0x") ? value.slice(2) : value;
}

export function bytesToHex(bytes: Uint8Array): Hex {
  return `0x${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

export function hexToBytes(value: string): Uint8Array {
  const hex = stripHexPrefix(value);
  if (hex.length % 2 !== 0) {
    throw new Error(`hex string has odd length: ${hex.length}`);
  }
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export function normalizeField(value: string | bigint | number): FieldHex {
  const hex =
    typeof value === "bigint"
      ? value.toString(16)
      : typeof value === "number"
        ? BigInt(value).toString(16)
        : stripHexPrefix(value);
  if (hex.length > FIELD_BYTES * 2) {
    throw new Error(`field is wider than ${FIELD_BYTES} bytes`);
  }
  return `0x${hex.padStart(FIELD_BYTES * 2, "0")}`;
}

export function fieldToBytes(value: string | bigint | number): Uint8Array {
  return hexToBytes(normalizeField(value));
}

export function bytesToFields(bytes: Uint8Array): FieldHex[] {
  if (bytes.length % FIELD_BYTES !== 0) {
    throw new Error(`field bytes length ${bytes.length} is not divisible by ${FIELD_BYTES}`);
  }
  const fields: FieldHex[] = [];
  for (let i = 0; i < bytes.length; i += FIELD_BYTES) {
    fields.push(bytesToHex(bytes.slice(i, i + FIELD_BYTES)));
  }
  return fields;
}

export function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

export function encodePublicInputs(fields: readonly (string | bigint | number)[]): Uint8Array {
  return concatBytes(fields.map(fieldToBytes));
}

export function assertProofBytes(proof: Uint8Array): void {
  if (proof.length !== PROOF_BYTES) {
    throw new Error(`invalid UltraHonk proof length ${proof.length}; expected ${PROOF_BYTES}`);
  }
}
