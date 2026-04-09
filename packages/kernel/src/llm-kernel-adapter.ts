import type { KernelLlmAdapter, LlmProfileConfig } from "@bbl-next/contracts";
import { resolveLlmRoute } from "./llm-profile-resolver.js";
import type { LlmProviderRegistry } from "./llm-provider-registry.js";
import { readLlmMessageFromSseStream } from "./llm-stream-parser.js";

function withTimeout(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    if (!controller.signal.aborted) {
      controller.abort(new DOMException("The operation timed out.", "TimeoutError"));
    }
  }, timeoutMs);

  const clear = () => clearTimeout(timeoutId);
  controller.signal.addEventListener("abort", clear, { once: true });

  if (!signal) {
    return controller.signal;
  }

  if (signal.aborted) {
    controller.abort(signal.reason);
    return controller.signal;
  }

  const onAbort = () => controller.abort(signal.reason);
  signal.addEventListener("abort", onAbort, { once: true });
  controller.signal.addEventListener("abort", () => signal.removeEventListener("abort", onAbort), {
    once: true,
  });

  return controller.signal;
}

/**
 * Bridge the provider/profile layer into the kernel's KernelLlmAdapter interface.
 *
 * This is the canonical integration path: provider registry + profile config → KernelLlmAdapter
 * that can be injected into createKernel().
 */
export function createKernelLlmFromProvider(
  registry: LlmProviderRegistry,
  profileConfig: LlmProfileConfig,
  profileId?: string,
): KernelLlmAdapter {
  return {
    async complete({ systemPrompt, messages, maxTokens, signal }) {
      const routeResult = resolveLlmRoute(profileConfig, profileId);
      if (!routeResult.ok) {
        throw new Error(`LLM route resolution failed: ${routeResult.message}`);
      }

      const { route } = routeResult;
      const provider = registry.get(route.provider);
      if (!provider) {
        throw new Error(`LLM provider not found: ${route.provider}`);
      }

      const apiMessages: Array<Record<string, unknown>> = [
        { role: "system", content: systemPrompt },
        ...messages.map((m) => ({ role: m.role, content: m.content })),
      ];

      const response = await provider.send({
        route,
        payload: {
          model: route.llmModel,
          messages: apiMessages,
          stream: true,
          ...(maxTokens != null ? { max_tokens: maxTokens } : {}),
        },
        signal: withTimeout(signal, route.llmTimeoutMs),
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(`LLM request failed (${response.status}): ${body}`);
      }

      if (!response.body) {
        throw new Error("LLM response has no body");
      }

      const result = await readLlmMessageFromSseStream(response.body);
      return String(result.message.content ?? "");
    },
  };
}
