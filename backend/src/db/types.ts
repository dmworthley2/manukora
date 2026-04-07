/**
 * Supabase Database Types
 * Manually defined to match the Postgres schema.
 * When adding tables, update this file and regenerate types via codegen if possible.
 *
 * To regenerate from live Supabase instance:
 * npx supabase gen types typescript --project-id <id> > src/db/types-generated.ts
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

// ============================================================================
// UPLOADS TABLE: CSV file metadata
// ============================================================================

/**
 * Upload row as it exists in the database.
 * Represents a single uploaded CSV file with metadata for audit/lineage.
 */
export interface UploadRow {
  readonly id: string; // UUID
  readonly storage_path: string; // uploads/{id}
  readonly bucket: string; // "uploads"
  readonly original_filename: string;
  readonly byte_size: number;
  readonly content_type: string;
  readonly content_sha256: string | null; // SHA256 hex digest for integrity check
  readonly created_at: string; // ISO timestamp, auto-set by DB
}

/**
 * Insert record for uploads table.
 * All fields required except SHA256 (for flexibility).
 */
export interface UploadInsert {
  readonly id?: string; // Optional; UUID generated if omitted
  readonly storage_path: string;
  readonly bucket: string;
  readonly original_filename: string;
  readonly byte_size: number;
  readonly content_type: string;
  readonly content_sha256?: string | null;
}

/**
 * Update record for uploads table.
 * All fields optional (PATCH semantics).
 */
export interface UploadUpdate {
  readonly storage_path?: string;
  readonly original_filename?: string;
  readonly byte_size?: number;
  readonly content_type?: string;
  readonly content_sha256?: string | null;
}

// ============================================================================
// REPORT_RUNS TABLE: Agentic briefing runs
// ============================================================================

/**
 * ReportRunStatus: Workflow states for agentic runs.
 *
 * - pending: Created, awaiting processing
 * - processing: Currently running through LangGraph
 * - completed: Finalized with all artifacts stored
 * - failed: Error occurred; check metadata for details
 */
export type ReportRunStatus = "pending" | "processing" | "completed" | "failed";

/**
 * ReportRunRow: One agentic run from upload → briefing.
 *
 * Links:
 * - upload_id FK to uploads.id (nullable; runs may be triggered without prior upload)
 * - fact_bundle_path, briefing_md_path, briefing_pdf_path: Output artifacts in Storage
 *
 * Metadata:
 * - Custom JSON for workflow state, LangGraph thread IDs, HiTL state, etc.
 * - Extensible; schema governed by application code
 */
export interface ReportRunRow {
  readonly id: string; // UUID
  readonly upload_id: string | null; // FK to uploads.id
  readonly status: ReportRunStatus;
  readonly period: string; // ISO month (e.g., "2026-04")
  readonly fact_bundle_path: string | null; // outputs/{yyyy}/{mm}/{runId}/fact-bundle.json
  readonly briefing_md_path: string | null; // outputs/{yyyy}/{mm}/{runId}/briefing.md
  readonly briefing_pdf_path: string | null; // outputs/{yyyy}/{mm}/{runId}/briefing.pdf
  readonly metadata: Json; // Custom workflow state (LangGraph thread ID, HiTL dispositions, etc.)
  readonly created_at: string; // ISO timestamp, auto-set by DB
  readonly updated_at: string; // ISO timestamp, auto-updated by DB trigger
}

/**
 * Insert record for report_runs table.
 * Period required; status defaults to "pending".
 */
export interface ReportRunInsert {
  readonly id?: string; // Optional; UUID generated if omitted
  readonly upload_id?: string | null;
  readonly status?: ReportRunStatus; // Defaults to "pending"
  readonly period: string; // REQUIRED
  readonly fact_bundle_path?: string | null;
  readonly briefing_md_path?: string | null;
  readonly briefing_pdf_path?: string | null;
  readonly metadata?: Json; // Defaults to {}
}

/**
 * Update record for report_runs table.
 * All fields optional (PATCH semantics).
 * updated_at is auto-managed by DB trigger.
 */
export interface ReportRunUpdate {
  readonly status?: ReportRunStatus;
  readonly period?: string;
  readonly fact_bundle_path?: string | null;
  readonly briefing_md_path?: string | null;
  readonly briefing_pdf_path?: string | null;
  readonly metadata?: Json;
}

// ============================================================================
// PRODUCT_CATALOG TABLE: Master product data
// ============================================================================

/**
 * ProductCatalogRow: One product in the catalog.
 * Represents a SKU with all static product metadata.
 */
export interface ProductCatalogRow {
  readonly sku: string;
  readonly product_category: string;
  readonly product_name: string;
  readonly mgo_rating: number | null;
  readonly retail_price_usd: number;
  readonly target_months_cover: number;
  readonly product_notes: string | null;
  readonly created_at: string;
}

/**
 * Insert record for product_catalog table.
 */
export interface ProductCatalogInsert {
  readonly sku: string;
  readonly product_category: string;
  readonly product_name: string;
  readonly mgo_rating?: number | null;
  readonly retail_price_usd: number;
  readonly target_months_cover?: number;
  readonly product_notes?: string | null;
  readonly upload_id: string;
}

/**
 * Update record for product_catalog table.
 * All fields optional (PATCH semantics).
 */
export interface ProductCatalogUpdate {
  readonly product_category?: string;
  readonly product_name?: string;
  readonly mgo_rating?: number | null;
  readonly retail_price_usd?: number;
  readonly target_months_cover?: number;
  readonly product_notes?: string | null;
}

// ============================================================================
// INVENTORY_STATE TABLE: Current inventory snapshot
// ============================================================================

/**
 * InventoryStateRow: Current inventory position for a SKU.
 * One row per SKU; updated each time inventory data is uploaded.
 */
export interface InventoryStateRow {
  readonly sku: string;
  readonly stock_on_hand: number;
  readonly units_on_order: number;
  readonly order_arrival_months: number;
  readonly updated_at: string;
}

/**
 * Insert record for inventory_state table.
 */
export interface InventoryStateInsert {
  readonly sku: string;
  readonly stock_on_hand: number;
  readonly units_on_order: number;
  readonly order_arrival_months: number;
  readonly upload_id: string;
}

/**
 * Update record for inventory_state table.
 * All fields optional (PATCH semantics).
 */
export interface InventoryStateUpdate {
  readonly stock_on_hand?: number;
  readonly units_on_order?: number;
  readonly order_arrival_months?: number;
}

// ============================================================================
// SALES_HISTORY TABLE: Historical sales by channel and month
// ============================================================================

/**
 * SalesHistoryRow: One sales record for a SKU in a month/channel.
 * Tracks units_sold separately for each (sku, channel, month_period) combination.
 */
export interface SalesHistoryRow {
  readonly id: string;
  readonly sku: string;
  readonly channel: string;
  readonly month_period: number;
  readonly units_sold: number;
  readonly created_at: string;
}

/**
 * Insert record for sales_history table.
 */
export interface SalesHistoryInsert {
  readonly id?: string;
  readonly sku: string;
  readonly channel: string;
  readonly month_period: number;
  readonly units_sold: number;
  readonly upload_id: string;
}

// ============================================================================
// AGENT_REASONING_FEED VIEW: Semantic layer for analysis
// ============================================================================

/**
 * AgentReasoningFeedRow: Pre-calculated metrics for inventory analysis.
 * Read-only view combining product, inventory, and sales data.
 * Used by briefing agent to make reorder decisions.
 */
export interface AgentReasoningFeedRow {
  readonly sku: string;
  readonly product_name: string;
  readonly retail_price_usd: number;
  readonly current_demand: number;
  readonly revenue_opportunity: number;
  readonly total_pipeline: number;
  readonly months_of_cover: number;
  readonly momentum_trend: 'DECLINING' | 'GROWING' | 'STABLE';
  readonly reorder_required: boolean;
  readonly stock_on_hand: number;
  readonly units_on_order: number;
  readonly order_arrival_months: number;
  readonly m1_total: number;
  readonly m2_total: number;
  readonly m3_total: number;
  readonly target_months_cover: number;
}

// ============================================================================
// BRIEFING_AUDIT_TRAIL TABLE: Analyst proposals + Auditor feedback dialogue
// ============================================================================

/**
 * AuditChallenge: A single issue flagged by the auditor.
 * Analyst will respond to each challenge by ID.
 */
export interface AuditChallenge {
  readonly id: string; // e.g., "challenge-1"
  readonly type: 'numerical' | 'hallucination' | 'assumption' | 'tradeoff' | 'policy';
  readonly section: string; // "capital-allocation", etc.
  readonly claim: string; // The exact claim being challenged
  readonly question: string; // What the auditor is asking
  readonly evidence: string; // What data/policy supports this question
  readonly severity: 'error' | 'assumption' | 'concern';
  readonly requestedAction: string; // How analyst should address it
}

/**
 * BriefingAuditTrailRow: One iteration of the Analyst → Auditor cycle.
 * Captures proposals, challenges, and resolutions for full transparency.
 */
export interface BriefingAuditTrailRow {
  readonly id: string; // UUID
  readonly report_run_id: string; // FK to report_runs
  readonly iteration: number; // 1, 2, 3...
  readonly analyst_archetype: string; // "senior-analyst"
  readonly auditor_archetype: string; // "senior-auditor"

  // Analyst proposal
  readonly analyst_proposal: Json; // Full briefing draft
  readonly analyst_reasoning: string | null; // Explanation of key choices
  readonly analyst_submitted_at: string; // ISO timestamp

  // Auditor review
  readonly auditor_challenges: Json | null; // Array of AuditChallenge
  readonly auditor_notes: string | null; // Summary of concerns
  readonly auditor_reviewed_at: string | null; // ISO timestamp

  // Resolution
  readonly analyst_response: string | null; // Analyst addresses each challenge
  readonly resolution_type: string | null; // "accepted" | "clarified" | "escalated" | "pending"
  readonly resolved_at: string | null; // ISO timestamp

  // Final approval
  readonly auditor_approved: boolean | null;
  readonly escalation_reason: string | null; // Why still unresolved
  readonly is_final: boolean; // Only true for approved or escalated briefing

  readonly created_at: string;
  readonly updated_at: string;
}

/**
 * Insert record for briefing_audit_trail.
 */
export interface BriefingAuditTrailInsert {
  readonly id?: string;
  readonly report_run_id: string;
  readonly iteration: number;
  readonly analyst_archetype?: string;
  readonly auditor_archetype?: string;
  readonly analyst_proposal?: Json;
  readonly analyst_reasoning?: string | null;
  readonly analyst_submitted_at?: string;
  readonly auditor_challenges?: Json | null;
  readonly auditor_notes?: string | null;
  readonly auditor_reviewed_at?: string | null;
  readonly analyst_response?: string | null;
  readonly resolution_type?: string | null;
  readonly resolved_at?: string | null;
  readonly auditor_approved?: boolean | null;
  readonly escalation_reason?: string | null;
  readonly is_final?: boolean;
}

/**
 * Update record for briefing_audit_trail.
 */
export interface BriefingAuditTrailUpdate {
  readonly auditor_challenges?: Json | null;
  readonly auditor_notes?: string | null;
  readonly auditor_reviewed_at?: string | null;
  readonly analyst_response?: string | null;
  readonly resolution_type?: string | null;
  readonly resolved_at?: string | null;
  readonly auditor_approved?: boolean | null;
  readonly escalation_reason?: string | null;
  readonly is_final?: boolean;
}

// ============================================================================
// BRIEFING_BLACKBOARD TABLE: Section-level briefing state management
// ============================================================================

/**
 * AuditChallenge: A single issue flagged by the auditor.
 * Analyst will respond to each challenge by ID.
 */
export interface AuditChallenge {
  readonly id: string; // e.g., "ch-1"
  readonly type: 'numerical' | 'hallucination' | 'assumption' | 'tradeoff' | 'policy';
  readonly claim: string; // The exact claim being challenged
  readonly question: string; // What the auditor is asking
  readonly evidence: string; // What data/policy supports this question
  readonly severity: 'error' | 'assumption' | 'concern';
  readonly requestedAction: string; // How analyst should address it
}

/**
 * BriefingBlackboardRow: Master briefing state with section-level approval tracking.
 * Analyst and Auditor work independently on each section.
 * Conflicts are explicitly tracked for CEO visibility.
 */
export interface BriefingBlackboardRow {
  readonly id: string; // UUID
  readonly report_run_id: string; // FK to report_runs
  readonly iteration: number; // Iteration count

  // Overall status
  readonly overall_status: 'in-progress' | 'under-review' | 'responding' | 'ready-for-approval' | 'approved' | 'escalated-to-ceo';

  // Section states (JSON): each section has analyst_draft, auditor_status, challenges, analyst_response, resolution
  readonly sections: Json; // { [sectionId]: { title, analyst_draft, auditor_status, ... } }

  // Conflicts (JSON): unresolved disagreements
  readonly conflicts: Json; // Array of { section_id, challenge_id, analyst_position, auditor_position, severity }

  // Summary
  readonly approval_summary: Json; // { total, approved, escalated, pending }

  // Timeline
  readonly analyst_submitted_at: string | null;
  readonly auditor_started_review_at: string | null;
  readonly auditor_completed_review_at: string | null;
  readonly analyst_started_response_at: string | null;
  readonly analyst_completed_response_at: string | null;

  // Final approval
  readonly is_final: boolean;

  readonly created_at: string;
  readonly updated_at: string;
}

/**
 * Insert record for briefing_blackboard.
 */
export interface BriefingBlackboardInsert {
  readonly id?: string;
  readonly report_run_id: string;
  readonly iteration: number;
  readonly overall_status?: string;
  readonly sections?: Json;
  readonly conflicts?: Json;
  readonly approval_summary?: Json;
  readonly analyst_submitted_at?: string | null;
  readonly auditor_started_review_at?: string | null;
  readonly auditor_completed_review_at?: string | null;
  readonly analyst_started_response_at?: string | null;
  readonly analyst_completed_response_at?: string | null;
  readonly is_final?: boolean;
}

/**
 * Update record for briefing_blackboard.
 */
export interface BriefingBlackboardUpdate {
  readonly overall_status?: string;
  readonly sections?: Json;
  readonly conflicts?: Json;
  readonly approval_summary?: Json;
  readonly analyst_submitted_at?: string | null;
  readonly auditor_started_review_at?: string | null;
  readonly auditor_completed_review_at?: string | null;
  readonly analyst_started_response_at?: string | null;
  readonly analyst_completed_response_at?: string | null;
  readonly is_final?: boolean;
}

/**
 * BriefingSectionRow: Individual section state (denormalized from blackboard).
 * Enables efficient UX queries without parsing JSONB.
 */
export interface BriefingSectionRow {
  readonly id: string; // UUID
  readonly blackboard_id: string; // FK to briefing_blackboard
  readonly section_id: string; // e.g., "executive-summary", "capital-allocation"
  readonly title: string;

  // Analyst
  readonly analyst_draft: string | null;
  readonly analyst_reasoning: string | null;
  readonly analyst_submitted_at: string | null;

  // Auditor
  readonly auditor_status: string | null; // "pending" | "approved" | "challenged" | "escalated"
  readonly auditor_challenges: Json | null;
  readonly auditor_notes: string | null;
  readonly auditor_reviewed_at: string | null;

  // Analyst response
  readonly analyst_response: string | null;
  readonly analyst_responded_at: string | null;

  // Resolution
  readonly resolution_type: string | null;
  readonly is_approved: boolean;
  readonly escalation_reason: string | null;
  readonly analyst_position: string | null;
  readonly auditor_position: string | null;

  readonly created_at: string;
  readonly updated_at: string;
}

/**
 * Insert record for briefing_section.
 */
export interface BriefingSectionInsert {
  readonly id?: string;
  readonly blackboard_id: string;
  readonly section_id: string;
  readonly title?: string;
  readonly analyst_draft?: string | null;
  readonly analyst_reasoning?: string | null;
  readonly analyst_submitted_at?: string | null;
  readonly auditor_status?: string | null;
  readonly auditor_challenges?: Json | null;
  readonly auditor_notes?: string | null;
  readonly auditor_reviewed_at?: string | null;
  readonly analyst_response?: string | null;
  readonly analyst_responded_at?: string | null;
  readonly resolution_type?: string | null;
  readonly is_approved?: boolean;
  readonly escalation_reason?: string | null;
  readonly analyst_position?: string | null;
  readonly auditor_position?: string | null;
}

/**
 * Update record for briefing_section.
 */
export interface BriefingSectionUpdate {
  readonly title?: string;
  readonly analyst_draft?: string | null;
  readonly analyst_reasoning?: string | null;
  readonly analyst_submitted_at?: string | null;
  readonly auditor_status?: string | null;
  readonly auditor_challenges?: Json | null;
  readonly auditor_notes?: string | null;
  readonly auditor_reviewed_at?: string | null;
  readonly analyst_response?: string | null;
  readonly analyst_responded_at?: string | null;
  readonly resolution_type?: string | null;
  readonly is_approved?: boolean;
  readonly escalation_reason?: string | null;
  readonly analyst_position?: string | null;
  readonly auditor_position?: string | null;
}

// ============================================================================
// DATABASE TYPE (for Supabase client)
// ============================================================================

/**
 * Supabase Database schema.
 * Used to type the SupabaseClient<Database> for type-safe queries.
 *
 * Note: Supabase client doesn't fully use these types for Insert/Update.
 * Cast results as needed, or update method to be typed correctly.
 */
export interface Database {
  public: {
    Tables: {
      uploads: {
        Row: UploadRow;
        Insert: UploadInsert;
        Update: UploadUpdate;
      };
      report_runs: {
        Row: ReportRunRow;
        Insert: ReportRunInsert;
        Update: ReportRunUpdate;
      };
      product_catalog: {
        Row: ProductCatalogRow;
        Insert: ProductCatalogInsert;
        Update: ProductCatalogUpdate;
      };
      inventory_state: {
        Row: InventoryStateRow;
        Insert: InventoryStateInsert;
        Update: InventoryStateUpdate;
      };
      sales_history: {
        Row: SalesHistoryRow;
        Insert: SalesHistoryInsert;
      };
      briefing_audit_trail: {
        Row: BriefingAuditTrailRow;
        Insert: BriefingAuditTrailInsert;
        Update: BriefingAuditTrailUpdate;
      };
      briefing_blackboard: {
        Row: BriefingBlackboardRow;
        Insert: BriefingBlackboardInsert;
        Update: BriefingBlackboardUpdate;
      };
      briefing_section: {
        Row: BriefingSectionRow;
        Insert: BriefingSectionInsert;
        Update: BriefingSectionUpdate;
      };
    };
    Views: {
      agent_reasoning_feed: {
        Row: AgentReasoningFeedRow;
      };
    };
  };
}
