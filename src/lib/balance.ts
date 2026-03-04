import { Connection, PublicKey } from "@solana/web3.js";
import { err, ok, type Result } from "neverthrow";
import { createPublicClient, defineChain, erc20Abi, formatUnits, http } from "viem";
import type { ChainMeta } from "~/lib/chains.js";
import { getChainMeta } from "~/lib/chains.js";
import { DEFAULT_SVM_RPC } from "~/lib/svm.js";

export type SimpleBalanceResult = {
  readonly balance_atomic: string;
  readonly balance_formatted: string;
  readonly symbol: string;
  readonly decimals: number;
};

export type BalanceInfo = {
  address: string;
  balance: bigint;
  balanceFormatted: string;
  symbol: string;
  sufficient: boolean;
  requiredFormatted: string;
};

export type BalanceError = "no_rpc" | "fetch_failed";

const MIN_SVM_LAMPORTS = 5_000n;
const LAMPORTS_PER_SOL = 1_000_000_000n;

export async function checkEvmBalance(
  address: string,
  chainId: number,
  gasLimit: number,
  rpcUrl?: string,
): Promise<Result<BalanceInfo, BalanceError>> {
  const caip2 = `eip155:${chainId}`;
  const meta = getChainMeta(caip2);
  const rpc = rpcUrl ?? meta?.defaultRpc;
  if (!rpc) return err("no_rpc");

  try {
    const chain = defineChain({
      id: chainId,
      name: meta?.name ?? caip2,
      nativeCurrency: {
        name: meta?.name ?? "Ether",
        symbol: meta?.symbol ?? "ETH",
        decimals: meta?.decimals ?? 18,
      },
      rpcUrls: { default: { http: [rpc] } },
    });

    const client = createPublicClient({ chain, transport: http(rpc) });
    const [balance, gasPrice] = await Promise.all([
      client.getBalance({ address: address as `0x${string}` }),
      client.getGasPrice(),
    ]);

    const required = gasPrice * BigInt(gasLimit);
    const decimals = meta?.decimals ?? 18;
    const symbol = meta?.symbol ?? "ETH";

    return ok({
      address,
      balance,
      balanceFormatted: formatUnits(balance, decimals),
      symbol,
      sufficient: balance >= required,
      requiredFormatted: `~${formatUnits(required, decimals)}`,
    });
  } catch {
    return err("fetch_failed");
  }
}

export async function checkSvmBalance(
  address: string,
  rpcUrl?: string,
): Promise<Result<BalanceInfo, BalanceError>> {
  const rpc = rpcUrl ?? DEFAULT_SVM_RPC;
  try {
    const connection = new Connection(rpc, "confirmed");
    const balance = BigInt(await connection.getBalance(new PublicKey(address)));
    const format = (n: bigint) => `${Number(n) / Number(LAMPORTS_PER_SOL)} SOL`;

    return ok({
      address,
      balance,
      balanceFormatted: format(balance),
      symbol: "SOL",
      sufficient: balance >= MIN_SVM_LAMPORTS,
      requiredFormatted: format(MIN_SVM_LAMPORTS),
    });
  } catch {
    return err("fetch_failed");
  }
}

const createViemChain = (chainId: number, meta: ChainMeta, rpcUrl: string) =>
  defineChain({
    id: chainId,
    name: meta.name,
    nativeCurrency: { name: meta.name, symbol: meta.symbol, decimals: meta.decimals },
    rpcUrls: { default: { http: [rpcUrl] } },
  });

export const getEvmNativeBalance = async (
  chainId: number,
  address: `0x${string}`,
  rpcUrl: string,
  meta: ChainMeta,
): Promise<SimpleBalanceResult> => {
  const chain = createViemChain(chainId, meta, rpcUrl);
  const client = createPublicClient({ chain, transport: http(rpcUrl) });
  const balance = await client.getBalance({ address });

  return {
    balance_atomic: balance.toString(),
    balance_formatted: formatUnits(balance, meta.decimals),
    symbol: meta.symbol,
    decimals: meta.decimals,
  };
};

export const getSvmNativeBalance = async (
  address: string,
  rpcUrl: string,
): Promise<SimpleBalanceResult> => {
  const connection = new Connection(rpcUrl, "confirmed");
  const pubkey = new PublicKey(address);
  const balance = await connection.getBalance(pubkey);

  return {
    balance_atomic: balance.toString(),
    balance_formatted: (balance / 1e9).toFixed(9),
    symbol: "SOL",
    decimals: 9,
  };
};

export const getEvmTokenBalance = async (
  chainId: number,
  tokenAddress: `0x${string}`,
  walletAddress: `0x${string}`,
  rpcUrl: string,
  meta: ChainMeta,
): Promise<SimpleBalanceResult> => {
  const chain = createViemChain(chainId, meta, rpcUrl);
  const client = createPublicClient({ chain, transport: http(rpcUrl) });

  const [balance, decimals, symbol] = await Promise.all([
    client.readContract({
      address: tokenAddress,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [walletAddress],
    }),
    client.readContract({ address: tokenAddress, abi: erc20Abi, functionName: "decimals" }),
    client.readContract({ address: tokenAddress, abi: erc20Abi, functionName: "symbol" }),
  ]);

  return {
    balance_atomic: balance.toString(),
    balance_formatted: formatUnits(balance, decimals),
    symbol,
    decimals,
  };
};

export const getSplTokenBalance = async (
  mintAddress: string,
  walletAddress: string,
  rpcUrl: string,
): Promise<SimpleBalanceResult> => {
  const connection = new Connection(rpcUrl, "confirmed");
  const wallet = new PublicKey(walletAddress);
  const mint = new PublicKey(mintAddress);

  const tokenAccounts = await connection.getParsedTokenAccountsByOwner(wallet, { mint });
  const firstAccount = tokenAccounts.value[0];

  if (!firstAccount) {
    return { balance_atomic: "0", balance_formatted: "0", symbol: "SPL", decimals: 0 };
  }

  const accountInfo = firstAccount.account.data.parsed.info;
  const balance = accountInfo.tokenAmount.amount;
  const decimals = accountInfo.tokenAmount.decimals;

  return {
    balance_atomic: balance,
    balance_formatted: (Number(balance) / 10 ** decimals).toString(),
    symbol: "SPL",
    decimals,
  };
};

export const resolveRpcUrl = (
  namespace: string,
  rpcOverride?: string,
  defaultRpc?: string,
): string => {
  if (rpcOverride) return rpcOverride;
  if (namespace === "solana") return defaultRpc ?? DEFAULT_SVM_RPC;
  if (!defaultRpc) throw new Error("No RPC URL available. Pass rpc_url explicitly.");
  return defaultRpc;
};

export const fetchNativeBalance = async (
  namespace: string,
  chainRef: string,
  address: string,
  meta: ChainMeta,
  rpcOverride?: string,
): Promise<SimpleBalanceResult> => {
  const rpcUrl = resolveRpcUrl(namespace, rpcOverride, meta.defaultRpc);
  return namespace === "solana"
    ? getSvmNativeBalance(address, rpcUrl)
    : getEvmNativeBalance(Number(chainRef), address as `0x${string}`, rpcUrl, meta);
};

export const fetchTokenBalance = async (
  namespace: string,
  chainRef: string,
  tokenAddress: string,
  walletAddress: string,
  meta: ChainMeta,
  rpcOverride?: string,
): Promise<SimpleBalanceResult> => {
  const rpcUrl = resolveRpcUrl(namespace, rpcOverride, meta.defaultRpc);
  return namespace === "solana"
    ? getSplTokenBalance(tokenAddress, walletAddress, rpcUrl)
    : getEvmTokenBalance(
        Number(chainRef),
        tokenAddress as `0x${string}`,
        walletAddress as `0x${string}`,
        rpcUrl,
        meta,
      );
};
