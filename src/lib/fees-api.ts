/**
 * Printr Backend API client for fee claiming
 *
 * Uses gRPC-Web to communicate with the Printr backend for querying
 * and claiming creator fees.
 */

import { type Client, createClient } from "@connectrpc/connect";
import { createGrpcWebTransport } from "@connectrpc/connect-web";
import { env } from "./env.js";
import { Backend } from "./proto/api/api_connect.js";
import { Account } from "./proto/caip/account_pb.js";

const PRINTR_API_URL = env.PRINTR_BACKEND_URL ?? "https://api.printr.money";

export type { ChainProtocolFees } from "./proto/api/api_pb.js";
// Re-export proto types for consumers
export { Account } from "./proto/caip/account_pb.js";

// Simple types for API consumers
export type CaipAccount = {
  chainId: string;
  address: string;
};

export type AssetAmount = {
  asset?: CaipAccount;
  amountAtomic?: string;
  decimals: number;
  priceUsd: number;
  amountUsd: number;
};

export type PayloadEVM = {
  targetChain: string;
  calldata: string;
  txTo: string;
  txValue: string;
  gasLimit: string;
};

export type SolanaAccountMeta = {
  pubkey?: CaipAccount;
  isSigner: boolean;
  isWritable: boolean;
};

export type SolanaIx = {
  programId?: CaipAccount;
  accounts: SolanaAccountMeta[];
  dataBase64: string;
};

export type PayloadSolana = {
  ixs: SolanaIx[];
  lookupTable?: string;
  telecoinMintAddress?: CaipAccount;
};

export type Payload = {
  targetChain: string;
  payload:
    | { case: "evm"; value: PayloadEVM }
    | { case: "svm"; value: PayloadSolana }
    | { case: "svmRaw"; value: { calldata: string } }
    | { case: undefined; value?: undefined };
};

export type ChainProtocolFeesSimple = {
  chainId: string;
  dev?: CaipAccount;
  protocolFees?: AssetAmount;
  devFees?: AssetAmount;
  collectionPayload?: Payload;
  canCollect: boolean;
};

export type ProtocolFeesResponse = {
  telecoinId: string;
  perChain: Record<string, ChainProtocolFeesSimple>;
  totalProtocol?: AssetAmount;
  totalDev?: AssetAmount;
};

export type ProtocolFeesRequest = {
  telecoinId: string;
  chainIds?: string[];
  payers?: CaipAccount[];
};

// Singleton client
let backendClient: Client<typeof Backend> | null = null;

function getBackendClient(): Client<typeof Backend> {
  if (!backendClient) {
    const transport = createGrpcWebTransport({
      baseUrl: PRINTR_API_URL,
    });
    backendClient = createClient(Backend, transport);
  }
  return backendClient;
}

/**
 * Convert proto Account to CaipAccount
 */
function toSimpleAccount(account: Account | undefined): CaipAccount | undefined {
  if (!account) return undefined;
  return {
    chainId: account.chainId,
    address: account.address,
  };
}

/**
 * Convert proto AssetAmountV0 to simple AssetAmount
 */
// biome-ignore lint/suspicious/noExplicitAny: Proto types
function toSimpleAssetAmount(amount: any): AssetAmount | undefined {
  if (!amount) return undefined;
  return {
    asset: toSimpleAccount(amount.asset),
    amountAtomic: amount.amountAtomic?.base10,
    decimals: amount.decimals || 0,
    priceUsd: amount.priceUsd || 0,
    amountUsd: amount.amountUsd || 0,
  };
}

/**
 * Convert proto Payload to simple Payload
 */
// biome-ignore lint/suspicious/noExplicitAny: Proto types
function toSimplePayload(payload: any): Payload | undefined {
  if (!payload) return undefined;

  const targetChain = payload.targetChain || "";
  const p = payload.payload;

  if (p?.case === "evm" && p.value) {
    return {
      targetChain,
      payload: {
        case: "evm",
        value: {
          targetChain: p.value.targetChain || targetChain,
          calldata: p.value.calldata || "",
          txTo: p.value.txTo || "",
          txValue: p.value.txValue || "0",
          gasLimit: String(p.value.gasLimit || "0"),
        },
      },
    };
  }

  if (p?.case === "svm" && p.value) {
    return {
      targetChain,
      payload: {
        case: "svm",
        value: {
          ixs: (p.value.calldata || []).map(
            // biome-ignore lint/suspicious/noExplicitAny: Proto types
            (ix: any) => ({
              // wingman.SolanaIx uses Base58Pubkey which has a `value` field
              programId: ix.programId?.value
                ? {
                    chainId: targetChain,
                    address: ix.programId.value,
                  }
                : undefined,
              accounts: (ix.accounts || []).map(
                // biome-ignore lint/suspicious/noExplicitAny: Proto types
                (acc: any) => ({
                  // wingman.AccountMeta uses Base58Pubkey for pubkey
                  pubkey: acc.pubkey?.value
                    ? {
                        chainId: targetChain,
                        address: acc.pubkey.value,
                      }
                    : undefined,
                  isSigner: acc.isSigner || false,
                  isWritable: acc.isWritable || false,
                }),
              ),
              dataBase64: ix.dataBase64 || ix.data || "",
            }),
          ),
          lookupTable: p.value.lookupTable?.value,
          telecoinMintAddress: p.value.telecoinMintAddress
            ? {
                chainId: p.value.telecoinMintAddress.chainId || "",
                address: p.value.telecoinMintAddress.address || "",
              }
            : undefined,
        },
      },
    };
  }

  if (p?.case === "svmRaw" && p.value) {
    return {
      targetChain,
      payload: {
        case: "svmRaw",
        value: { calldata: p.value.calldata || "" },
      },
    };
  }

  return { targetChain, payload: { case: undefined, value: undefined } };
}

/**
 * Convert proto ChainProtocolFees to simple format
 */
function toSimpleChainFees(
  // biome-ignore lint/suspicious/noExplicitAny: Proto types
  fees: any,
): ChainProtocolFeesSimple {
  return {
    chainId: fees.chainId || "",
    dev: toSimpleAccount(fees.dev),
    protocolFees: toSimpleAssetAmount(fees.protocolFees),
    devFees: toSimpleAssetAmount(fees.devFees),
    collectionPayload: toSimplePayload(fees.collectionPayload),
    canCollect: fees.canCollect || false,
  };
}

/**
 * Call the ProtocolFees RPC endpoint to query claimable fees
 */
export async function getProtocolFees(request: ProtocolFeesRequest): Promise<ProtocolFeesResponse> {
  const client = getBackendClient();

  // Build the proto request
  const payers = (request.payers || []).map(
    (p) => new Account({ chainId: p.chainId, address: p.address }),
  );

  const response = await client.protocolFees({
    telecoinId: request.telecoinId,
    chainIds: request.chainIds || [],
    payers,
  });

  // Convert to simple response format
  const perChain: Record<string, ChainProtocolFeesSimple> = {};
  for (const [chainId, fees] of Object.entries(response.perChain)) {
    perChain[chainId] = toSimpleChainFees(fees);
  }

  return {
    telecoinId: response.telecoinId,
    perChain,
    totalProtocol: toSimpleAssetAmount(response.totalProtocol),
    totalDev: toSimpleAssetAmount(response.totalDev),
  };
}

/**
 * Parse CAIP-10 string into CaipAccount
 */
export function parseCaip10(caip10: string): CaipAccount {
  // Format: namespace:chainRef:address (e.g., eip155:8453:0x123...)
  const parts = caip10.split(":");
  if (parts.length < 3) {
    throw new Error(`Invalid CAIP-10: ${caip10}`);
  }
  const chainId = `${parts[0]}:${parts[1]}`;
  const address = parts.slice(2).join(":");
  return { chainId, address };
}

/**
 * Format CaipAccount as CAIP-10 string
 */
export function formatCaip10(account: CaipAccount): string {
  return `${account.chainId}:${account.address}`;
}
