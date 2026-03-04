export type ParsedCaip10 = {
  readonly namespace: string;
  readonly chainRef: string;
  readonly address: string;
};

export type SupportedNamespace = "eip155" | "solana";

export function parseCaip10(caip10: string): ParsedCaip10 {
  const parts = caip10.split(":");
  const namespace = parts[0];
  const chainRef = parts[1];
  if (!namespace || !chainRef || parts.length < 3) {
    throw new Error(`Invalid CAIP-10 address: ${caip10}`);
  }
  return { namespace, chainRef, address: parts.slice(2).join(":") };
}

export const toCaip2 = ({ namespace, chainRef }: ParsedCaip10): string =>
  `${namespace}:${chainRef}`;

export const isSupportedNamespace = (ns: string): ns is SupportedNamespace =>
  ns === "eip155" || ns === "solana";

export const namespaceToChainType = (namespace: string): "evm" | "svm" =>
  namespace === "solana" ? "svm" : "evm";
