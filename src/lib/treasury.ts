import type { ChainType } from "~/lib/caip.js";
import { env } from "~/lib/env.js";
import { treasuryWallets } from "~/server/wallet-sessions.js";

/**
 * Get treasury private key - checks session wallet first, then env var fallback.
 */
export function getTreasuryKey(type: ChainType): string | undefined {
  const sessionTreasury = treasuryWallets.get(type);
  if (sessionTreasury) return sessionTreasury.privateKey;
  return type === "svm" ? env.SVM_WALLET_PRIVATE_KEY : env.EVM_WALLET_PRIVATE_KEY;
}

/**
 * Get error message for missing treasury wallet.
 */
export function getTreasuryErrorMsg(type: ChainType): string {
  const envVar = type === "svm" ? "SVM" : "EVM";
  return `Treasury wallet not configured. Use printr_set_treasury_wallet or set ${envVar}_WALLET_PRIVATE_KEY environment variable.`;
}

/**
 * Get treasury key or return error object.
 */
export function getTreasuryKeyOrError(type: ChainType): { error: string } | { key: string } {
  const key = getTreasuryKey(type);
  if (!key) return { error: getTreasuryErrorMsg(type) };
  return { key };
}
