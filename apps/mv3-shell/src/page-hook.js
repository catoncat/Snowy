(function pageHook(globalScope) {
  const HOOK_KEY = "__BBL_NEXT_PAGE_HOOK__";
  const existing = globalScope[HOOK_KEY];
  if (existing && existing.version === "bridge-v1") {
    return;
  }

  const state = {
    installs: [],
    invocations: [],
    verifications: [],
    keyEvents: [],
  };

  function getInstallation(installationId) {
    return state.installs.find((entry) => entry.installationId === installationId);
  }

  function getKeyboardTarget() {
    const documentRef = globalScope.document;
    return (
      documentRef?.activeElement ??
      documentRef?.body ??
      documentRef?.documentElement ??
      documentRef
    );
  }

  function dispatchKeyboardPress(installed, key, ctx) {
    const target = getKeyboardTarget();
    const tabUrl = String(ctx?.tab?.url || installed.url);

    return ["keydown", "keyup"].map((type) => {
      const event = new globalScope.KeyboardEvent(type, {
        key,
        bubbles: true,
        cancelable: true,
        composed: true,
      });
      if (target && typeof target.dispatchEvent === "function") {
        target.dispatchEvent(event);
      }
      const recorded = {
        installationId: installed.installationId,
        scriptId: installed.scriptId,
        type,
        key,
        tabUrl,
      };
      state.keyEvents.push(recorded);
      return recorded;
    });
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
      url: String(tab?.url || ""),
    };
    state.installs.push(installed);
    return {
      installationId,
      installed,
    };
  }

  function invoke(installationId, action, input, ctx) {
    const installed = getInstallation(installationId);
    if (!installed) {
      throw new Error(`Unknown installation: ${installationId}`);
    }

    if (action === "press_key") {
      const key = input && typeof input.key === "string" ? input.key : "";
      if (!key) {
        throw new Error("page.press_key requires input.key");
      }
      const dispatched = dispatchKeyboardPress(installed, key, ctx);
      const keyResult = {
        ok: true,
        action,
        input,
        key,
        dispatchCount: dispatched.length,
        installationId,
        installedScriptId: installed.scriptId,
        tabUrl: String(ctx?.tab?.url || installed.url),
        installCount: state.installs.length,
      };
      state.invocations.push(keyResult);
      return keyResult;
    }

    const result = {
      ok: true,
      action,
      input,
      installationId,
      installedScriptId: installed.scriptId,
      tabUrl: String(ctx?.tab?.url || installed.url),
      installCount: state.installs.length,
    };
    state.invocations.push(result);
    return result;
  }

  function verify(installationId, action, result) {
    const installed = getInstallation(installationId);
    if (!installed) {
      return false;
    }
    let verified = Boolean(
      result &&
        result.ok === true &&
        result.action === action &&
        result.installedScriptId === installed.scriptId &&
        result.installationId === installationId
    );
    if (verified && action === "press_key") {
      verified = state.keyEvents.some(
        (entry) => entry.installationId === installationId && entry.key === result.key
      );
    }
    state.verifications.push({
      action,
      verified,
    });
    return verified;
  }

  globalScope[HOOK_KEY] = {
    version: "bridge-v1",
    state,
    install,
    invoke,
    verify,
  };

  console.log("BBL Next page hook ready");
})(globalThis);
