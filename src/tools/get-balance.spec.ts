import { describe, expect, test } from "bun:test";
import { createMockServer } from "../lib/test-helpers.js";
import { registerGetBalanceTool } from "./get-balance.js";

const setup = () => {
  const server = createMockServer();
  registerGetBalanceTool(server as any);
  return server.getRegisteredTool()!;
};

describe("printr_get_balance", () => {
  test("registers with correct name", () => {
    expect(setup().name).toBe("printr_get_balance");
  });

  const errorCases = [
    { name: "invalid CAIP-10", input: { account: "invalid" }, expect: "Invalid CAIP-10" },
    {
      name: "unsupported chain",
      input: { account: "eip155:999999:0x1234" },
      expect: "Unsupported",
    },
    { name: "unsupported namespace", input: { account: "cosmos:hub:addr" }, expect: "Unsupported" },
    { name: "missing chain ref", input: { account: "eip155:0x1234" }, expect: "Invalid CAIP-10" },
    { name: "empty string", input: { account: "" }, expect: "Invalid CAIP-10" },
  ];

  test.each(errorCases)("rejects $name", async ({ input, expect: msg }) => {
    const result = await setup().handler(input);
    expect((result as any)?.isError).toBe(true);
    expect((result as any)?.content?.[0]?.text).toContain(msg);
  });

  const validFormats = [
    "eip155:8453:0x742d35Cc6634C0532925a3b844Bc9e7595f5bEb1",
    "eip155:1:0x742d35Cc6634C0532925a3b844Bc9e7595f5bEb1",
    "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:7S3P4HxJpyyigGzodYwHtCxZyUQe9JiBMHyRWXArAaKv",
  ];

  test.each(validFormats)("parses valid CAIP-10: %s", async (account) => {
    const result = await setup().handler({ account });
    expect((result as any)?.content?.[0]?.text ?? "").not.toContain("Invalid CAIP-10");
  });
});
