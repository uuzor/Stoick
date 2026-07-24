import {
  type ISupportedWallet,
  FREIGHTER_ID,
  StellarWalletsKit,
  WalletNetwork,
  allowAllModules,
} from "@creit.tech/stellar-wallets-kit";
import { TESTNET_DEPLOYMENT } from "./deployments";
import type { WalletSigner } from "./stellar";

export const walletKit = new StellarWalletsKit({
  network: WalletNetwork.TESTNET,
  selectedWalletId: FREIGHTER_ID,
  modules: allowAllModules(),
});

export function createWalletKit(): StellarWalletsKit {
  return walletKit;
}

export async function connectWalletWithModal(kit: StellarWalletsKit = walletKit): Promise<WalletSigner> {
  return new Promise((resolve, reject) => {
    void kit
      .openModal({
        onWalletSelected: async (option: ISupportedWallet) => {
          try {
            kit.setWallet(option.id);
            resolve(await walletSignerFromKit(kit));
          } catch (error) {
            reject(error);
          }
        },
        onClosed: () => reject(new Error("Wallet connection cancelled.")),
      })
      .catch(reject);
  });
}

export async function walletSignerFromKit(kit: StellarWalletsKit): Promise<WalletSigner> {
  const { address } = await kit.getAddress();
  return {
    publicKey: address,
    async signTransaction(xdr, opts) {
      const signed = await kit.signTransaction(xdr, {
        address,
        networkPassphrase: opts.networkPassphrase ?? TESTNET_DEPLOYMENT.networkPassphrase,
      });
      return signed.signedTxXdr;
    },
  };
}
