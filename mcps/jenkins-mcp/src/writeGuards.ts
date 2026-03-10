export interface WriteGuardInput {
  targetEnv?: string;
  readOnly?: boolean;
  hitlConfirmed?: boolean;
}

export function assertWriteOperationAllowed(input: WriteGuardInput): void {
  if (input.readOnly === true) {
    throw new Error("write operation is blocked by read_only profile.");
  }

  if (input.targetEnv === "prod" && input.hitlConfirmed !== true) {
    throw new Error(
      "prod deployments require explicit HITL confirmation (set hitl_confirmed=true)."
    );
  }
}
