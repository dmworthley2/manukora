/**
 * Inventory Service
 * Handles database operations for product catalog, inventory state, sales history,
 * and provides access to the agent reasoning feed view.
 */
import type { SupabaseAdminClient } from "../supabase/admin-client.js";
import type { ProductCatalogInsert, InventoryStateInsert, SalesHistoryInsert, AgentReasoningFeedRow } from "../db/types.js";
/**
 * Upsert product catalog entries from parsed CSV data.
 * Replaces existing entries for these SKUs.
 */
export declare function upsertProductCatalog(client: SupabaseAdminClient, products: readonly ProductCatalogInsert[]): Promise<{
    success: boolean;
    error?: string;
}>;
/**
 * Upsert inventory state (current snapshot).
 * One row per SKU (replaces entire inventory state for these SKUs).
 */
export declare function upsertInventoryState(client: SupabaseAdminClient, inventory: readonly InventoryStateInsert[]): Promise<{
    success: boolean;
    error?: string;
}>;
/**
 * Upsert sales history records (append, don't replace).
 * Each row is (sku, channel, month_period, units_sold).
 * Uses composite key to handle re-uploads gracefully (idempotent).
 */
export declare function insertSalesHistory(client: SupabaseAdminClient, sales: readonly SalesHistoryInsert[]): Promise<{
    success: boolean;
    count: number;
    error?: string;
}>;
/**
 * Query the agent_reasoning_feed view.
 * Returns all SKUs with pre-calculated metrics for inventory analysis.
 * Used by analysis phase and briefing agent.
 */
export declare function queryAgentReasoningFeed(client: SupabaseAdminClient): Promise<AgentReasoningFeedRow[] | null>;
/**
 * Get a single SKU's reasoning row.
 * Returns null if SKU not found or error occurs.
 */
export declare function getSkuReasoning(client: SupabaseAdminClient, sku: string): Promise<AgentReasoningFeedRow | null>;
//# sourceMappingURL=inventory.d.ts.map