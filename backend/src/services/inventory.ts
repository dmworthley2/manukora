/**
 * Inventory Service
 * Handles database operations for product catalog, inventory state, sales history,
 * and provides access to the agent reasoning feed view.
 */

import type { SupabaseAdminClient } from "../supabase/admin-client.js";
import type {
  ProductCatalogInsert,
  InventoryStateInsert,
  SalesHistoryInsert,
  AgentReasoningFeedRow,
} from "../db/types.js";
import { log } from "../lib/log.js";

// ============================================================================
// PRODUCT CATALOG OPERATIONS
// ============================================================================

/**
 * Upsert product catalog entries from parsed CSV data.
 * Replaces existing entries for these SKUs.
 */
export async function upsertProductCatalog(
  client: SupabaseAdminClient,
  products: readonly ProductCatalogInsert[],
): Promise<{ success: boolean; error?: string }> {
  if (products.length === 0) {
    return { success: true };
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (client
      .from("product_catalog")
      .upsert(products as any[], { onConflict: "sku,upload_id" }) as any);

    if (error) {
      log.error("product_catalog.upsert failed", { errorMessage: error.message });
      return { success: false, error: error.message };
    }

    log.info("product_catalog upserted", { count: products.length });
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error("product_catalog.upsert exception", { error: message });
    return { success: false, error: message };
  }
}

// ============================================================================
// INVENTORY STATE OPERATIONS
// ============================================================================

/**
 * Upsert inventory state (current snapshot).
 * One row per SKU (replaces entire inventory state for these SKUs).
 */
export async function upsertInventoryState(
  client: SupabaseAdminClient,
  inventory: readonly InventoryStateInsert[],
): Promise<{ success: boolean; error?: string }> {
  if (inventory.length === 0) {
    return { success: true };
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (client
      .from("inventory_state")
      .upsert(inventory as any[], { onConflict: "sku,upload_id" }) as any);

    if (error) {
      log.error("inventory_state.upsert failed", { errorMessage: error.message });
      return { success: false, error: error.message };
    }

    log.info("inventory_state upserted", { count: inventory.length });
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error("inventory_state.upsert exception", { error: message });
    return { success: false, error: message };
  }
}

// ============================================================================
// SALES HISTORY OPERATIONS
// ============================================================================

/**
 * Insert sales history records (append, don't replace).
 * Each row is (sku, channel, month_period, units_sold).
 * Uses UNIQUE constraint to handle re-uploads gracefully (ignores duplicates).
 */
export async function insertSalesHistory(
  client: SupabaseAdminClient,
  sales: readonly SalesHistoryInsert[],
): Promise<{ success: boolean; count: number; error?: string }> {
  if (sales.length === 0) {
    return { success: true, count: 0 };
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error, data } = await (client
      .from("sales_history")
      .insert(sales as any[]) as any)
      .select();

    if (error) {
      log.error("sales_history.insert failed", { errorMessage: error.message });
      return { success: false, count: 0, error: error.message };
    }

    const count = Array.isArray(data) ? data.length : 0;
    log.info("sales_history inserted", { attempted: sales.length, inserted: count });
    return { success: true, count };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error("sales_history.insert exception", { error: message });
    return { success: false, count: 0, error: message };
  }
}

// ============================================================================
// AGENT REASONING FEED QUERIES
// ============================================================================

/**
 * Query the agent_reasoning_feed view.
 * Returns all SKUs with pre-calculated metrics for inventory analysis.
 * Used by analysis phase and briefing agent.
 */
export async function queryAgentReasoningFeed(
  client: SupabaseAdminClient,
): Promise<AgentReasoningFeedRow[] | null> {
  try {
    const { data, error } = await client.from("agent_reasoning_feed").select("*");

    if (error) {
      log.error("agent_reasoning_feed.select failed", { errorMessage: error.message });
      return null;
    }

    log.info("agent_reasoning_feed queried", { count: data ? data.length : 0 });
    return data ?? null;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error("agent_reasoning_feed.select exception", { error: message });
    return null;
  }
}

/**
 * Get a single SKU's reasoning row.
 * Returns null if SKU not found or error occurs.
 */
export async function getSkuReasoning(
  client: SupabaseAdminClient,
  sku: string,
): Promise<AgentReasoningFeedRow | null> {
  try {
    const { data, error } = await client
      .from("agent_reasoning_feed")
      .select("*")
      .eq("sku", sku)
      .maybeSingle();

    if (error) {
      log.error("agent_reasoning_feed.getSkuReasoning failed", { sku, errorMessage: error.message });
      return null;
    }

    return data ?? null;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error("agent_reasoning_feed.getSkuReasoning exception", { sku, error: message });
    return null;
  }
}
