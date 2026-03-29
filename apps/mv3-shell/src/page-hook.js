(function pageHook(globalScope) {
  const HOOK_KEY = "__BBL_NEXT_PAGE_HOOK__";
  const existing = globalScope[HOOK_KEY];
  if (existing && existing.version === "fixture-v1") {
    return;
  }

  const state = {
    installs: [],
    invocations: [],
    verifications: []
  };

  function install(step, tab) {
    const installed = {
      world: step.world,
      scriptId: step.scriptId,
      runAt: step.runAt ?? null,
      tabId: tab?.tabId ?? null,
      url: String(tab?.url || "")
    };
    state.installs.push(installed);
    return {
      installed,
      run(action, input, ctx) {
        const result = {
          ok: true,
          action,
          input,
          installedScriptId: installed.scriptId,
          tabUrl: String(ctx?.tab?.url || installed.url),
          installCount: state.installs.length
        };
        state.invocations.push(result);
        return result;
      },
      verify(action, result) {
        const verified = Boolean(
          result &&
            result.ok === true &&
            result.action === action &&
            result.installedScriptId === installed.scriptId
        );
        state.verifications.push({
          action,
          verified
        });
        return verified;
      }
    };
  }

  globalScope[HOOK_KEY] = {
    version: "fixture-v1",
    state,
    install
  };

  console.log("BBL Next page hook ready");
})(globalThis);
