import { Anthropic } from "@anthropic-ai/sdk";
import type { AuditResult, BriefingState } from "./types.js";
import { AUDITOR_SYSTEM_PROMPT } from "./prompts.js";
import { withTimeout } from "../lib/timeout.js";

/**
 * Auditor node: Verify BriefingDraft against FactBundle.
 * Checks: numerical accuracy, no hallucinations, logic consistency, citation format.
 * Timeout: 1 minute
 * Returns: updated state with auditResult and approved flag
 */
export async function runAuditorNode(
  state: BriefingState,
  env: { ANTHROPIC_API_KEY: string; LLM_MODEL: string; LLM_TEMPERATURE: number },
): Promise<Partial<BriefingState>> {
  if (!state.analystDraft) {
    throw new Error("No analyst draft to audit");
  }

  const client = new Anthropic({
    apiKey: env.ANTHROPIC_API_KEY,
  });

  const briefingJson = JSON.stringify(state.analystDraft, null, 2);
  const factBundleJson = JSON.stringify(state.factBundle, null, 2);

  const userMessage = `Verify this briefing draft against the FactBundle using the 4 checks: numerical accuracy, hallucination detection, logic consistency, and citation format.

Briefing Draft:
${briefingJson}

FactBundle (source of truth):
${factBundleJson}

Return the JSON audit result with approved (true/false), corrections array, and checklist.`;

  try {
    const response = await withTimeout(
      client.messages.create({
        model: env.LLM_MODEL,
        max_tokens: 2000,
        temperature: 0.1, // Strict verification mode (override env default)
        system: AUDITOR_SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: userMessage,
          },
        ],
      }),
      60000, // 1 minute
    );

    // Extract JSON from response
    if (!response.content || response.content.length === 0) {
      throw new Error("Empty response from Auditor");
    }

    const firstContent = response.content[0] || null;
    if (!firstContent || firstContent.type !== "text") {
      throw new Error("Expected text response from Auditor");
    }

    // Type guard: assert content is TextBlock
    const textContent = firstContent as { type: "text"; text: string };

    // Parse JSON from response (may be wrapped in markdown code block)
    let jsonStr = textContent.text;
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch && jsonMatch[1]) {
      jsonStr = jsonMatch[1];
    }

    const auditResult: AuditResult = JSON.parse(jsonStr);

    return {
      auditResult,
      approved: auditResult.approved,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message.includes("timeout")) {
      return {
        error: "Auditor node timeout (1 minute exceeded)",
        timeout: true,
      };
    }
    throw new Error(`Auditor node failed: ${message}`);
  }
}
