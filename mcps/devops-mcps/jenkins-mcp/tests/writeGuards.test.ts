import { describe, expect, it } from "vitest";
import { assertWriteOperationAllowed } from "../src/writeGuards.js";

describe("assertWriteOperationAllowed", () => {
  it("rejects prod write operation when hitl_confirmed is missing", () => {
    expect(() =>
      assertWriteOperationAllowed({
        targetEnv: "prod",
        readOnly: false
      })
    ).toThrow("prod deployments require explicit HITL confirmation (set hitl_confirmed=true).");
  });

  it("rejects prod write operation when hitl_confirmed=false", () => {
    expect(() =>
      assertWriteOperationAllowed({
        targetEnv: "prod",
        readOnly: false,
        hitlConfirmed: false
      })
    ).toThrow("prod deployments require explicit HITL confirmation (set hitl_confirmed=true).");
  });

  it("allows prod write operation when hitl_confirmed=true", () => {
    expect(() =>
      assertWriteOperationAllowed({
        targetEnv: "prod",
        readOnly: false,
        hitlConfirmed: true
      })
    ).not.toThrow();
  });

  it("does not require hitl for non-prod", () => {
    expect(() =>
      assertWriteOperationAllowed({
        targetEnv: "staging",
        readOnly: false
      })
    ).not.toThrow();
  });

  it("prioritizes read_only block over prod hitl", () => {
    expect(() =>
      assertWriteOperationAllowed({
        targetEnv: "prod",
        readOnly: true,
        hitlConfirmed: true
      })
    ).toThrow("write operation is blocked by read_only profile.");
  });
});
