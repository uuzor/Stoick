import { assertClmmPublicInputBytes, type ClmmOperation } from "./clmm-public-inputs";
import { assertProofBytes } from "./bytes";

export interface ProofArtifacts {
  proof: Uint8Array;
  publicInputs: Uint8Array;
  verificationKey?: Uint8Array;
}

async function fetchBytes(url: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

export async function loadProofArtifacts(
  operation: ClmmOperation,
  baseUrl: string,
  opts: { includeVerificationKey?: boolean } = {},
): Promise<ProofArtifacts> {
  const cleanBase = baseUrl.replace(/\/$/, "");
  const [proof, publicInputs, verificationKey] = await Promise.all([
    fetchBytes(`${cleanBase}/proof`),
    fetchBytes(`${cleanBase}/public_inputs`),
    opts.includeVerificationKey ? fetchBytes(`${cleanBase}/vk`) : Promise.resolve(undefined),
  ]);

  assertProofBytes(proof);
  assertClmmPublicInputBytes(operation, publicInputs);

  return { proof, publicInputs, verificationKey };
}
