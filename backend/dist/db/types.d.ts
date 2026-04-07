/**
 * Supabase Database Types
 * Manually defined to match the Postgres schema.
 * When adding tables, update this file and regenerate types via codegen if possible.
 *
 * To regenerate from live Supabase instance:
 * npx supabase gen types typescript --project-id <id> > src/db/types-generated.ts
 */
export type Json = string | number | boolean | null | {
    [key: string]: Json | undefined;
} | Json[];
/**
 * Upload row as it exists in the database.
 * Represents a single uploaded CSV file with metadata for audit/lineage.
 */
export interface UploadRow {
    readonly id: string;
    readonly storage_path: string;
    readonly bucket: string;
    readonly original_filename: string;
    readonly byte_size: number;
    readonly content_type: string;
    readonly content_sha256: string | null;
    readonly created_at: string;
}
/**
 * Insert record for uploads table.
 * All fields required except SHA256 (for flexibility).
 */
export interface UploadInsert {
    readonly id?: string;
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
    readonly id: string;
    readonly upload_id: string | null;
    readonly status: ReportRunStatus;
    readonly period: string;
    readonly fact_bundle_path: string | null;
    readonly briefing_md_path: string | null;
    readonly briefing_pdf_path: string | null;
    readonly metadata: Json;
    readonly created_at: string;
    readonly updated_at: string;
}
/**
 * Insert record for report_runs table.
 * Period required; status defaults to "pending".
 */
export interface ReportRunInsert {
    readonly id?: string;
    readonly upload_id?: string | null;
    readonly status?: ReportRunStatus;
    readonly period: string;
    readonly fact_bundle_path?: string | null;
    readonly briefing_md_path?: string | null;
    readonly briefing_pdf_path?: string | null;
    readonly metadata?: Json;
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
    readonly upload_id?: string;
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
    readonly upload_id?: string;
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
    readonly upload_id?: string;
}
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
/**
 * AuditChallenge: A single issue flagged by the auditor.
 * Analyst will respond to each challenge by ID.
 */
export interface AuditChallenge {
    readonly id: string;
    readonly type: 'numerical' | 'hallucination' | 'assumption' | 'tradeoff' | 'policy';
    readonly section: string;
    readonly claim: string;
    readonly question: string;
    readonly evidence: string;
    readonly severity: 'error' | 'assumption' | 'concern';
    readonly requestedAction: string;
}
/**
 * BriefingAuditTrailRow: One iteration of the Analyst → Auditor cycle.
 * Captures proposals, challenges, and resolutions for full transparency.
 */
export interface BriefingAuditTrailRow {
    readonly id: string;
    readonly report_run_id: string;
    readonly iteration: number;
    readonly analyst_archetype: string;
    readonly auditor_archetype: string;
    readonly analyst_proposal: Json;
    readonly analyst_reasoning: string | null;
    readonly analyst_submitted_at: string;
    readonly auditor_challenges: Json | null;
    readonly auditor_notes: string | null;
    readonly auditor_reviewed_at: string | null;
    readonly analyst_response: string | null;
    readonly resolution_type: string | null;
    readonly resolved_at: string | null;
    readonly auditor_approved: boolean | null;
    readonly escalation_reason: string | null;
    readonly is_final: boolean;
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
/**
 * AuditChallenge: A single issue flagged by the auditor.
 * Analyst will respond to each challenge by ID.
 */
export interface AuditChallenge {
    readonly id: string;
    readonly type: 'numerical' | 'hallucination' | 'assumption' | 'tradeoff' | 'policy';
    readonly claim: string;
    readonly question: string;
    readonly evidence: string;
    readonly severity: 'error' | 'assumption' | 'concern';
    readonly requestedAction: string;
}
/**
 * BriefingBlackboardRow: Master briefing state with section-level approval tracking.
 * Analyst and Auditor work independently on each section.
 * Conflicts are explicitly tracked for CEO visibility.
 */
export interface BriefingBlackboardRow {
    readonly id: string;
    readonly report_run_id: string;
    readonly iteration: number;
    readonly overall_status: 'in-progress' | 'under-review' | 'responding' | 'ready-for-approval' | 'approved' | 'escalated-to-ceo';
    readonly sections: Json;
    readonly conflicts: Json;
    readonly approval_summary: Json;
    readonly analyst_submitted_at: string | null;
    readonly auditor_started_review_at: string | null;
    readonly auditor_completed_review_at: string | null;
    readonly analyst_started_response_at: string | null;
    readonly analyst_completed_response_at: string | null;
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
    readonly id: string;
    readonly blackboard_id: string;
    readonly section_id: string;
    readonly title: string;
    readonly analyst_draft: string | null;
    readonly analyst_reasoning: string | null;
    readonly analyst_submitted_at: string | null;
    readonly auditor_status: string | null;
    readonly auditor_challenges: Json | null;
    readonly auditor_notes: string | null;
    readonly auditor_reviewed_at: string | null;
    readonly analyst_response: string | null;
    readonly analyst_responded_at: string | null;
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
//# sourceMappingURL=types.d.ts.map