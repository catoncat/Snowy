const DEFAULT_PAGE_HOOK_KEY = "__BBL_NEXT_PAGE_HOOK__";
const DEFAULT_PAGE_HOOK_FILE = "src/page-hook.js";

function siteWorldToExecutionWorld(world) {
  return world === "main" ? "MAIN" : "ISOLATED";
}

function unwrapExecuteScriptResult(result) {
  if (Array.isArray(result)) {
    return result[0]?.result;
  }
  return result;
}

export function createPageHookBridge({
  chromeApi = globalThis.chrome,
  hookKey = DEFAULT_PAGE_HOOK_KEY,
  defaultFile = DEFAULT_PAGE_HOOK_FILE,
} = {}) {
  if (!chromeApi?.scripting?.executeScript) {
    throw new Error("chrome.scripting.executeScript is required for page hook injection");
  }

  async function executeInTab({ tabId, world, files, func, args = [] }) {
    const executionResult = await chromeApi.scripting.executeScript({
      target: { tabId },
      world: siteWorldToExecutionWorld(world),
      ...(files ? { files } : { func, args }),
    });
    return unwrapExecuteScriptResult(executionResult);
  }

  function getInstallationId(installation) {
    return installation?.result?.installationId;
  }

  async function install(step, tab) {
    const jsPath = step.jsPath ?? defaultFile;
    await executeInTab({
      tabId: tab.tabId,
      world: step.world,
      files: [jsPath],
    });
    return executeInTab({
      tabId: tab.tabId,
      world: step.world,
      func: (installedHookKey, installedStep, installedTab) => {
        const api = globalThis[installedHookKey];
        if (!api || typeof api.install !== "function") {
          throw new Error(`Page hook ${installedHookKey} is not installed`);
        }
        return api.install(installedStep, installedTab);
      },
      args: [hookKey, { ...step, jsPath }, tab],
    });
  }

  async function invoke({ installation, action, input, tab, ctx }) {
    const installationId = getInstallationId(installation);
    if (typeof installationId !== "string") {
      throw new Error("Page hook installation is missing installationId");
    }
    return executeInTab({
      tabId: tab.tabId,
      world: installation.step.world,
      func: (installedHookKey, installedId, installedAction, installedInput, installedCtx) => {
        const api = globalThis[installedHookKey];
        if (!api || typeof api.invoke !== "function") {
          throw new Error(`Page hook ${installedHookKey} does not expose invoke()`);
        }
        return api.invoke(installedId, installedAction, installedInput, installedCtx);
      },
      args: [hookKey, installationId, action, input, ctx],
    });
  }

  async function verify({ installation, action, result, tab }) {
    const installationId = getInstallationId(installation);
    if (typeof installationId !== "string") {
      throw new Error("Page hook installation is missing installationId");
    }
    return Boolean(
      await executeInTab({
        tabId: tab.tabId,
        world: installation.step.world,
        func: (installedHookKey, installedId, installedAction, installedResult) => {
          const api = globalThis[installedHookKey];
          if (!api || typeof api.verify !== "function") {
            throw new Error(`Page hook ${installedHookKey} does not expose verify()`);
          }
          return api.verify(installedId, installedAction, installedResult);
        },
        args: [hookKey, installationId, action, result],
      }),
    );
  }

  async function snapshotState({ tabId, world = "main" }) {
    return executeInTab({
      tabId,
      world,
      func: (installedHookKey) => {
        const api = globalThis[installedHookKey];
        return api?.state ?? null;
      },
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
