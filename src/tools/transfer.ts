import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { isSupportedNamespace, namespaceToChainType, parseCaip10, toCaip2 } from "~/lib/caip.js";
import { CHAIN_META, getChainMeta } from "~/lib/chains.js";
import { toolError, toolOk } from "~/lib/client.js";
import { executeTransfer } from "~/lib/transfer.js";
import { activeWallets } from "~/server/wallet-sessions.js";

const getPrivateKey = (namespace: string, providedKey?: string): string | null => {
  if (providedKey) return providedKey;
  return activeWallets.get(namespaceToChainType(namespace))?.privateKey ?? null;
};

const inputSchema = z.object({
  to: z
    .string()
    .describe("CAIP-10 recipient address (e.g. 'eip155:8453:0x...' or 'solana:5eykt...:pubkey')"),
  amount: z
    .string()
    .describe("Amount to send in human-readable units (e.g. '0.1' for 0.1 ETH or SOL)"),
  private_key: z
    .string()
    .optional()
    .describe(
      "Private key to sign the transaction. EVM: hex (with or without 0x). SVM: base58 keypair. " +
        "If omitted, uses the active wallet from printr_wallet_unlock.",
    ),
  rpc_url: z.string().url().optional().describe("Optional RPC endpoint override"),
});

const outputSchema = z.object({
  to: z.string().describe("Recipient CAIP-10 address"),
  chain: z.string().describe("CAIP-2 chain ID"),
  chain_name: z.string().describe("Human-readable chain name"),
  amount: z.string().describe("Amount sent in human-readable units"),
  amount_atomic: z.string().describe("Amount sent in atomic units"),
  symbol: z.string().describe("Native token symbol"),
  tx_hash: z.string().optional().describe("EVM transaction hash"),
  signature: z.string().optional().describe("Solana transaction signature"),
});

export function registerTransferTool(server: McpServer): void {
  server.registerTool(
    "printr_transfer",
    {
      description:
        "Transfer native tokens (ETH, SOL, BNB, etc.) to another address. " +
        "Uses the active wallet from printr_wallet_unlock if no private_key is provided.",
      inputSchema,
      outputSchema,
    },
    async ({ to, amount, private_key, rpc_url }) => {
      try {
        const parsed = parseCaip10(to);
        const caip2 = toCaip2(parsed);
        const meta = getChainMeta(caip2);

        if (!meta) {
          return toolError(
            `Unsupported chain: ${caip2}. Supported: ${Object.keys(CHAIN_META).join(", ")}`,
          );
        }

        if (!isSupportedNamespace(parsed.namespace)) {
          return toolError(`Unsupported namespace: ${parsed.namespace}. Supported: eip155, solana`);
        }

        const key = getPrivateKey(parsed.namespace, private_key);
        if (!key) {
          const chainType = namespaceToChainType(parsed.namespace).toUpperCase();
          return toolError(
            `No private key provided and no active ${chainType} wallet. ` +
              "Use printr_wallet_unlock first or provide private_key.",
          );
        }

        const result = await executeTransfer(
          parsed.namespace,
          parsed.chainRef,
          parsed.address,
          amount,
          key,
          meta,
          rpc_url,
        );

        return toolOk({
          to,
          chain: caip2,
          chain_name: meta.name,
          amount,
          symbol: meta.symbol,
          amount_atomic: result.amount_atomic,
          ...(result.type === "svm"
            ? { signature: result.signature }
            : { tx_hash: result.tx_hash }),
        });
      } catch (error) {
        return toolError(error instanceof Error ? error.message : String(error));
      }
    },
  );
}
