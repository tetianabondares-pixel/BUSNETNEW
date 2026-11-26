export type KnowledgeCategory =
  | "busnet_knowledge"
  | "business_rule"
  | "experience"
  | "learned_knowledge"
  | "document"
  | "technical_knowledge"
  | "problem_solution"
  | "proposal";

export type KnowledgeStatus =
  | "new"
  | "needs_verification"
  | "verified"
  | "stale_or_conflict"
  | "rejected"
  | "archived";

export type KnowledgeScope = "shared" | "module" | "owner";
export type KnowledgeSourceType = "owner_input" | "platform_source" | "task_experience";
export type KnowledgeProposalAction = "create" | "update" | "conflict";
export type KnowledgeProposalStatus = "pending" | "needs_verification" | "verified" | "rejected" | "conflict";
export type KnowledgeReviewDecision = "verify" | "defer" | "reject";
export type KnowledgeConflictDecision = "accept_reported" | "reaffirm_current" | "dismiss";

export const KNOWLEDGE_CATEGORIES: Array<{ id: KnowledgeCategory; label: string }> = [
  { id: "busnet_knowledge", label: "Знання про BUSNET" },
  { id: "business_rule", label: "Бізнес-правила" },
  { id: "experience", label: "Досвід" },
  { id: "learned_knowledge", label: "Нові знання" },
  { id: "document", label: "Документи" },
  { id: "technical_knowledge", label: "Технічні знання" },
  { id: "problem_solution", label: "Рішення проблем" },
  { id: "proposal", label: "Пропозиції" },
];

export const KNOWLEDGE_STATUSES: Array<{ id: KnowledgeStatus; label: string }> = [
  { id: "new", label: "Нове" },
  { id: "needs_verification", label: "Потребує перевірки" },
  { id: "verified", label: "Перевірено" },
  { id: "stale_or_conflict", label: "Застаріло / суперечність" },
  { id: "rejected", label: "Відхилено" },
  { id: "archived", label: "Архів" },
];

export const KNOWLEDGE_SOURCES: Array<{ id: KnowledgeSourceType; label: string }> = [
  { id: "owner_input", label: "Від адміністратора" },
  { id: "platform_source", label: "Джерело BUSNET" },
  { id: "task_experience", label: "Досвід задачі" },
];

export const KNOWLEDGE_SCOPES: Array<{ id: KnowledgeScope; label: string }> = [
  { id: "shared", label: "Спільне" },
  { id: "module", label: "Модуль" },
  { id: "owner", label: "Лише власник" },
];

export type KnowledgeSource = {
  sourceType: KnowledgeSourceType;
  sourceReference: string;
  sourceRevision: string | null;
  evidence: string;
  confidence: number;
  sourceTaskId: string | null;
};

export type KnowledgeEntry = {
  id: string;
  category: KnowledgeCategory;
  scope: KnowledgeScope;
  department: string;
  module: string;
  ownerId: string | null;
  title: string;
  summary: string;
  content: string;
  status: KnowledgeStatus;
  confidence: number;
  currentVersion: number;
  createdBy: string;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
  verifiedBy: string | null;
  verifiedAt: string | null;
  verifiedVersion: number | null;
  verificationSource: string | null;
  sourceTaskId: string | null;
  sources: KnowledgeSource[];
};

export type KnowledgeProposal = {
  id: string;
  entryId: string | null;
  baseVersion: number | null;
  action: KnowledgeProposalAction;
  status: KnowledgeProposalStatus;
  category: KnowledgeCategory;
  scope: KnowledgeScope;
  department: string;
  module: string;
  ownerId: string | null;
  title: string;
  summary: string;
  content: string;
  sourceType: KnowledgeSourceType;
  sourceReference: string;
  sourceRevision: string | null;
  evidence: string;
  confidence: number;
  sourceTaskId: string | null;
  createdBy: string;
  createdAt: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNote: string;
};

export type KnowledgeConflict = {
  id: string;
  entryId: string;
  proposalId: string;
  summary: string;
  status: "open" | "resolved" | "dismissed";
  reportedBy: string;
  createdAt: string;
  proposedTitle: string;
  proposedContent: string;
  sourceType: KnowledgeSourceType;
  sourceReference: string;
  evidence: string;
  confidence: number;
};

export type KnowledgeVersion = {
  id: string;
  entryId: string;
  versionNo: number;
  category: KnowledgeCategory;
  scope: KnowledgeScope;
  department: string;
  module: string;
  ownerId: string | null;
  title: string;
  summary: string;
  content: string;
  status: KnowledgeStatus;
  confidence: number;
  changeType: string;
  changeNote: string;
  sourceTaskId: string | null;
  createdBy: string;
  createdAt: string;
  verifiedBy: string | null;
  verifiedAt: string | null;
  verificationSource: string | null;
  sources: KnowledgeSource[];
};

export type KnowledgeStats = {
  total: number;
  verified: number;
  needsVerification: number;
  openConflicts: number;
  usageCount: number;
};

export type KnowledgeProposalInput = {
  action: "create" | "update";
  entryId: string | null;
  baseVersion: number | null;
  category: KnowledgeCategory;
  scope: KnowledgeScope;
  department: string;
  module: string;
  ownerId: string | null;
  title: string;
  summary: string;
  content: string;
  sourceType: KnowledgeSourceType;
  sourceReference: string;
  sourceRevision: string | null;
  evidence: string;
  confidence: number;
  sourceTaskId: string | null;
};

export type KnowledgeSearchFilters = {
  query: string;
  category: KnowledgeCategory | "all";
  status: KnowledgeStatus | "all";
  module: string;
  scope: KnowledgeScope | "all";
};

export type LegacyKnowledgeEntry = {
  id: string;
  title: string;
  content: string;
  category: KnowledgeCategory;
  source: KnowledgeSourceType;
  sourceReference: string;
  module: string;
  scope: KnowledgeScope;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown, nullable = false): string | null {
  if (nullable && value === null) return null;
  return typeof value === "string" ? value : null;
}

function integer(value: unknown, nullable = false): number | null {
  if (nullable && value === null) return null;
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function decimal(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function category(value: unknown): KnowledgeCategory | null {
  return KNOWLEDGE_CATEGORIES.find((item) => item.id === value)?.id ?? null;
}

function status(value: unknown): KnowledgeStatus | null {
  return KNOWLEDGE_STATUSES.find((item) => item.id === value)?.id ?? null;
}

function scope(value: unknown): KnowledgeScope | null {
  return KNOWLEDGE_SCOPES.find((item) => item.id === value)?.id ?? null;
}

function sourceType(value: unknown): KnowledgeSourceType | null {
  return KNOWLEDGE_SOURCES.find((item) => item.id === value)?.id ?? null;
}

function parseSource(value: unknown): KnowledgeSource | null {
  if (!isRecord(value)) return null;
  const parsedSourceType = sourceType(value.source_type);
  const sourceReference = text(value.source_reference);
  const sourceRevision = text(value.source_revision, true);
  const evidence = text(value.evidence);
  const confidence = decimal(value.confidence);
  const sourceTaskId = text(value.source_task_id, true);
  if (!parsedSourceType || !sourceReference || sourceRevision === null && value.source_revision !== null ||
      evidence === null || confidence === null || sourceTaskId === null && value.source_task_id !== null) {
    return null;
  }
  return { sourceType: parsedSourceType, sourceReference, sourceRevision, evidence, confidence, sourceTaskId };
}

function requireRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new Error("Knowledge Center received an invalid server response.");
  return value;
}

export function parseKnowledgeSources(value: unknown): KnowledgeSource[] {
  if (!Array.isArray(value)) throw new Error("Knowledge Center received invalid source metadata.");
  const sources = value.map(parseSource);
  if (sources.some((source) => source === null)) {
    throw new Error("Knowledge Center received invalid source metadata.");
  }
  return sources.filter((source): source is KnowledgeSource => source !== null);
}

export function parseKnowledgeEntry(value: unknown): KnowledgeEntry {
  const row = requireRecord(value);
  const parsedCategory = category(row.category);
  const parsedScope = scope(row.scope);
  const parsedStatus = status(row.status);
  const id = text(row.id);
  const department = text(row.department);
  const module = text(row.module);
  const ownerId = text(row.owner_id, true);
  const title = text(row.title);
  const summary = text(row.summary);
  const content = text(row.content);
  const confidence = decimal(row.confidence);
  const currentVersion = integer(row.current_version);
  const createdBy = text(row.created_by);
  const updatedBy = text(row.updated_by, true);
  const createdAt = text(row.created_at);
  const updatedAt = text(row.updated_at);
  const verifiedBy = text(row.verified_by, true);
  const verifiedAt = text(row.verified_at, true);
  const verifiedVersion = integer(row.verified_version, true);
  const verificationSource = text(row.verification_source, true);
  const sourceTaskId = text(row.source_task_id, true);
  if (!parsedCategory || !parsedScope || !parsedStatus || !id || !department || !module ||
      ownerId === null && row.owner_id !== null || !title || summary === null || !content ||
      confidence === null || currentVersion === null || !createdBy ||
      updatedBy === null && row.updated_by !== null || !createdAt || !updatedAt ||
      verifiedBy === null && row.verified_by !== null || verifiedAt === null && row.verified_at !== null ||
      verifiedVersion === null && row.verified_version !== null ||
      verificationSource === null && row.verification_source !== null ||
      sourceTaskId === null && row.source_task_id !== null) {
    throw new Error("Knowledge Center received an invalid entry.");
  }
  return {
    id, category: parsedCategory, scope: parsedScope, department, module, ownerId,
    title, summary, content, status: parsedStatus, confidence, currentVersion,
    createdBy, updatedBy, createdAt, updatedAt, verifiedBy, verifiedAt,
    verifiedVersion, verificationSource, sourceTaskId, sources: parseKnowledgeSources(row.sources),
  };
}

export function parseKnowledgeSearchResult(value: unknown): { items: KnowledgeEntry[]; totalCount: number } {
  const result = requireRecord(value);
  if (!Array.isArray(result.items) || typeof result.total_count !== "number" || !Number.isInteger(result.total_count)) {
    throw new Error("Knowledge Center received an invalid search response.");
  }
  return { items: result.items.map(parseKnowledgeEntry), totalCount: result.total_count };
}

export function parseKnowledgeProposal(value: unknown): KnowledgeProposal {
  const row = requireRecord(value);
  const parsedAction = row.action === "create" || row.action === "update" || row.action === "conflict" ? row.action : null;
  const parsedStatus = row.status === "pending" || row.status === "needs_verification" ||
    row.status === "verified" || row.status === "rejected" || row.status === "conflict" ? row.status : null;
  const parsedCategory = category(row.category);
  const parsedScope = scope(row.scope);
  const parsedSource = sourceType(row.source_type);
  const id = text(row.id);
  const entryId = text(row.entry_id, true);
  const baseVersion = integer(row.base_version, true);
  const department = text(row.department);
  const module = text(row.module);
  const ownerId = text(row.owner_id, true);
  const title = text(row.title);
  const summary = text(row.summary);
  const content = text(row.content);
  const sourceReference = text(row.source_reference);
  const sourceRevision = text(row.source_revision, true);
  const evidence = text(row.evidence);
  const confidence = decimal(row.confidence);
  const sourceTaskId = text(row.source_task_id, true);
  const createdBy = text(row.created_by);
  const createdAt = text(row.created_at);
  const reviewedBy = text(row.reviewed_by, true);
  const reviewedAt = text(row.reviewed_at, true);
  const reviewNote = text(row.review_note);
  if (!parsedAction || !parsedStatus || !parsedCategory || !parsedScope || !parsedSource ||
      !id || entryId === null && row.entry_id !== null ||
      baseVersion === null && row.base_version !== null || !department || !module ||
      ownerId === null && row.owner_id !== null || !title || summary === null || !content ||
      !sourceReference || sourceRevision === null && row.source_revision !== null ||
      evidence === null || confidence === null ||
      sourceTaskId === null && row.source_task_id !== null || !createdBy || !createdAt ||
      reviewedBy === null && row.reviewed_by !== null || reviewedAt === null && row.reviewed_at !== null ||
      reviewNote === null) {
    throw new Error("Knowledge Center received an invalid proposal.");
  }
  return {
    id, entryId, baseVersion, action: parsedAction, status: parsedStatus,
    category: parsedCategory, scope: parsedScope, department, module, ownerId,
    title, summary, content, sourceType: parsedSource, sourceReference,
    sourceRevision, evidence, confidence, sourceTaskId, createdBy, createdAt,
    reviewedBy, reviewedAt, reviewNote,
  };
}

export function parseKnowledgeConflict(value: unknown): KnowledgeConflict {
  const row = requireRecord(value);
  const conflictStatus = row.status === "open" || row.status === "resolved" || row.status === "dismissed"
    ? row.status
    : null;
  const parsedSource = sourceType(row.source_type);
  const id = text(row.id);
  const entryId = text(row.entry_id);
  const proposalId = text(row.proposal_id);
  const summary = text(row.summary);
  const reportedBy = text(row.reported_by);
  const createdAt = text(row.created_at);
  const proposedTitle = text(row.proposed_title);
  const proposedContent = text(row.proposed_content);
  const sourceReference = text(row.source_reference);
  const evidence = text(row.evidence);
  const confidence = decimal(row.confidence);
  if (!conflictStatus || !parsedSource || !id || !entryId || !proposalId || !summary ||
      !reportedBy || !createdAt || !proposedTitle || !proposedContent ||
      !sourceReference || evidence === null || confidence === null) {
    throw new Error("Knowledge Center received an invalid conflict.");
  }
  return {
    id, entryId, proposalId, summary, status: conflictStatus, reportedBy,
    createdAt, proposedTitle, proposedContent, sourceType: parsedSource,
    sourceReference, evidence, confidence,
  };
}

export function parseKnowledgeVersion(value: unknown): KnowledgeVersion {
  const row = requireRecord(value);
  const parsedCategory = category(row.category);
  const parsedScope = scope(row.scope);
  const parsedStatus = status(row.status);
  const id = text(row.id);
  const entryId = text(row.entry_id);
  const versionNo = integer(row.version_no);
  const department = text(row.department);
  const module = text(row.module);
  const ownerId = text(row.owner_id, true);
  const title = text(row.title);
  const summary = text(row.summary);
  const content = text(row.content);
  const confidence = decimal(row.confidence);
  const changeType = text(row.change_type);
  const changeNote = text(row.change_note);
  const sourceTaskId = text(row.source_task_id, true);
  const createdBy = text(row.created_by);
  const createdAt = text(row.created_at);
  const verifiedBy = text(row.verified_by, true);
  const verifiedAt = text(row.verified_at, true);
  const verificationSource = text(row.verification_source, true);
  if (!parsedCategory || !parsedScope || !parsedStatus || !id || !entryId ||
      versionNo === null || !department || !module || ownerId === null && row.owner_id !== null ||
      !title || summary === null || !content || confidence === null || !changeType ||
      changeNote === null || sourceTaskId === null && row.source_task_id !== null ||
      !createdBy || !createdAt || verifiedBy === null && row.verified_by !== null ||
      verifiedAt === null && row.verified_at !== null ||
      verificationSource === null && row.verification_source !== null) {
    throw new Error("Knowledge Center received an invalid version.");
  }
  return {
    id, entryId, versionNo, category: parsedCategory, scope: parsedScope,
    department, module, ownerId, title, summary, content, status: parsedStatus,
    confidence, changeType, changeNote, sourceTaskId, createdBy, createdAt,
    verifiedBy, verifiedAt, verificationSource, sources: parseKnowledgeSources(row.sources),
  };
}

export function parseKnowledgeStats(value: unknown): KnowledgeStats {
  const row = requireRecord(value);
  const total = integer(row.total);
  const verified = integer(row.verified);
  const needsVerification = integer(row.needs_verification);
  const openConflicts = integer(row.open_conflicts);
  const usageCount = integer(row.usage_count);
  if (total === null || verified === null || needsVerification === null ||
      openConflicts === null || usageCount === null) {
    throw new Error("Knowledge Center received invalid statistics.");
  }
  return { total, verified, needsVerification, openConflicts, usageCount };
}

export function parseLegacyKnowledgeBackup(value: string | null): LegacyKnowledgeEntry[] {
  if (value === null) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("Локальна копія Knowledge Center має пошкоджений формат і не була змінена.");
  }
  if (!Array.isArray(parsed)) {
    throw new Error("Локальна копія Knowledge Center має невідомий формат і не була змінена.");
  }
  const valid = parsed.every((entry) => {
    if (!isRecord(entry)) return false;
    return typeof entry.id === "string" &&
      typeof entry.title === "string" &&
      typeof entry.content === "string" &&
      category(entry.category) !== null &&
      sourceType(entry.source) !== null &&
      typeof entry.sourceReference === "string" &&
      typeof entry.module === "string" &&
      scope(entry.scope) !== null &&
      typeof entry.isDemo === "boolean";
  });
  if (!valid) {
    throw new Error("Локальна копія містить невідомі записи; перенесення зупинено без змін.");
  }
  return parsed
    .filter((entry) => isRecord(entry) && entry.isDemo === false)
    .map((entry) => {
      if (!isRecord(entry)) throw new Error("Invalid legacy record.");
      return {
        id: entry.id as string,
        title: entry.title as string,
        content: entry.content as string,
        category: category(entry.category) as KnowledgeCategory,
        source: sourceType(entry.source) as KnowledgeSourceType,
        sourceReference: entry.sourceReference as string,
        module: entry.module as string,
        scope: scope(entry.scope) as KnowledgeScope,
      };
    });
}
