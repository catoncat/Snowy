import type {
  LlmProfileConfig,
  LlmResolvedRoute,
  ResolveLlmRouteResult,
} from "@bbl-next/contracts";

const DEFAULT_TIMEOUT_MS = 30_000;
const MIN_TIMEOUT_MS = 1_000;
const MAX_TIMEOUT_MS = 300_000;

const DEFAULT_RETRY_MAX = 3;
const MIN_RETRY = 0;
const MAX_RETRY = 6;

const DEFAULT_MAX_RETRY_DELAY_MS = 4_000;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function resolveLlmRoute(
  config: LlmProfileConfig,
  profileId?: string,
  role = "worker",
): ResolveLlmRouteResult {
  const targetProfile = profileId || config.defaultProfile || "default";

  const profileDef = config.profiles.find((p) => p.id === targetProfile);
  if (!profileDef) {
    return {
      ok: false,
      reason: "profile_not_found",
      message: `LLM profile not found: ${targetProfile}`,
      profile: targetProfile,
    };
  }

  const llmBase = String(profileDef.llmBase || "").trim();
  const llmKey = String(profileDef.llmKey || "").trim();
  const llmModel = String(profileDef.llmModel || "").trim();

  if (!llmBase || !llmModel) {
    return {
      ok: false,
      reason: "missing_llm_config",
      message: `LLM profile ${targetProfile} is missing llmBase or llmModel`,
      profile: targetProfile,
    };
  }

  const orderedProfiles: string[] = [targetProfile];
  if (config.fallbackProfile && config.fallbackProfile !== targetProfile) {
    orderedProfiles.push(config.fallbackProfile);
  }

  const route: LlmResolvedRoute = {
    profile: targetProfile,
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
