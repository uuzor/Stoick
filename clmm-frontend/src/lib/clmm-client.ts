import { xdr } from "@stellar/stellar-sdk";
import {
  TESTNET_DEPLOYMENT,
  type ClmmDeployment,
} from "./deployments";
import {
  contractCall,
  scvAddress,
  scvBytes,
  scvI64,
  scvI128,
  scvU32,
  scvU64,
  scvU128,
  StellarClient,
  type SubmitResult,
  type WalletSigner,
} from "./stellar";
import { assertProofBytes } from "./bytes";
import { assertClmmPublicInputBytes, type ClmmOperation } from "./clmm-public-inputs";

export interface PoolState {
  pool_id: number;
  asset_0: string;
  asset_1: string;
  sqrt_price: bigint;
  liquidity: bigint;
  current_tick: bigint;
  fee_growth_global_0: bigint;
  fee_growth_global_1: bigint;
  protocol_fee_0: bigint;
  protocol_fee_1: bigint;
  fee: number;
  tick_spacing: number;
  sequence: bigint;
}

export interface PositionState {
  pool_id: number;
  owner: string;
  tick_lower: bigint;
  tick_upper: bigint;
  liquidity: bigint;
  fee_growth_inside_0: bigint;
  fee_growth_inside_1: bigint;
  tokens_owed_0: bigint;
  tokens_owed_1: bigint;
  nonce: number;
}

export interface ShieldedCallArgs {
  proof: Uint8Array;
  publicInputs: Uint8Array;
  poolId: number;
}

export class ClmmClient {
  readonly stellar: StellarClient;
  readonly deployment: ClmmDeployment;

  constructor(deployment: ClmmDeployment = TESTNET_DEPLOYMENT) {
    this.deployment = deployment;
    this.stellar = new StellarClient({
      rpcUrl: deployment.rpcUrl,
      networkPassphrase: deployment.networkPassphrase,
    });
  }

  createPoolOp(args: {
    asset0: string;
    asset1: string;
    fee: number;
    tickSpacing: number;
    initialSqrtPrice: bigint;
    admin: string;
  }): xdr.Operation {
    return contractCall(
      this.deployment.contracts.clmm,
      "create_pool",
      scvAddress(args.asset0),
      scvAddress(args.asset1),
      scvU32(args.fee),
      scvU32(args.tickSpacing),
      scvU128(args.initialSqrtPrice),
      scvAddress(args.admin),
    );
  }

  mintOp(args: ShieldedCallArgs): xdr.Operation {
    return this.shieldedOp("mint", args);
  }

  swapOp(args: ShieldedCallArgs): xdr.Operation {
    return this.shieldedOp("swap", args);
  }

  collectOp(args: ShieldedCallArgs): xdr.Operation {
    return this.shieldedOp("collect", args);
  }

  burnOp(args: ShieldedCallArgs): xdr.Operation {
    return this.shieldedOp("burn", args);
  }

  mintPublicOp(args: {
    poolId: number;
    owner: string;
    tickLower: number | bigint;
    tickUpper: number | bigint;
    amount: number | bigint;
    minAmount0: number | bigint;
    minAmount1: number | bigint;
  }): xdr.Operation {
    return contractCall(
      this.deployment.contracts.clmm,
      "mint_public",
      scvU32(args.poolId),
      scvAddress(args.owner),
      scvI64(args.tickLower),
      scvI64(args.tickUpper),
      scvU128(args.amount),
      scvU64(args.minAmount0),
      scvU64(args.minAmount1),
    );
  }

  burnPublicOp(args: {
    poolId: number;
    owner: string;
    tickLower: number | bigint;
    tickUpper: number | bigint;
    amount: number | bigint;
    amount0: number | bigint;
    amount1: number | bigint;
  }): xdr.Operation {
    return contractCall(
      this.deployment.contracts.clmm,
      "burn_public",
      scvU32(args.poolId),
      scvAddress(args.owner),
      scvI64(args.tickLower),
      scvI64(args.tickUpper),
      scvU128(args.amount),
      scvU64(args.amount0),
      scvU64(args.amount1),
    );
  }

  claimProtocolFeesOp(args: { poolId: number; recipient: string }): xdr.Operation {
    return contractCall(
      this.deployment.contracts.clmm,
      "claim_protocol_fees",
      scvU32(args.poolId),
      scvAddress(args.recipient),
    );
  }

  depositPrivateOp(args: {
    asset: string;
    from: string;
    amount: number | bigint;
    commitment: Uint8Array;
  }): xdr.Operation {
    return contractCall(
      this.deployment.contracts.clmm,
      "deposit_private",
      scvAddress(args.asset),
      scvAddress(args.from),
      scvU64(args.amount),
      scvBytes(args.commitment),
    );
  }

  getPoolOp(poolId: number): xdr.Operation {
    return contractCall(this.deployment.contracts.clmm, "get_pool", scvU32(poolId));
  }

  getPoolSequenceOp(poolId: number): xdr.Operation {
    return contractCall(this.deployment.contracts.clmm, "get_pool_sequence", scvU32(poolId));
  }

  getNoteCommitmentOp(opId: number | bigint, index: number): xdr.Operation {
    return contractCall(this.deployment.contracts.clmm, "get_note_commitment", scvU64(opId), scvU32(index));
  }

  getMerkleTreeOp(): xdr.Operation {
    return contractCall(this.deployment.contracts.clmm, "get_merkle_tree");
  }

  getMerkleLeafCountOp(): xdr.Operation {
    return contractCall(this.deployment.contracts.merkleTree, "get_leaf_count");
  }

  getMerkleRootOp(): xdr.Operation {
    return contractCall(this.deployment.contracts.merkleTree, "get_root");
  }

  getMerkleLeafOp(index: number): xdr.Operation {
    return contractCall(this.deployment.contracts.merkleTree, "get_leaf", scvU32(index));
  }

  faucetMintOp(args: { asset: "asset0" | "asset1"; to: string; amount: number | bigint }): xdr.Operation {
    return contractCall(
      this.deployment.contracts.faucetTokens[args.asset],
      "mint",
      scvAddress(args.to),
      scvI128(args.amount),
    );
  }

  faucetBalanceOp(args: { asset: "asset0" | "asset1"; id: string }): xdr.Operation {
    return contractCall(
      this.deployment.contracts.faucetTokens[args.asset],
      "balance",
      scvAddress(args.id),
    );
  }

  async getPool(sourcePublicKey: string, poolId: number): Promise<PoolState | null> {
    return this.stellar.simulate<PoolState | null>(sourcePublicKey, this.getPoolOp(poolId));
  }

  async getPoolSequence(sourcePublicKey: string, poolId: number): Promise<bigint> {
    return this.stellar.simulate<bigint>(sourcePublicKey, this.getPoolSequenceOp(poolId));
  }

  async getNoteCommitment(sourcePublicKey: string, opId: number | bigint, index: number): Promise<Uint8Array | null> {
    return this.stellar.simulate<Uint8Array | null>(sourcePublicKey, this.getNoteCommitmentOp(opId, index));
  }

  async getMerkleLeafCount(sourcePublicKey: string): Promise<bigint> {
    return this.stellar.simulate<bigint>(sourcePublicKey, this.getMerkleLeafCountOp());
  }

  async getMerkleRoot(sourcePublicKey: string): Promise<Uint8Array> {
    return this.stellar.simulate<Uint8Array>(sourcePublicKey, this.getMerkleRootOp());
  }

  async getMerkleLeaf(sourcePublicKey: string, index: number): Promise<Uint8Array> {
    return this.stellar.simulate<Uint8Array>(sourcePublicKey, this.getMerkleLeafOp(index));
  }

  async getFaucetBalance(sourcePublicKey: string, asset: "asset0" | "asset1", id: string): Promise<bigint> {
    return this.stellar.simulate<bigint>(sourcePublicKey, this.faucetBalanceOp({ asset, id }));
  }

  async signAndSubmit<T = unknown>(wallet: WalletSigner, operation: xdr.Operation): Promise<SubmitResult<T>> {
    return this.stellar.signAndSubmit<T>(wallet, operation);
  }

  async buildXdr(sourcePublicKey: string, operation: xdr.Operation): Promise<string> {
    return this.stellar.buildXdr(sourcePublicKey, operation);
  }

  private shieldedOp(operation: ClmmOperation, args: ShieldedCallArgs): xdr.Operation {
    assertProofBytes(args.proof);
    assertClmmPublicInputBytes(operation, args.publicInputs);
    return contractCall(
      this.deployment.contracts.clmm,
      operation,
      scvBytes(args.proof),
      scvBytes(args.publicInputs),
      scvU32(args.poolId),
    );
  }
}
