import { bytesToFields, type FieldHex } from "./bytes";
import { assertClmmPublicInputBytes, type ClmmOperation } from "./clmm-public-inputs";

export type CircuitInput = string | number | bigint | boolean | CircuitInput[] | { [key: string]: CircuitInput };
export type CircuitInputMap = Record<string, CircuitInput>;

export interface CompiledCircuit {
  bytecode: string;
  abi: unknown;
  [key: string]: unknown;
}

export interface GeneratedClmmProof {
  proof: Uint8Array;
  publicInputs: Uint8Array;
  publicInputFields: FieldHex[];
}

export async function loadCircuit(url: string): Promise<CompiledCircuit> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`failed to fetch circuit ${url}: ${response.status} ${response.statusText}`);
  }
  return (await response.json()) as CompiledCircuit;
}

export class ClmmProver {
  private noir?: { execute(input: CircuitInputMap): Promise<{ witness: Uint8Array }> };
  private backend?: {
    generateProof(witness: Uint8Array, opts?: { keccak?: boolean }): Promise<{ proof: Uint8Array; publicInputs: string[] }>;
    verifyProof(proof: { proof: Uint8Array; publicInputs: string[] }, opts?: { keccak?: boolean }): Promise<boolean>;
    destroy(): Promise<void>;
  };

  constructor(
    private readonly circuit: CompiledCircuit,
    private readonly operation: ClmmOperation,
    private readonly opts: { keccak?: boolean; threads?: number } = {},
  ) {}

  private async init(): Promise<void> {
    if (this.noir && this.backend) return;
    const [{ Noir }, { UltraHonkBackend }] = await Promise.all([
      import("@noir-lang/noir_js"),
      import("@aztec/bb.js"),
    ]);
    this.noir = new Noir(this.circuit as never) as never;
    const backendOpts = this.opts.threads === undefined ? undefined : { threads: this.opts.threads };
    this.backend = new UltraHonkBackend(this.circuit.bytecode, backendOpts) as never;
  }

  async prove(inputs: CircuitInputMap): Promise<GeneratedClmmProof> {
    await this.init();
    const { witness } = await this.noir!.execute(inputs);
    const { proof, publicInputs } = await this.backend!.generateProof(witness, { keccak: this.opts.keccak ?? true });
    const publicInputFields = publicInputs.map((value) => value as FieldHex);
    const publicInputBytes = new Uint8Array(publicInputFields.flatMap((field) => Array.from(hexFieldToBytes(field))));
    assertClmmPublicInputBytes(this.operation, publicInputBytes);
    return { proof, publicInputs: publicInputBytes, publicInputFields };
  }

  async verify(generated: GeneratedClmmProof): Promise<boolean> {
    await this.init();
    return this.backend!.verifyProof(
      { proof: generated.proof, publicInputs: bytesToFields(generated.publicInputs) },
      { keccak: this.opts.keccak ?? true },
    );
  }

  async destroy(): Promise<void> {
    await this.backend?.destroy();
  }
}

function hexFieldToBytes(field: FieldHex): Uint8Array {
  const hex = field.startsWith("0x") ? field.slice(2) : field;
  const padded = hex.padStart(64, "0");
  const out = new Uint8Array(32);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(padded.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}
