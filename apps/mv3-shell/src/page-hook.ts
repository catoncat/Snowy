// @ts-nocheck
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
    queryResults: [],
    clickEvents: [],
    fillEvents: [],
  };

  const elementRefs = {};
  let elementCounter = 0;

  function getInstallation(installationId) {
    return state.installs.find((entry) => entry.installationId === installationId);
  }

  function getKeyboardTarget() {
    const documentRef = globalScope.document;
    return (
      documentRef?.activeElement ?? documentRef?.body ?? documentRef?.documentElement ?? documentRef
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

  function serializeElement(el, uid) {
    const attrs = {};
    if (el.attributes) {
      for (let i = 0; i < el.attributes.length; i++) {
        const attr = el.attributes[i];
        attrs[attr.name] = attr.value;
      }
    }
    return {
      uid,
      tagName: (el.tagName || "UNKNOWN").toLowerCase(),
      textContent: (el.textContent || "").slice(0, 200),
      attributes: attrs,
    };
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

    if (action === "query") {
      const selector = input && typeof input === "object" ? input.selector : undefined;
      if (typeof selector !== "string" || !selector) {
        throw new Error("page.query requires input.selector");
      }
      const doc = globalScope.document;
      if (!doc || typeof doc.querySelectorAll !== "function") {
        throw new Error("document.querySelectorAll is not available");
      }
      const nodes = doc.querySelectorAll(selector);
      const elements = [];
      for (let i = 0; i < nodes.length; i++) {
        const uid = `e-${++elementCounter}`;
        elementRefs[uid] = nodes[i];
        elements.push(serializeElement(nodes[i], uid));
      }
      const queryResult = {
        ok: true,
        action,
        selector,
        elements,
        count: elements.length,
        installationId,
        installedScriptId: installed.scriptId,
        tabUrl: String(ctx?.tab?.url || installed.url),
        installCount: state.installs.length,
      };
      state.queryResults.push(queryResult);
      state.invocations.push(queryResult);
      return queryResult;
    }

    if (action === "click") {
      const uid = input && typeof input === "object" ? input.uid : undefined;
      if (typeof uid !== "string" || !uid) {
        throw new Error("page.click requires input.uid");
      }
      const el = elementRefs[uid];
      if (!el) {
        throw new Error(`Element not found: ${uid}`);
      }
      if (typeof el.click === "function") {
        el.click();
      } else if (typeof el.dispatchEvent === "function") {
        el.dispatchEvent(
          new (globalScope.MouseEvent || globalScope.Event)("click", {
            bubbles: true,
            cancelable: true,
          }),
        );
      }
      const clickResult = {
        ok: true,
        action,
        uid,
        tagName: (el.tagName || "").toLowerCase(),
        installationId,
        installedScriptId: installed.scriptId,
        tabUrl: String(ctx?.tab?.url || installed.url),
        installCount: state.installs.length,
      };
      state.clickEvents.push(clickResult);
      state.invocations.push(clickResult);
      return clickResult;
    }

    if (action === "fill") {
      const uid = input && typeof input === "object" ? input.uid : undefined;
      const value = input && typeof input === "object" ? input.value : undefined;
      if (typeof uid !== "string" || !uid) {
        throw new Error("page.fill requires input.uid");
      }
      if (typeof value !== "string") {
        throw new Error("page.fill requires input.value");
      }
      const el = elementRefs[uid];
      if (!el) {
        throw new Error(`Element not found: ${uid}`);
      }
      el.value = value;
      if (typeof el.dispatchEvent === "function") {
        if (typeof globalScope.InputEvent === "function") {
          el.dispatchEvent(new globalScope.InputEvent("input", { bubbles: true }));
        }
        el.dispatchEvent(
          new (globalScope.Event || globalScope.Object)("change", { bubbles: true }),
        );
      }
      const fillResult = {
        ok: true,
        action,
        uid,
        value,
        tagName: (el.tagName || "").toLowerCase(),
        installationId,
        installedScriptId: installed.scriptId,
        tabUrl: String(ctx?.tab?.url || installed.url),
        installCount: state.installs.length,
      };
      state.fillEvents.push(fillResult);
      state.invocations.push(fillResult);
      return fillResult;
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
        result.installationId === installationId,
    );
    if (verified && action === "press_key") {
      verified = state.keyEvents.some(
        (entry) => entry.installationId === installationId && entry.key === result.key,
      );
    }
    if (verified && action === "query") {
      verified = Array.isArray(result.elements) && typeof result.count === "number";
    }
    if (verified && action === "click") {
      verified =
        typeof result.uid === "string" &&
        state.clickEvents.some(
          (entry) => entry.installationId === installationId && entry.uid === result.uid,
        );
    }
    if (verified && action === "fill") {
      verified =
        typeof result.uid === "string" &&
        typeof result.value === "string" &&
        state.fillEvents.some(
          (entry) => entry.installationId === installationId && entry.uid === result.uid,
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
