import { supabase } from "@/lib/supabase";

export type CapabilityLifecycleStatus =
  | "planned"
  | "in_development"
  | "verified"
  | "operational"
  | "retired";
export type CapabilityToolStatus = "candidate" | "active" | "retired";
export type CapabilityTestResult = "passed" | "failed";
export type CapabilityDisplayStatus = CapabilityLifecycleStatus | "stale_evidence";

export type CapabilityUpdate = {
  capabilityKey: string;
  status: CapabilityLifecycleStatus;
  toolId: string | null;
  toolVersion: string | null;
  handlerReference: string | null;
  testRunId: string | null;
  operationalCheckId: string | null;
  toolStatus: CapabilityToolStatus | null;
  clearTool: boolean;
};

export type AssistantTool = {
  id: string;
  version: string;
  handlerReference: string;
  status: CapabilityToolStatus;
};

export type AssistantTestRun = {
  id: string;
  capabilityKey: string;
  toolId: string;
  toolVersion: string;
  suiteName: string;
  testReference: string;
  commitSha: string;
  runnerIdentity: string;
  result: CapabilityTestResult;
  testsRun: number;
  testsFailed: number;
  startedAt: string;
  completedAt: string;
};

export type AssistantOperationalCheck = {
  id: string;
  capabilityKey: string;
  toolId: string;
  toolVersion: string;
  testRunId: string;
  result: CapabilityTestResult;
  executionReference: string;
  runnerIdentity: string;
  startedAt: string;
  completedAt: string;
};

export type AssistantCapability = {
  key: string;
  module: string;
  title: string;
  acceptanceCriteria: string;
  lifecycleStatus: CapabilityLifecycleStatus;
  toolId: string | null;
  toolVersion: string | null;
  testRunId: string | null;
  operationalCheckId: string | null;
  testRun: AssistantTestRun | null;
  testRuns: AssistantTestRun[];
  operationalCheck: AssistantOperationalCheck | null;
  operationalChecks: AssistantOperationalCheck[];
  tool: AssistantTool | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Capability registry returned invalid ${field}.`);
  }
  return value;
}

function nullableText(value: unknown, field: string): string | null {
  if (value === null) return null;
  return requiredText(value, field);
}

function requiredNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Capability registry returned invalid ${field}.`);
  }
  return value;
}

function testResult(value: unknown): CapabilityTestResult {
  if (value === "passed" || value === "failed") return value;
  throw new Error("Capability registry returned an invalid test result.");
}

function parseTool(value: unknown): AssistantTool {
  if (!isRecord(value)) throw new Error("Capability registry returned an invalid tool.");
  const status = value.status;
  if (status !== "candidate" && status !== "active" && status !== "retired") {
    throw new Error("Capability registry returned an invalid tool status.");
  }
  return {
    id: requiredText(value.tool_id, "tool_id"),
    version: requiredText(value.tool_version, "tool_version"),
    handlerReference: requiredText(value.handler_reference, "handler_reference"),
    status,
  };
}

function parseTestRun(value: unknown): AssistantTestRun {
  if (!isRecord(value)) throw new Error("Capability registry returned an invalid test run.");
  return {
    id: requiredText(value.id, "test run id"),
    capabilityKey: requiredText(value.capability_key, "test run capability_key"),
    toolId: requiredText(value.tool_id, "test run tool_id"),
    toolVersion: requiredText(value.tool_version, "test run tool_version"),
    suiteName: requiredText(value.suite_name, "test suite"),
    testReference: requiredText(value.test_reference, "test reference"),
    commitSha: requiredText(value.commit_sha, "commit SHA"),
    runnerIdentity: requiredText(value.runner_identity, "runner identity"),
    result: testResult(value.result),
    testsRun: requiredNumber(value.tests_run, "tests_run"),
    testsFailed: requiredNumber(value.tests_failed, "tests_failed"),
    startedAt: requiredText(value.started_at, "test started_at"),
    completedAt: requiredText(value.completed_at, "test completed_at"),
  };
}

function parseOperationalCheck(value: unknown): AssistantOperationalCheck {
  if (!isRecord(value)) throw new Error("Capability registry returned an invalid operational check.");
  return {
    id: requiredText(value.id, "operational check id"),
    capabilityKey: requiredText(value.capability_key, "operational check capability_key"),
    toolId: requiredText(value.tool_id, "operational check tool_id"),
    toolVersion: requiredText(value.tool_version, "operational check tool_version"),
    testRunId: requiredText(value.test_run_id, "operational check test_run_id"),
    result: testResult(value.result),
    executionReference: requiredText(value.execution_reference, "execution reference"),
    runnerIdentity: requiredText(value.runner_identity, "execution runner"),
    startedAt: requiredText(value.started_at, "execution started_at"),
    completedAt: requiredText(value.completed_at, "execution completed_at"),
  };
}

function parseCapability(value: unknown): AssistantCapability {
  if (!isRecord(value)) throw new Error("Capability registry returned an invalid capability.");
  const lifecycleStatus = value.status;
  if (
    lifecycleStatus !== "planned" &&
    lifecycleStatus !== "in_development" &&
    lifecycleStatus !== "verified" &&
    lifecycleStatus !== "operational" &&
    lifecycleStatus !== "retired"
  ) {
    throw new Error("Capability registry returned an invalid capability status.");
  }
  const toolId = nullableText(value.tool_id, "tool_id");
  const toolVersion = nullableText(value.tool_version, "tool_version");
  if ((toolId === null) !== (toolVersion === null)) {
    throw new Error("Capability registry returned an incomplete tool link.");
  }
  return {
    key: requiredText(value.capability_key, "capability_key"),
    module: requiredText(value.module, "module"),
    title: requiredText(value.title, "title"),
    acceptanceCriteria: requiredText(value.acceptance_criteria, "acceptance_criteria"),
    lifecycleStatus,
    toolId,
    toolVersion,
    testRunId: nullableText(value.test_run_id, "test_run_id"),
    operationalCheckId: nullableText(value.operational_check_id, "operational_check_id"),
    testRun: null,
    testRuns: [],
    operationalCheck: null,
    operationalChecks: [],
    tool: null,
  };
}

function toolKey(id: string, version: string): string {
  return `${id}\u0000${version}`;
}

function freshEvidence(when: string, days: number): boolean {
  const timestamp = new Date(when).getTime();
  return Number.isFinite(timestamp) &&
    timestamp <= Date.now() &&
    Date.now() - timestamp <= days * 24 * 60 * 60 * 1000;
}

function hasCurrentTest(capability: AssistantCapability): boolean {
  const run = capability.testRun;
  return !!run &&
    run.id === capability.testRunId &&
    run.capabilityKey === capability.key &&
    run.toolId === capability.toolId &&
    run.toolVersion === capability.toolVersion &&
    run.result === "passed" &&
    run.testsRun > 0 &&
    run.testsFailed === 0 &&
    freshEvidence(run.completedAt, 30) &&
    capability.tool?.status === "active";
}

export function getCapabilityDisplayStatus(capability: AssistantCapability): CapabilityDisplayStatus {
  if (capability.lifecycleStatus === "retired") return "retired";
  if (capability.lifecycleStatus === "operational") {
    const check = capability.operationalCheck;
    const operational = hasCurrentTest(capability) &&
      !!check &&
      check.id === capability.operationalCheckId &&
      check.testRunId === capability.testRunId &&
      check.capabilityKey === capability.key &&
      check.toolId === capability.toolId &&
      check.toolVersion === capability.toolVersion &&
      check.result === "passed" &&
      freshEvidence(check.completedAt, 7);
    return operational ? "operational" : "stale_evidence";
  }
  if (capability.lifecycleStatus === "verified") {
    return hasCurrentTest(capability) ? "verified" : "stale_evidence";
  }
  if (capability.lifecycleStatus === "in_development" || capability.tool) return "in_development";
  return "planned";
}

export async function getAssistantCapabilities(): Promise<AssistantCapability[]> {
  const [capabilityResult, toolResult, testRunResult, operationalCheckResult] = await Promise.all([
    supabase
      .from("assistant_capabilities")
      .select("capability_key,module,title,acceptance_criteria,status,tool_id,tool_version,test_run_id,operational_check_id")
      .order("module")
      .order("capability_key"),
    supabase
      .from("assistant_tool_registry")
      .select("tool_id,tool_version,handler_reference,status")
      .order("tool_id")
      .order("tool_version"),
    supabase
      .from("assistant_capability_test_runs")
      .select("id,capability_key,tool_id,tool_version,suite_name,test_reference,commit_sha,runner_identity,result,tests_run,tests_failed,started_at,completed_at")
      .order("completed_at", { ascending: false })
      .limit(500),
    supabase
      .from("assistant_capability_operational_checks")
      .select("id,capability_key,tool_id,tool_version,test_run_id,result,execution_reference,runner_identity,started_at,completed_at")
      .order("completed_at", { ascending: false })
      .limit(500),
  ]);
  if (capabilityResult.error) throw capabilityResult.error;
  if (toolResult.error) throw toolResult.error;
  if (testRunResult.error) throw testRunResult.error;
  if (operationalCheckResult.error) throw operationalCheckResult.error;
  if (
    !Array.isArray(capabilityResult.data) ||
    !Array.isArray(toolResult.data) ||
    !Array.isArray(testRunResult.data) ||
    !Array.isArray(operationalCheckResult.data)
  ) {
    throw new Error("Capability registry returned an invalid list.");
  }

  const tools = new Map(
    toolResult.data.map((value: unknown) => {
      const tool = parseTool(value);
      return [toolKey(tool.id, tool.version), tool] as const;
    }),
  );
  const testRuns = new Map(
    testRunResult.data.map((value: unknown) => {
      const run = parseTestRun(value);
      return [run.id, run] as const;
    }),
  );
  const operationalChecks = new Map(
    operationalCheckResult.data.map((value: unknown) => {
      const check = parseOperationalCheck(value);
      return [check.id, check] as const;
    }),
  );

  return capabilityResult.data.map((value: unknown) => {
    const capability = parseCapability(value);
    const linkedTool = capability.toolId && capability.toolVersion
      ? tools.get(toolKey(capability.toolId, capability.toolVersion)) ?? null
      : null;
    return {
      ...capability,
      tool: linkedTool,
      testRun: capability.testRunId ? testRuns.get(capability.testRunId) ?? null : null,
      testRuns: [...testRuns.values()].filter((run) =>
        run.capabilityKey === capability.key &&
        run.toolId === capability.toolId &&
        run.toolVersion === capability.toolVersion,
      ),
      operationalCheck: capability.operationalCheckId
        ? operationalChecks.get(capability.operationalCheckId) ?? null
        : null,
      operationalChecks: [...operationalChecks.values()].filter((check) =>
        check.capabilityKey === capability.key &&
        check.toolId === capability.toolId &&
        check.toolVersion === capability.toolVersion,
      ),
    };
  });
}

export async function updateAssistantCapability(update: CapabilityUpdate): Promise<void> {
  const { error } = await supabase.rpc("assistant_update_capability", {
    p_capability_key: update.capabilityKey,
    p_status: update.status,
    p_tool_id: update.toolId,
    p_tool_version: update.toolVersion,
    p_handler_reference: update.handlerReference,
    p_test_run_id: update.testRunId,
    p_operational_check_id: update.operationalCheckId,
    p_tool_status: update.toolStatus,
    p_clear_tool: update.clearTool,
  });
  if (error) throw error;
}
