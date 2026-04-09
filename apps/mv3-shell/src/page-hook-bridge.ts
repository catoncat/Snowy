import type {
  ActiveTabMetadata,
  InjectionStep,
  SiteInstallation,
  SiteScriptInvocationRequest,
  SiteWorld,
} from "@bbl-next/site-runtime";

const DEFAULT_PAGE_HOOK_KEY = "__BBL_NEXT_PAGE_HOOK__";
const DEFAULT_PAGE_HOOK_FILE = "src/page-hook.js";

type ExecutionWorld = "MAIN" | "ISOLATED";

type ExecuteScriptArgs = {
  tabId: number;
  world: SiteWorld;
  files?: string[];
  func?: (...args: any[]) => unknown;
  args?: unknown[];
};

type ExecuteScriptResult<T = unknown> = { result?: T };

type ChromeScriptingApi = {
  executeScript<T = unknown>(request: {
    target: { tabId: number };
    world: ExecutionWorld;
    files?: string[];
    func?: (...args: unknown[]) => unknown;
    args?: unknown[];
  }): Promise<Array<ExecuteScriptResult<T>> | T>;
};

type ChromeApiLike = {
  scripting?: ChromeScriptingApi;
};

type PageHookApi = {
  install(step: InjectionStep, tab: ActiveTabMetadata): unknown;
  invoke(
    installationId: string,
    action: string,
    input: unknown,
    ctx: Record<string, unknown>,
  ): unknown;
  verify(installationId: string, action: string, result: unknown): unknown;
  state?: unknown;
};

type PageHookVerifyRequest = {
  installation: SiteInstallation;
  action: string;
  result: unknown;
  tab: ActiveTabMetadata;
};

export interface PageHookBridge {
  install(step: InjectionStep, tab: ActiveTabMetadata): Promise<unknown>;
  invoke(request: SiteScriptInvocationRequest): Promise<unknown>;
  verify(request: PageHookVerifyRequest): Promise<boolean>;
  snapshotState(request: { tabId: number; world?: SiteWorld }): Promise<unknown>;
}

function siteWorldToExecutionWorld(world: SiteWorld): ExecutionWorld {
  return world === "main" ? "MAIN" : "ISOLATED";
}

function unwrapExecuteScriptResult<T>(result: Array<ExecuteScriptResult<T>> | T): T | undefined {
  if (Array.isArray(result)) {
    return result[0]?.result;
  }
  return result;
}

function getInstallationId(installation: SiteInstallation): string | undefined {
  const result = installation.result;
  if (!result || typeof result !== "object" || !("installationId" in result)) {
    return undefined;
  }
  return typeof result.installationId === "string" ? result.installationId : undefined;
}

export function createPageHookBridge({
  chromeApi = (globalThis as { chrome?: ChromeApiLike }).chrome,
  hookKey = DEFAULT_PAGE_HOOK_KEY,
  defaultFile = DEFAULT_PAGE_HOOK_FILE,
}: {
  chromeApi?: ChromeApiLike;
  hookKey?: string;
  defaultFile?: string;
} = {}): PageHookBridge {
  if (!chromeApi?.scripting?.executeScript) {
    throw new Error("chrome.scripting.executeScript is required for page hook injection");
  }
  const scripting = chromeApi.scripting;

  async function executeInTab<T>({
    tabId,
    world,
    files,
    func,
    args = [],
  }: ExecuteScriptArgs): Promise<T | undefined> {
    const executionResult = await scripting.executeScript<T>({
      target: { tabId },
      world: siteWorldToExecutionWorld(world),
      ...(files ? { files } : { func, args }),
    });
    return unwrapExecuteScriptResult<T>(executionResult);
  }

  async function install(step: InjectionStep, tab: ActiveTabMetadata) {
    const jsPath = step.jsPath ?? defaultFile;
    await executeInTab({
      tabId: tab.tabId,
      world: step.world,
      files: [jsPath],
    });
    return executeInTab({
      tabId: tab.tabId,
      world: step.world,
      func: (
        installedHookKey: string,
        installedStep: InjectionStep,
        installedTab: ActiveTabMetadata,
      ) => {
        const api = (globalThis as Record<string, unknown>)[installedHookKey] as
          | PageHookApi
          | undefined;
        if (!api || typeof api.install !== "function") {
          throw new Error(`Page hook ${installedHookKey} is not installed`);
        }
        return api.install(installedStep, installedTab);
      },
      args: [hookKey, { ...step, jsPath }, tab],
    });
  }

  async function invoke({ installation, action, input, tab, ctx }: SiteScriptInvocationRequest) {
    const installationId = getInstallationId(installation);
    if (typeof installationId !== "string") {
      throw new Error("Page hook installation is missing installationId");
    }
    return executeInTab({
      tabId: tab.tabId,
      world: installation.step.world,
      func: (
        installedHookKey: string,
        installedId: string,
        installedAction: string,
        installedInput: unknown,
        installedCtx: Record<string, unknown>,
      ) => {
        const api = (globalThis as Record<string, unknown>)[installedHookKey] as
          | PageHookApi
          | undefined;
        if (!api || typeof api.invoke !== "function") {
          throw new Error(`Page hook ${installedHookKey} does not expose invoke()`);
        }
        return api.invoke(installedId, installedAction, installedInput, installedCtx);
      },
      args: [hookKey, installationId, action, input, ctx],
    });
  }

  async function verify({
    installation,
    action,
    result,
    tab,
  }: PageHookVerifyRequest): Promise<boolean> {
    const installationId = getInstallationId(installation);
    if (typeof installationId !== "string") {
      throw new Error("Page hook installation is missing installationId");
    }
    return Boolean(
      await executeInTab({
        tabId: tab.tabId,
        world: installation.step.world,
        func: (
          installedHookKey: string,
          installedId: string,
          installedAction: string,
          installedResult: unknown,
        ) => {
          const api = (globalThis as Record<string, unknown>)[installedHookKey] as
            | PageHookApi
            | undefined;
          if (!api || typeof api.verify !== "function") {
            throw new Error(`Page hook ${installedHookKey} does not expose verify()`);
          }
          return api.verify(installedId, installedAction, installedResult);
        },
        args: [hookKey, installationId, action, result],
      }),
    );
  }

  async function snapshotState({
    tabId,
    world = "main",
  }: {
    tabId: number;
    world?: SiteWorld;
  }) {
    return executeInTab({
      tabId,
      world,
      func: (installedHookKey: string) =>
        ((globalThis as Record<string, unknown>)[installedHookKey] as PageHookApi | undefined)
          ?.state ?? null,
      args: [hookKey],
    });
  }

  return {
    install,
    invoke,
    verify,
    snapshotState,
  };
}
