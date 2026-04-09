import type {
  LlmProfileConfig,
  LlmProfileDef,
  LlmResolvedRoute,
  ResolveLlmRouteResult,
} from "@bbl-next/contracts";
import type { LlmProviderRegistry } from "./llm-provider-registry.js";

const DEFAULT_TIMEOUT_MS = 30_000;
const MIN_TIMEOUT_MS = 1_000;
const MAX_TIMEOUT_MS = 300_000;

const DEFAULT_RETRY_MAX = 3;
const MIN_RETRY = 0;
const MAX_RETRY = 6;

const DEFAULT_MAX_RETRY_DELAY_MS = 4_000;

export interface ResolveLlmRouteOptions {
  providerRegistry?: LlmProviderRegistry;
  requiredCapabilities?: string[];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeCapabilities(capabilities: string[] | undefined): string[] {
  return Array.from(
    new Set((capabilities ?? []).map((value) => String(value || "").trim()).filter(Boolean)),
  );
}

function buildOrderedProfiles(config: LlmProfileConfig, targetProfile: string): string[] {
  const orderedProfiles = [targetProfile];
  if (config.fallbackProfile && config.fallbackProfile !== targetProfile) {
    orderedProfiles.push(config.fallbackProfile);
  }
  return orderedProfiles;
}

function findProfile(config: LlmProfileConfig, profileId: string): LlmProfileDef | undefined {
  return config.profiles.find((profile) => profile.id === profileId);
}

function createResolvedRoute(
  profileDef: LlmProfileDef,
  profileId: string,
  role: string,
  orderedProfiles: string[],
): ResolveLlmRouteResult {
  const llmBase = String(profileDef.llmBase || "").trim();
  const llmKey = String(profileDef.llmKey || "").trim();
  const llmModel = String(profileDef.llmModel || "").trim();

  if (!llmBase || !llmModel) {
    return {
      ok: false,
      reason: "missing_llm_config",
      message: `LLM profile ${profileId} is missing llmBase or llmModel`,
      profile: profileId,
    };
  }

  const route: LlmResolvedRoute = {
    profile: profileId,
    provider: profileDef.providerId || "openai_compatible",
    llmBase,
    llmKey,
    llmModel,
    providerOptions: profileDef.providerOptions,
    llmTimeoutMs: clamp(
      profileDef.llmTimeoutMs ?? DEFAULT_TIMEOUT_MS,
      MIN_TIMEOUT_MS,
      MAX_TIMEOUT_MS,
    ),
    llmRetryMaxAttempts: clamp(
      profileDef.llmRetryMaxAttempts ?? DEFAULT_RETRY_MAX,
      MIN_RETRY,
      MAX_RETRY,
    ),
    llmMaxRetryDelayMs: profileDef.llmMaxRetryDelayMs ?? DEFAULT_MAX_RETRY_DELAY_MS,
    role,
    escalationPolicy: orderedProfiles.length > 1 ? "upgrade_only" : "disabled",
    orderedProfiles,
  };

  return { ok: true, route };
}

function isEligibleProviderRoute(
  providerRegistry: LlmProviderRegistry | undefined,
  providerId: string,
  requiredCapabilities: string[],
): boolean {
  if (!providerRegistry) {
    return requiredCapabilities.length === 0;
  }

  const state = providerRegistry.getState(providerId);
  if (!state || state.healthStatus === "down") {
    return false;
  }

  return requiredCapabilities.every((capability) => state.capabilities.includes(capability));
}

export function resolveLlmRoute(
  config: LlmProfileConfig,
  profileId?: string,
  role = "worker",
  options: ResolveLlmRouteOptions = {},
): ResolveLlmRouteResult {
  const targetProfile = profileId || config.defaultProfile || "default";
  const initialProfile = findProfile(config, targetProfile);
  if (!initialProfile) {
    return {
      ok: false,
      reason: "profile_not_found",
      message: `LLM profile not found: ${targetProfile}`,
      profile: targetProfile,
    };
  }

  const orderedProfiles = buildOrderedProfiles(config, targetProfile);
  const requiredCapabilities = normalizeCapabilities(options.requiredCapabilities);

  for (const candidateProfileId of orderedProfiles) {
    const profileDef = findProfile(config, candidateProfileId);
    if (!profileDef) {
      continue;
    }

    const candidateRoute = createResolvedRoute(
      profileDef,
      candidateProfileId,
      role,
      orderedProfiles,
    );
    if (!candidateRoute.ok) {
      if (candidateProfileId === targetProfile) {
        return candidateRoute;
      }
      continue;
    }

    if (
      !isEligibleProviderRoute(
        options.providerRegistry,
        candidateRoute.route.provider,
        requiredCapabilities,
      )
    ) {
      continue;
    }

    return candidateRoute;
  }

  const capabilityClause =
    requiredCapabilities.length > 0
      ? ` with required capabilities: ${requiredCapabilities.join(", ")}`
      : "";

  return {
    ok: false,
    reason: "route_unavailable",
    message: `No eligible LLM route found for profile ${targetProfile}${capabilityClause}`,
    profile: targetProfile,
  };
}
