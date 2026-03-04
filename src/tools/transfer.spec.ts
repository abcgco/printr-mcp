import { describe, expect, test } from "bun:test";
import { createMockServer } from "../lib/test-helpers.js";
import { registerTransferTool } from "./transfer.js";

const setup = () => {
  const server = createMockServer();
  registerTransferTool(server as any);
  return server.getRegisteredTool()!;
};

describe("printr_transfer", () => {
  test("registers with correct name", () => {
    expect(setup().name).toBe("printr_transfer");
  });

  const errorCases = [
    { name: "invalid CAIP-10", input: { to: "invalid", amount: "0.1" }, expect: "Invalid CAIP-10" },
    {
      name: "unsupported chain",
      input: { to: "eip155:999999:0x1234", amount: "0.1" },
      expect: "Unsupported",
    },
    {
      name: "unsupported namespace",
      input: { to: "cosmos:hub:addr", amount: "0.1" },
      expect: "Unsupported",
    },
    {
      name: "no wallet available",
      input: { to: "eip155:8453:0x1234", amount: "0.1" },
      expect: "No private key",
    },
  ];

  test.each(errorCases)("rejects $name", async ({ input, expect: msg }) => {
    const result = await setup().handler(input);
    expect((result as any)?.isError).toBe(true);
    expect((result as any)?.content?.[0]?.text).toContain(msg);
  });
});
