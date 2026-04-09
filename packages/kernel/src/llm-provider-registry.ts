import type { LlmProviderAdapter } from "@bbl-next/contracts";

const DEFAULT_HEALTH_STATUS = "healthy" as const;

export type LlmProviderHealthStatus = "healthy" | "degraded" | "down";

export interface LlmProviderState {
  healthStatus: LlmProviderHealthStatus;
  capabilities: string[];
}

interface RegisteredLlmProvider {
  provider: LlmProviderAdapter;
  state: LlmProviderState;
}

export interface RegisterLlmProviderOptions {
  replace?: boolean;
  healthStatus?: LlmProviderHealthStatus;
  capabilities?: string[];
}

function normalizeId(id: string): string {
  return String(id || "").trim();
}

function normalizeCapabilities(capabilities: string[] | undefined): string[] {
  return Array.from(
    new Set((capabilities ?? []).map((value) => String(value || "").trim()).filter(Boolean)),
  );
}

function cloneState(state: LlmProviderState): LlmProviderState {
  return {
    healthStatus: state.healthStatus,
    capabilities: [...state.capabilities],
  };
}

export class LlmProviderRegistry {
  readonly #providers = new Map<string, RegisteredLlmProvider>();

  register(provider: LlmProviderAdapter, options: RegisterLlmProviderOptions = {}): void {
    const id = normalizeId(provider?.id);
    if (!id) throw new Error("llm provider id must not be empty");

    const existing = this.#providers.get(id);
    if (!options.replace && existing) {
      throw new Error(`llm provider already registered: ${id}`);
    }

    this.#providers.set(id, {
      provider,
      state: {
        healthStatus: options.healthStatus ?? existing?.state.healthStatus ?? DEFAULT_HEALTH_STATUS,
        capabilities: normalizeCapabilities(options.capabilities ?? existing?.state.capabilities),
      },
    });
  }

  unregister(id: string): boolean {
    return this.#providers.delete(normalizeId(id));
  }

  has(id: string): boolean {
    return this.#providers.has(normalizeId(id));
  }

  get(id: string): LlmProviderAdapter | undefined {
    return this.#providers.get(normalizeId(id))?.provider;
  }

  getState(id: string): LlmProviderState | undefined {
    const entry = this.#providers.get(normalizeId(id));
    return entry ? cloneState(entry.state) : undefined;
  }

  setHealthStatus(id: string, healthStatus: LlmProviderHealthStatus): void {
    this.#require(id).state.healthStatus = healthStatus;
  }

  setCapabilities(id: string, capabilities: string[]): void {
    this.#require(id).state.capabilities = normalizeCapabilities(capabilities);
  }

  list(): Array<{ id: string; healthStatus: LlmProviderHealthStatus; capabilities: string[] }> {
    return Array.from(this.#providers.entries()).map(([id, entry]) => ({
      id,
      healthStatus: entry.state.healthStatus,
      capabilities: [...entry.state.capabilities],
    }));
  }

  #require(id: string): RegisteredLlmProvider {
    const normalizedId = normalizeId(id);
    const entry = this.#providers.get(normalizedId);
    if (!entry) {
      throw new Error(`llm provider not found: ${normalizedId}`);
    }
    return entry;
  }
}
