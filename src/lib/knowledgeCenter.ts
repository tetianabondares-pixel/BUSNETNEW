import { supabase } from "@/lib/supabase";
import {
  parseKnowledgeConflict,
  parseKnowledgeEntry,
  parseKnowledgeProposal,
  parseKnowledgeSearchResult,
  parseKnowledgeStats,
  parseKnowledgeVersion,
  parseLegacyKnowledgeBackup,
  type KnowledgeConflict,
  type KnowledgeConflictDecision,
  type KnowledgeEntry,
  type KnowledgeProposal,
  type KnowledgeProposalInput,
  type KnowledgeReviewDecision,
  type KnowledgeSearchFilters,
  type KnowledgeStats,
  type KnowledgeVersion,
  type LegacyKnowledgeEntry,
} from "@/lib/knowledgeCenterModel";

export const LEGACY_KNOWLEDGE_STORAGE_KEY = "busnet_knowledge_center_prototype";
const LEGACY_IMPORT_COMPLETE_KEY = "busnet_knowledge_center_imported";

export type KnowledgeMutationResult = {
  proposalId: string;
  conflictId: string | null;
  entryId: string | null;
  version: number | null;
  status: string;
};

export async function getKnowledgeCurrentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!data.user) throw new Error("Потрібно увійти в BUSNET, щоб продовжити.");
  return data.user.id;
}

function parseMutationResult(value: unknown): KnowledgeMutationResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Knowledge Center received an invalid mutation response.");
  }
  const result = value as Record<string, unknown>;
  if (typeof result.status !== "string") {
    throw new Error("Knowledge Center received an invalid mutation status.");
  }
  const proposalId = typeof result.proposal_id === "string" ? result.proposal_id : "";
  const conflictId = typeof result.conflict_id === "string" ? result.conflict_id : null;
  const entryId = typeof result.entry_id === "string" ? result.entry_id : null;
  const version = typeof result.version === "number" && Number.isInteger(result.version)
    ? result.version
    : null;
  return { proposalId, conflictId, entryId, version, status: result.status };
}

function requireArray(value: unknown, description: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`Knowledge Center received an invalid ${description} response.`);
  return value;
}

export async function searchKnowledge(
  filters: KnowledgeSearchFilters,
  limit = 50,
): Promise<{ items: KnowledgeEntry[]; totalCount: number }> {
  const { data, error } = await supabase.rpc("knowledge_search", {
    p_query: filters.query.trim() || null,
    p_category: filters.category === "all" ? null : filters.category,
    p_status: filters.status === "all" ? null : filters.status,
    p_module: filters.module.trim() || null,
    p_scope: filters.scope === "all" ? null : filters.scope,
    p_limit: limit,
    p_offset: 0,
  }).returns<unknown>();
  if (error) throw error;
  return parseKnowledgeSearchResult(data);
}

export async function getKnowledgeProposals(): Promise<KnowledgeProposal[]> {
  const { data, error } = await supabase.rpc("knowledge_get_proposals", { p_limit: 100 }).returns<unknown>();
  if (error) throw error;
  return requireArray(data, "proposal list").map(parseKnowledgeProposal);
}

export async function getKnowledgeConflicts(): Promise<KnowledgeConflict[]> {
  const { data, error } = await supabase.rpc("knowledge_get_conflicts", { p_limit: 100 }).returns<unknown>();
  if (error) throw error;
  return requireArray(data, "conflict list").map(parseKnowledgeConflict);
}

export async function getKnowledgeHistory(entryId: string): Promise<KnowledgeVersion[]> {
  const { data, error } = await supabase.rpc("knowledge_get_history", {
    p_entry_id: entryId,
  }).returns<unknown>();
  if (error) throw error;
  return requireArray(data, "version history").map(parseKnowledgeVersion);
}

export async function getKnowledgeStats(): Promise<KnowledgeStats> {
  const { data, error } = await supabase.rpc("knowledge_get_stats").returns<unknown>();
  if (error) throw error;
  return parseKnowledgeStats(data);
}

export async function proposeKnowledge(input: KnowledgeProposalInput, legacyId: string | null = null) {
  const { data, error } = await supabase.rpc("knowledge_propose", {
    p_action: input.action,
    p_entry_id: input.entryId,
    p_base_version: input.baseVersion,
    p_category: input.category,
    p_scope: input.scope,
    p_department: input.department,
    p_module: input.module,
    p_owner_id: input.ownerId,
    p_title: input.title.trim(),
    p_summary: input.summary.trim(),
    p_content: input.content.trim(),
    p_source_type: input.sourceType,
    p_source_reference: input.sourceReference.trim(),
    p_source_revision: input.sourceRevision,
    p_evidence: input.evidence.trim(),
    p_confidence: input.confidence,
    p_source_task_id: input.sourceTaskId,
    p_legacy_id: legacyId,
  }).returns<unknown>();
  if (error) throw error;
  return parseMutationResult(data);
}

export async function reviewKnowledgeProposal(
  proposalId: string,
  decision: KnowledgeReviewDecision,
  note: string,
): Promise<KnowledgeMutationResult> {
  const { data, error } = await supabase.rpc("knowledge_review_proposal", {
    p_proposal_id: proposalId,
    p_decision: decision,
    p_note: note.trim(),
  }).returns<unknown>();
  if (error) throw error;
  return parseMutationResult(data);
}

export type KnowledgeConflictInput = {
  entryId: string;
  baseVersion: number;
  summary: string;
  reportedTitle: string;
  reportedContent: string;
  sourceType: KnowledgeProposalInput["sourceType"];
  sourceReference: string;
  sourceRevision: string | null;
  evidence: string;
  confidence: number;
  sourceTaskId: string | null;
};

export async function reportKnowledgeConflict(input: KnowledgeConflictInput): Promise<KnowledgeMutationResult> {
  const { data, error } = await supabase.rpc("knowledge_report_conflict", {
    p_entry_id: input.entryId,
    p_base_version: input.baseVersion,
    p_summary: input.summary.trim(),
    p_reported_title: input.reportedTitle.trim(),
    p_reported_content: input.reportedContent.trim(),
    p_source_type: input.sourceType,
    p_source_reference: input.sourceReference.trim(),
    p_source_revision: input.sourceRevision,
    p_evidence: input.evidence.trim(),
    p_confidence: input.confidence,
    p_source_task_id: input.sourceTaskId,
  }).returns<unknown>();
  if (error) throw error;
  return parseMutationResult(data);
}

export async function resolveKnowledgeConflict(
  conflictId: string,
  decision: KnowledgeConflictDecision,
  note: string,
): Promise<KnowledgeMutationResult> {
  const { data, error } = await supabase.rpc("knowledge_resolve_conflict", {
    p_conflict_id: conflictId,
    p_decision: decision,
    p_note: note.trim(),
  }).returns<unknown>();
  if (error) throw error;
  return parseMutationResult(data);
}

export async function archiveKnowledgeEntry(entryId: string, note: string): Promise<KnowledgeMutationResult> {
  const { data, error } = await supabase.rpc("knowledge_archive_entry", {
    p_entry_id: entryId,
    p_note: note.trim(),
  }).returns<unknown>();
  if (error) throw error;
  return parseMutationResult(data);
}

export async function restoreKnowledgeVersion(
  entryId: string,
  version: number,
  note: string,
): Promise<KnowledgeMutationResult> {
  const { data, error } = await supabase.rpc("knowledge_restore_version", {
    p_entry_id: entryId,
    p_version: version,
    p_note: note.trim(),
  }).returns<unknown>();
  if (error) throw error;
  return parseMutationResult(data);
}

export async function recordKnowledgeUsage(
  entryId: string,
  version: number,
  taskId: string | null,
  consumer: string,
): Promise<string> {
  const { data, error } = await supabase.rpc("knowledge_record_usage", {
    p_entry_id: entryId,
    p_version: version,
    p_task_id: taskId,
    p_consumer: consumer,
  }).returns<unknown>();
  if (error) throw error;
  if (typeof data !== "string") throw new Error("Knowledge Center received an invalid usage response.");
  return data;
}

export function getLegacyKnowledgeImportState(): {
  entries: LegacyKnowledgeEntry[];
  completed: boolean;
} {
  try {
    const raw = window.localStorage.getItem(LEGACY_KNOWLEDGE_STORAGE_KEY);
    const completed = window.localStorage.getItem(LEGACY_IMPORT_COMPLETE_KEY) === "true";
    return { entries: parseLegacyKnowledgeBackup(raw), completed };
  } catch (error) {
    if (error instanceof Error) throw error;
    throw new Error("Не вдалося прочитати локальну копію Knowledge Center.");
  }
}

export async function importLegacyKnowledge(): Promise<number> {
  const { data, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!data.user) throw new Error("Потрібно увійти в BUSNET, щоб перенести локальні знання.");

  const entries = parseLegacyKnowledgeBackup(
    window.localStorage.getItem(LEGACY_KNOWLEDGE_STORAGE_KEY),
  );
  let imported = 0;
  for (const entry of entries) {
    const result = await proposeKnowledge({
      action: "create",
      entryId: null,
      baseVersion: null,
      category: entry.category,
      scope: entry.scope,
      department: "systems",
      module: entry.module || "general",
      ownerId: entry.scope === "owner" ? data.user.id : null,
      title: entry.title,
      summary: "",
      content: entry.content,
      sourceType: entry.source,
      sourceReference: entry.sourceReference || "Локальний запис Knowledge Center",
      sourceRevision: null,
      evidence: "Імпортовано з локального прототипу; резервна копія залишається в браузері.",
      confidence: 0.5,
      sourceTaskId: null,
    }, entry.id);
    if (result.status !== "already_imported") imported += 1;
  }
  window.localStorage.setItem(LEGACY_IMPORT_COMPLETE_KEY, "true");
  return imported;
}
