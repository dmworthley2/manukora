import { describe, it, expect } from "vitest";
import { processCsv, inferFieldMapping } from "../services/csv-processor.js";
import type { CsvFieldMapping } from "./csv-parser.js";

describe("CSV processing pipeline", () => {
  const validCsv = `sku,period,units_sold,revenue,on_hand_inventory,retail_price,cogs
SKU001,2024-03,100,5000,500,50,25
SKU002,2024-03,50,2500,200,50,25
SKU001,2024-02,120,6000,600,50,25`;

  const fieldMapping: CsvFieldMapping = {
    sku: "sku",
    period: "period",
    unitsSold: "units_sold",
    revenue: "revenue",
    onHandInventory: "on_hand_inventory",
    retailPrice: "retail_price",
    cogs: "cogs",
  };

  it("parses valid CSV and builds fact bundle", () => {
    const buffer = Buffer.from(validCsv);
    const result = processCsv(buffer, { fieldMapping });

    expect(result.success).toBe(true);
    expect(result.factBundle).toBeDefined();
    expect(result.rows).toHaveLength(3);
    expect(result.errors).toHaveLength(0);
  });

  it("generates reorder recommendations", () => {
    const buffer = Buffer.from(validCsv);
    const result = processCsv(buffer, { fieldMapping });

    if (!result.factBundle) throw new Error("Expected fact bundle");

    expect(result.factBundle.reorderRecommendations.length).toBeGreaterThan(0);
    const rec = result.factBundle.reorderRecommendations[0];
    expect(rec).toHaveProperty("sku");
    expect(rec).toHaveProperty("reason");
    expect(rec).toHaveProperty("rationale");
  });

  it("infers field mapping from headers", () => {
    const headers = [
      "sku",
      "month",
      "qty_sold",
      "sales",
      "inventory",
      "list_price",
      "cost",
    ];
    const mapping = inferFieldMapping(headers);

    expect(mapping.sku).toBe("sku");
    expect(mapping.period).toBe("month");
    expect(mapping.unitsSold).toBe("qty_sold");
    expect(mapping.revenue).toBe("sales");
  });

  it("detects invalid data rows", () => {
    const invalidCsv = `sku,period,units_sold,revenue,on_hand_inventory,retail_price
SKU001,2024-03,invalid,5000,500,50`;

    const buffer = Buffer.from(invalidCsv);
    const result = processCsv(buffer, { fieldMapping });

    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("computes metrics correctly", () => {
    const buffer = Buffer.from(validCsv);
    const result = processCsv(buffer, { fieldMapping });

    if (!result.factBundle) throw new Error("Expected fact bundle");

    const metrics = result.factBundle.skuMetrics;
    const sku001Current = metrics.find((m) => m.sku === "SKU001" && m.period === "2024-03");

    expect(sku001Current).toBeDefined();
    expect(sku001Current?.avgSellingPrice).toBe(50); // 5000/100
    expect(sku001Current?.daysOfCover).toBeGreaterThan(0);
  });
});
