import { describe, expect, test } from "bun:test";
import { createMockServer } from "../lib/test-helpers.js";
import { registerGetTokenBalanceTool } from "./get-token-balance.js";

const setup = () => {
  const server = createMockServer();
  registerGetTokenBalanceTool(server as any);
  return server.getRegisteredTool()!;
};

describe("printr_get_token_balance", () => {
  test("registers with correct name", () => {
    expect(setup().name).toBe("printr_get_token_balance");
  });

  const errorCases = [
    {
      name: "invalid token CAIP-10",
      input: { token: "invalid", wallet: "eip155:8453:0x1234" },
      expect: "Invalid CAIP-10",
    },
    {
      name: "chain mismatch",
      input: { token: "eip155:8453:0x1234", wallet: "eip155:1:0x5678" },
      expect: "same chain",
    },
    {
      name: "unsupported chain",
      input: { token: "eip155:999999:0x1234", wallet: "eip155:999999:0x5678" },
      expect: "Unsupported",
    },
    {
      name: "unsupported namespace",
      input: { token: "cosmos:hub:addr1", wallet: "cosmos:hub:addr2" },
      expect: "Unsupported",
    },
  ];

  test.each(errorCases)("rejects $name", async ({ input, expect: msg }) => {
    const result = await setup().handler(input);
    expect((result as any)?.isError).toBe(true);
    expect((result as any)?.content?.[0]?.text).toContain(msg);
  });
});
