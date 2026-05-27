import type { LlmProviderAdapter, LlmProviderSendInput } from "@bbl-next/contracts";

type OpenAiCompatibleApi = "responses" | "chat_completions";

function normalizeApiMode(value: unknown): OpenAiCompatibleApi {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[.\s-]+/g, "_");
  if (normalized === "chat" || normalized === "chat_completions" || normalized === "completions") {
    return "chat_completions";
  }
  return "responses";
}

function resolveApiMode(input: LlmProviderSendInput | { route: LlmProviderSendInput["route"] }) {
  return normalizeApiMode(input.route.providerOptions?.api);
}

function normalizeEndpointBase(routeBase: string, api: OpenAiCompatibleApi): string {
  const base = String(routeBase || "")
    .trim()
    .replace(/\/+$/, "");
  if (api === "responses") {
    return base.replace(/\/chat\/completions$/i, "/responses");
  }
  return base.replace(/\/responses$/i, "/chat/completions");
}

function resolveEndpointPath(base: string, api: OpenAiCompatibleApi): string {
  if (api === "responses") {
    return /\/responses$/i.test(base) ? base : `${base}/responses`;
  }
  return /\/chat\/completions$/i.test(base) ? base : `${base}/chat/completions`;
}

function contentToText(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return "";
  }
  return content
    .map((block) => {
      if (!block || typeof block !== "object") {
        return "";
      }
      const value = block as Record<string, unknown>;
      return typeof value.text === "string" ? value.text : "";
    })
    .join("");
}

function chatMessagesToResponsesInput(messages: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(messages)) {
    return [];
  }

  const input: Array<Record<string, unknown>> = [];
  for (const message of messages) {
    if (!message || typeof message !== "object" || Array.isArray(message)) {
      continue;
    }
    const msg = message as Record<string, unknown>;
    const role = typeof msg.role === "string" ? msg.role : "user";

    if (role === "tool") {
      input.push({
        type: "function_call_output",
        call_id: String(msg.tool_call_id || ""),
        output: contentToText(msg.content),
      });
      continue;
    }

    const content = contentToText(msg.content);
    if (content) {
      input.push({ role, content });
    }

    const toolCalls = Array.isArray(msg.tool_calls) ? msg.tool_calls : [];
    for (const toolCall of toolCalls) {
      if (!toolCall || typeof toolCall !== "object" || Array.isArray(toolCall)) {
        continue;
      }
      const tc = toolCall as Record<string, unknown>;
      const fn = tc.function as Record<string, unknown> | undefined;
      input.push({
        type: "function_call",
        call_id: String(tc.id || ""),
        name: typeof fn?.name === "string" ? fn.name : "",
        arguments: typeof fn?.arguments === "string" ? fn.arguments : "",
      });
    }
  }
  return input;
}

function chatToolsToResponsesTools(tools: unknown): Array<Record<string, unknown>> | undefined {
  if (!Array.isArray(tools)) {
    return undefined;
  }

  return tools
    .map((tool) => {
      if (!tool || typeof tool !== "object" || Array.isArray(tool)) {
        return null;
      }
      const value = tool as Record<string, unknown>;
      if (value.type !== "function") {
        return value;
      }
      const fn = value.function as Record<string, unknown> | undefined;
      if (!fn) {
        return value;
      }
      return {
        type: "function",
        name: fn.name,
        description: fn.description,
        parameters: fn.parameters,
      };
    })
    .filter((tool): tool is Record<string, unknown> => tool !== null);
}

function toResponsesPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const { messages, max_tokens, tools, ...rest } = payload;
  const next: Record<string, unknown> = {
    ...rest,
    input: chatMessagesToResponsesInput(messages),
  };
  const responseTools = chatToolsToResponsesTools(tools);
  if (responseTools?.length) {
    next.tools = responseTools;
  } else {
    next.tool_choice = undefined;
  }
  if (max_tokens != null) {
    next.max_output_tokens = max_tokens;
  }
  return next;
}

export function createOpenAiCompatibleProvider(
  providerId = "openai_compatible",
): LlmProviderAdapter {
  const id = String(providerId || "").trim() || "openai_compatible";
  return {
    id,
    resolveRequestUrl(route) {
      const api = normalizeApiMode(route.providerOptions?.api);
      const base = normalizeEndpointBase(route.llmBase, api);
      return resolveEndpointPath(base, api);
    },
    async send(input: LlmProviderSendInput): Promise<Response> {
      const api = resolveApiMode(input);
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
        body: JSON.stringify(
          api === "responses" ? toResponsesPayload(input.payload) : input.payload,
        ),
        signal: input.signal,
      });
    },
  };
}
