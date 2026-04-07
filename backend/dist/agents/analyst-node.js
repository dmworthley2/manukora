import { Anthropic } from "@anthropic-ai/sdk";
import { ANALYST_SYSTEM_PROMPT } from "./prompts.js";
import { withTimeout } from "../lib/timeout.js";
/**
 * Analyst node: Transform FactBundle → 5 AnalystDraftedSection[] with reasoning and certainty factors.
 * Blackboard pattern: All 5 sections generated in one LLM call.
 * Timeout: 2 minutes
 * Returns: updated state with analystDraft (array of sections)
 */
export async function runAnalystNode(state, env) {
    if (!env.ANTHROPIC_API_KEY) {
        throw new Error("ANTHROPIC_API_KEY is required for analyst node");
    }
    const client = new Anthropic({
        apiKey: env.ANTHROPIC_API_KEY,
    });
    const factBundleJson = JSON.stringify(state.factBundle, null, 2);
    // Build rich inventory context for reasoning-based analysis
    const inventoryContext = state.inventoryReasoningFeed && state.inventoryReasoningFeed.length > 0
        ? `\n\n## Inventory Context (Reasoning-Based Decision Support)\n\nPre-calculated metrics for CFO-level capital allocation decisions:\n\n${state.inventoryReasoningFeed
            .map((row) => {
            const daysOfCover = Math.round(row.months_of_cover * 30);
            const targetDays = row.target_months_cover * 30;
            const daysUntilBelowTarget = daysOfCover - targetDays;
            const isGrowing = row.momentum_trend === "GROWING";
            const isDeclining = row.momentum_trend === "DECLINING";
            const m1Sales = row.m1_total || 0;
            const m4Sales = row.current_demand || 0;
            const growthRate = m1Sales > 0 ? Math.round(((m4Sales - m1Sales) / m1Sales) * 100) : 0;
            const declineRate = m1Sales > 0 ? Math.round(((m1Sales - m4Sales) / m1Sales) * 100) : 0;
            const monthlyBurn = row.current_demand || 0;
            const daysUntilStockout = monthlyBurn > 0 ? Math.round((row.stock_on_hand / monthlyBurn) * 30) : 999;
            const isPhaseout = row.product_name?.toLowerCase().includes("propolis") ||
                row.sku?.toLowerCase().includes("propolis");
            const isPremium = row.sku?.toLowerCase().includes("1700");
            const isBioactive = row.product_name?.toLowerCase().includes("bioactive") ||
                row.sku?.toLowerCase().includes("immunity") ||
                row.sku?.toLowerCase().includes("energy") ||
                row.sku?.toLowerCase().includes("recovery");
            const onOrderNotYetArrived = row.units_on_order > 0 ? `, next shipment arrives in ${row.order_arrival_months} month(s)` : "";
            const leadTimeGap = row.units_on_order === 0 && row.order_arrival_months > 0
                ? ` (CRITICAL: typical lead time ~${row.order_arrival_months} months)`
                : "";
            let specialNote = "";
            if (isPhaseout) {
                specialNote =
                    "\n  ⚠️  SPECIAL CASE: Propolis being phased out Q2 2026. Deprioritize reorder unless cover <30 days.";
            }
            else if (isPremium) {
                specialNote =
                    "\n  ⚠️  SPECIAL CASE: Premium pricing. Target is 3-month cover (90 days), not standard 2 months.";
            }
            else if (isBioactive) {
                specialNote =
                    "\n  ⚠️  SPECIAL CASE: New launch (Jan 2026). Evaluate trend on M2–M4 data only (M1 is pre-launch).";
            }
            return `- **${row.product_name}** (${row.sku})
  Current State: ${row.stock_on_hand} units on hand${onOrderNotYetArrived} | Total pipeline: ${row.total_pipeline} units
  Burn Rate: ${monthlyBurn} units/month (M4) | Cover: ${daysOfCover} days (target: ${targetDays} days)
  Timing: Stockout in ${daysUntilStockout} days${daysUntilBelowTarget > 0 ? ` | Below-target in ${daysUntilBelowTarget} days` : " | ALREADY BELOW TARGET"}${leadTimeGap}
  Revenue: $${Math.round(row.retail_price_usd * monthlyBurn).toLocaleString()}/month at stake (price: $${row.retail_price_usd}, demand: ${monthlyBurn} units)
  Momentum: ${row.momentum_trend} (${isGrowing ? `+${growthRate}%` : isDeclining ? `-${declineRate}%` : "Stable"} M1→M4: ${m1Sales}→${m4Sales} units)
  Reorder Required: ${row.reorder_required ? "YES — CRITICAL" : "No — Adequate cover"}${specialNote}`;
        })
            .join("\n\n")}`
        : "";
    let userMessage;
    if (state.auditorReviews && state.auditorReviews.length > 0) {
        // Revision: Respond to auditor challenges per section
        // Build a summary of challenges for context
        const challengeSummary = state.auditorReviews
            .filter(review => review.auditor_challenges && review.auditor_challenges.length > 0)
            .map(review => `Section: ${review.section_id}\nChallenges:\n${review.auditor_challenges.map(ch => `  - ${ch.id} (${ch.type}): ${ch.question}`).join('\n')}`)
            .join('\n\n');
        userMessage = `The auditor has reviewed your initial draft and raised challenges. Respond to each challenge below, addressing the specific concern identified.

${challengeSummary}

Revise the affected sections to respond to these challenges. For each challenge, explain your position clearly:
- If you agree, fix the issue and state the correction explicitly
- If you disagree, explain your reasoning respectfully
- For assumptions, state them explicitly (e.g., "Assuming 60-day lead time from Standard Supplier")

Regenerate the full 5 sections, incorporating your responses. Each section should include analyst_draft and analyst_reasoning with updated certainty factors as appropriate.

FactBundle (period: ${state.period}):
${factBundleJson}${inventoryContext}

Generate the 5 sections JSON as specified in the system prompt.`;
    }
    else {
        // Initial generation
        userMessage = `Transform this FactBundle into a 5-section briefing with reasoning and certainty factors. All 5 sections are generated in one call.

FactBundle (period: ${state.period}):
${factBundleJson}${inventoryContext}

Generate the 5-section JSON with analyst_draft and analyst_reasoning for each section, including certainty factors [CERTAINTY: HIGH/MEDIUM/LOW] as specified in the system prompt.`;
    }
    try {
        const llmResponse = await withTimeout(client.messages.create({
            model: env.LLM_MODEL,
            max_tokens: 2000,
            temperature: env.LLM_TEMPERATURE,
            system: ANALYST_SYSTEM_PROMPT,
            messages: [
                {
                    role: "user",
                    content: userMessage,
                },
            ],
        }), 120000);
        // Extract JSON from response
        if (!llmResponse.content || llmResponse.content.length === 0) {
            throw new Error("Empty response from Analyst");
        }
        const firstContent = llmResponse.content[0] || null;
        if (!firstContent || firstContent.type !== "text") {
            throw new Error("Expected text response from Analyst");
        }
        // Type guard: assert content is TextBlock
        const textContent = firstContent;
        // Parse JSON from response (may be wrapped in markdown code block)
        let jsonStr = textContent.text;
        const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch && jsonMatch[1]) {
            jsonStr = jsonMatch[1];
        }
        const response = JSON.parse(jsonStr);
        // Validate we got all 5 sections
        if (!response.sections || !Array.isArray(response.sections) || response.sections.length !== 5) {
            throw new Error(`Expected 5 sections in response, got ${response.sections?.length || 0}`);
        }
        // Validate each section has required fields
        for (const section of response.sections) {
            if (!section.section_id || !section.title || !section.analyst_draft) {
                throw new Error(`Section ${section.section_id || '(unknown)'} missing required field: section_id, title, or analyst_draft`);
            }
        }
        return {
            analystDraft: response.sections,
            iterationCount: state.iterationCount + 1,
        };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        if (message.includes("timeout")) {
            return {
                error: "Analyst node timeout (2 minutes exceeded)",
                timeout: true,
            };
        }
        throw new Error(`Analyst node failed: ${message}`);
    }
}
//# sourceMappingURL=analyst-node.js.map