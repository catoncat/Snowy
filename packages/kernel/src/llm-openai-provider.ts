import type { LlmProviderAdapter, LlmProviderSendInput } from "@bbl-next/contracts";

export function createOpenAiCompatibleProvider(
  providerId = "openai_compatible",
): LlmProviderAdapter {
  const id = String(providerId || "").trim() || "openai_compatible";
  return {
    id,
    resolveRequestUrl(route) {
      const base = String(route.llmBase || "")
        .trim()
        .replace(/\/+$/, "");
      return `${base}/chat/completions`;
    },
    async send(input: LlmProviderSendInput): Promise<Response> {
      const requestUrl =
        String(input.requestUrl || "").trim() || this.resolveRequestUrl(input.route);
      const llmKey = String(input.route.llmKey || "").trim();
      const headers: Record<string, string> = {
        "content-type": "application/json",
      };
      if (llmKey) {
        headers.authorization = `Bearer ${llmKey}`;
      }
      return await fetch(requestUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(input.payload),
        signal: input.signal,
      });
    },
  };
}
