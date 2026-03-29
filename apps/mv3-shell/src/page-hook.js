(function pageHook(globalScope) {
  const HOOK_KEY = "__BBL_NEXT_PAGE_HOOK__";
  const existing = globalScope[HOOK_KEY];
  if (existing && existing.version === "bridge-v1") {
    return;
  }

  const state = {
    installs: [],
    invocations: [],
    verifications: []
  };

  function getInstallation(installationId) {
    return state.installs.find((entry) => entry.installationId === installationId);
  }

  function install(step, tab) {
    const installationId = `${step.scriptId}:${state.installs.length + 1}`;
    const installed = {
      installationId,
      world: step.world,
      scriptId: step.scriptId,
      jsPath: step.jsPath ?? null,
      runAt: step.runAt ?? null,
      tabId: tab?.tabId ?? null,
      url: String(tab?.url || "")
    };
    state.installs.push(installed);
    return {
      installationId,
      installed
    };
  }

  function invoke(installationId, action, input, ctx) {
    const installed = getInstallation(installationId);
    if (!installed) {
      throw new Error(`Unknown installation: ${installationId}`);
    }
    const result = {
      ok: true,
      action,
      input,
      installationId,
      installedScriptId: installed.scriptId,
      tabUrl: String(ctx?.tab?.url || installed.url),
      installCount: state.installs.length
    };
    state.invocations.push(result);
    return result;
  }

  function verify(installationId, action, result) {
    const installed = getInstallation(installationId);
    if (!installed) {
      return false;
    }
    const verified = Boolean(
      result &&
        result.ok === true &&
        result.action === action &&
        result.installedScriptId === installed.scriptId &&
        result.installationId === installationId
    );
    state.verifications.push({
      action,
      verified
    });
    return verified;
  }

  globalScope[HOOK_KEY] = {
    version: "bridge-v1",
    state,
    install
    ,invoke,
    verify
  };

  console.log("BBL Next page hook ready");
})(globalThis);
