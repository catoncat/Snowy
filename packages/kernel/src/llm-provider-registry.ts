import type { LlmProviderAdapter } from "@bbl-next/contracts";

export interface RegisterLlmProviderOptions {
  replace?: boolean;
}

export class LlmProviderRegistry {
  readonly #providers = new Map<string, LlmProviderAdapter>();

  register(provider: LlmProviderAdapter, options: RegisterLlmProviderOptions = {}): void {
    const id = String(provider?.id || "").trim();
    if (!id) throw new Error("llm provider id must not be empty");
    if (!options.replace && this.#providers.has(id)) {
      throw new Error(`llm provider already registered: ${id}`);
    }
    this.#providers.set(id, provider);
  }

  unregister(id: string): boolean {
    return this.#providers.delete(String(id || "").trim());
  }

  has(id: string): boolean {
    return this.#providers.has(String(id || "").trim());
  }

  get(id: string): LlmProviderAdapter | undefined {
    return this.#providers.get(String(id || "").trim());
  }

  list(): Array<{ id: string }> {
    return Array.from(this.#providers.keys()).map((id) => ({ id }));
  }
}
