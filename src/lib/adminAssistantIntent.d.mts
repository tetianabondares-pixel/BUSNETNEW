export type AssistantRequest =
  | { kind: "greeting" }
  | { kind: "passenger_search"; query: string }
  | { kind: "passenger_search_missing_query" }
  | { kind: "unsupported" };

export function parseAssistantRequest(rawText: string): AssistantRequest;
