import {
  Address,
  BASE_FEE,
  Contract,
  Networks,
  TransactionBuilder,
  nativeToScVal,
  rpc,
  scValToNative,
  xdr,
  type Transaction,
} from "@stellar/stellar-sdk";
import { Buffer } from "buffer";

export interface StellarClientOptions {
  rpcUrl: string;
  networkPassphrase?: string;
  baseFee?: string;
}

export interface WalletSigner {
  publicKey: string;
  signTransaction(
    xdr: string,
    opts: { networkPassphrase: string; address?: string },
  ): Promise<string>;
}

export interface SubmitResult<T = unknown> {
  hash: string;
  status: string;
  result?: T;
}

export class StellarClient {
  readonly server: rpc.Server;
  readonly networkPassphrase: string;
  readonly baseFee: string;

  constructor(opts: StellarClientOptions) {
    this.server = new rpc.Server(opts.rpcUrl, { allowHttp: opts.rpcUrl.startsWith("http://") });
    this.networkPassphrase = opts.networkPassphrase ?? Networks.TESTNET;
    this.baseFee = opts.baseFee ?? BASE_FEE;
  }

  async buildTransaction(sourcePublicKey: string, operation: xdr.Operation, timeout = 60): Promise<Transaction> {
    const account = await this.server.getAccount(sourcePublicKey);
    const tx = new TransactionBuilder(account, {
      fee: this.baseFee,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(operation)
      .setTimeout(timeout)
      .build();
    return this.server.prepareTransaction(tx);
  }

  async buildXdr(sourcePublicKey: string, operation: xdr.Operation): Promise<string> {
    const tx = await this.buildTransaction(sourcePublicKey, operation);
    return tx.toXDR();
  }

  async signAndSubmit<T = unknown>(wallet: WalletSigner, operation: xdr.Operation): Promise<SubmitResult<T>> {
    const tx = await this.buildTransaction(wallet.publicKey, operation);
    const signedXdr = await wallet.signTransaction(tx.toXDR(), {
      networkPassphrase: this.networkPassphrase,
      address: wallet.publicKey,
    });
    return this.submitSignedXdr<T>(signedXdr);
  }

  async submitSignedXdr<T = unknown>(signedXdr: string): Promise<SubmitResult<T>> {
    const tx = TransactionBuilder.fromXDR(signedXdr, this.networkPassphrase);
    const sent = await this.server.sendTransaction(tx);
    if (sent.status === "ERROR") {
      throw new Error(`transaction submission failed: ${JSON.stringify(sent)}`);
    }

    const hash = sent.hash;
    let response = await this.server.getTransaction(hash);
    while (response.status === "NOT_FOUND") {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      response = await this.server.getTransaction(hash);
    }

    if (response.status !== "SUCCESS") {
      throw new Error(`transaction ${hash} ended with status ${response.status}`);
    }

    return {
      hash,
      status: response.status,
      result: readReturnValue<T>(response),
    };
  }

  async simulate<T = unknown>(sourcePublicKey: string, operation: xdr.Operation): Promise<T> {
    const account = await this.server.getAccount(sourcePublicKey);
    const tx = new TransactionBuilder(account, {
      fee: this.baseFee,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(operation)
      .setTimeout(60)
      .build();
    const simulated = await this.server.simulateTransaction(tx);
    const result = (simulated as { result?: { retval?: xdr.ScVal }; error?: string }).result;
    if (!result?.retval) {
      throw new Error(`simulation failed: ${JSON.stringify(simulated)}`);
    }
    return scValToNative(result.retval) as T;
  }
}

export function scvAddress(address: string): xdr.ScVal {
  return new Address(address).toScVal();
}

export function scvBytes(bytes: Uint8Array): xdr.ScVal {
  return xdr.ScVal.scvBytes(Buffer.from(bytes));
}

export function scvU32(value: number): xdr.ScVal {
  return nativeToScVal(value, { type: "u32" });
}

export function scvU64(value: number | bigint): xdr.ScVal {
  return nativeToScVal(BigInt(value), { type: "u64" });
}

export function scvI64(value: number | bigint): xdr.ScVal {
  return nativeToScVal(BigInt(value), { type: "i64" });
}

export function scvI128(value: number | bigint): xdr.ScVal {
  return nativeToScVal(BigInt(value), { type: "i128" });
}

export function scvU128(value: number | bigint): xdr.ScVal {
  return nativeToScVal(BigInt(value), { type: "u128" });
}

export function contractCall(contractId: string, method: string, ...args: xdr.ScVal[]): xdr.Operation {
  return new Contract(contractId).call(method, ...args);
}

function readReturnValue<T>(response: unknown): T | undefined {
  const txResponse = response as { returnValue?: xdr.ScVal; resultMetaXdr?: string };
  if (txResponse.returnValue) {
    return scValToNative(txResponse.returnValue) as T;
  }
  return undefined;
}
