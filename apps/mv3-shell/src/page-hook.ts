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
    infoEvents: [],
    clickEvents: [],
    clickXyEvents: [],
    fillEvents: [],
    typeTextEvents: [],
    scrollEvents: [],
    fetchEvents: [],
  };

  const elementRefs = {};
  let elementCounter = 0;

  function getInstallation(installationId) {
    return state.installs.find((entry) => entry.installationId === installationId);
  }

  function getKeyboardTarget() {
    const documentRef = globalScope.document;
    return (
      getDeepActiveElement(documentRef) ??
      documentRef?.body ??
      documentRef?.documentElement ??
      documentRef
    );
  }

  function getDeepActiveElement(documentRef) {
    let active = documentRef?.activeElement;
    while (active?.shadowRoot?.activeElement) {
      active = active.shadowRoot.activeElement;
    }
    return active;
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

  function boxForElement(el) {
    if (!el || typeof el.getBoundingClientRect !== "function") {
      return null;
    }
    const rect = el.getBoundingClientRect();
    return {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      centerX: Math.round(rect.x + rect.width / 2),
      centerY: Math.round(rect.y + rect.height / 2),
    };
  }

  function compactText(value, maxLength) {
    const text = String(value || "")
      .replace(/\s+/g, " ")
      .trim();
    return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
  }

  function serializeInfoElement(el, uid) {
    const attrs = {};
    for (const name of [
      "aria-label",
      "data-testid",
      "href",
      "name",
      "placeholder",
      "role",
      "title",
      "type",
      "value",
    ]) {
      const value = typeof el.getAttribute === "function" ? el.getAttribute(name) : null;
      if (typeof value === "string" && value.length > 0) {
        attrs[name] = value.slice(0, 160);
      }
    }
    return {
      uid,
      tagName: (el.tagName || "UNKNOWN").toLowerCase(),
      textContent: compactText(el.textContent, 160),
      ariaLabel: typeof el.getAttribute === "function" ? el.getAttribute("aria-label") : null,
      role: typeof el.getAttribute === "function" ? el.getAttribute("role") : null,
      testId: typeof el.getAttribute === "function" ? el.getAttribute("data-testid") : null,
      box: boxForElement(el),
      attributes: attrs,
    };
  }

  function isVisibleBoxInViewport(box) {
    if (!box || box.width <= 0 || box.height <= 0) {
      return false;
    }
    const width = Number(globalScope.innerWidth || 0);
    const height = Number(globalScope.innerHeight || 0);
    return box.x < width && box.x + box.width > 0 && box.y < height && box.y + box.height > 0;
  }

  function collectInteractiveElements(root, selector, seen) {
    if (!root || typeof root.querySelectorAll !== "function") {
      return [];
    }
    const collected = [];
    for (const element of Array.from(root.querySelectorAll(selector))) {
      if (!seen.has(element)) {
        seen.add(element);
        collected.push(element);
      }
    }
    for (const element of Array.from(root.querySelectorAll("*"))) {
      if (element.shadowRoot) {
        collected.push(...collectInteractiveElements(element.shadowRoot, selector, seen));
      }
    }
    return collected;
  }

  function normalizeStringMap(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return undefined;
    }
    const normalized = {};
    for (const [key, entry] of Object.entries(value)) {
      if (typeof entry === "string") {
        normalized[key] = entry;
      }
    }
    return Object.keys(normalized).length > 0 ? normalized : undefined;
  }

  function normalizeScrollNumber(value, fallback) {
    if (value == null) {
      return fallback;
    }
    const number = Number(value);
    if (!Number.isFinite(number)) {
      throw new Error("page.scroll requires finite numeric deltas");
    }
    return number;
  }

  function normalizeCoordinate(value, name) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      throw new Error(`page.click_xy requires finite numeric ${name}`);
    }
    return number;
  }

  function dispatchMouseClick(target, x, y) {
    const MouseEventCtor = globalScope.MouseEvent || globalScope.Event;
    for (const type of ["mousedown", "mouseup", "click"]) {
      target.dispatchEvent(
        new MouseEventCtor(type, {
          bubbles: true,
          cancelable: true,
          clientX: x,
          clientY: y,
        }),
      );
    }
  }

  function dispatchInputEvents(target) {
    if (typeof target.dispatchEvent !== "function") {
      return;
    }
    if (typeof globalScope.InputEvent === "function") {
      target.dispatchEvent(new globalScope.InputEvent("input", { bubbles: true }));
    } else {
      target.dispatchEvent(
        new (globalScope.Event || globalScope.Object)("input", { bubbles: true }),
      );
    }
    target.dispatchEvent(
      new (globalScope.Event || globalScope.Object)("change", { bubbles: true }),
    );
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

  async function invoke(installationId, action, input, ctx) {
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

    if (action === "info") {
      const doc = globalScope.document;
      if (!doc || typeof doc.querySelectorAll !== "function") {
        throw new Error("document.querySelectorAll is not available");
      }
      const maxElements = Math.max(1, Math.min(Number(input?.maxElements ?? 30), 50));
      const maxTextChars = Math.max(200, Math.min(Number(input?.maxTextChars ?? 1200), 1800));
      const interactiveSelector =
        'button,[role="button"],a,input,textarea,select,[contenteditable="true"],[tabindex]:not([tabindex="-1"]),[aria-label]';
      const candidates = collectInteractiveElements(doc, interactiveSelector, new Set())
        .map((element) => ({ element, box: boxForElement(element) }))
        .filter(({ box }) => isVisibleBoxInViewport(box))
        .sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x)
        .map(({ element }) => element)
        .slice(0, maxElements);
      const interactiveElements = candidates.map((element) => {
        const uid = `e-${++elementCounter}`;
        elementRefs[uid] = element;
        return serializeInfoElement(element, uid);
      });
      const infoResult = {
        ok: true,
        action,
        title: String(doc.title || ""),
        url: String(globalScope.location?.href || ctx?.tab?.url || installed.url),
        visibleText: compactText(doc.body?.innerText, maxTextChars),
        viewport: {
          width: Number(globalScope.innerWidth || 0),
          height: Number(globalScope.innerHeight || 0),
          scrollX: Number(globalScope.scrollX || 0),
          scrollY: Number(globalScope.scrollY || 0),
          documentWidth: Number(doc.documentElement?.scrollWidth || doc.body?.scrollWidth || 0),
          documentHeight: Number(doc.documentElement?.scrollHeight || doc.body?.scrollHeight || 0),
        },
        interactiveElements,
        interactiveCount: interactiveElements.length,
        limits: {
          maxElements,
          maxTextChars,
        },
        installationId,
        installedScriptId: installed.scriptId,
        tabUrl: String(ctx?.tab?.url || installed.url),
        installCount: state.installs.length,
      };
      state.infoEvents.push(infoResult);
      state.invocations.push(infoResult);
      return infoResult;
    }

    if (action === "scroll") {
      const deltaX = normalizeScrollNumber(input?.deltaX, 0);
      const deltaY = normalizeScrollNumber(input?.deltaY, 0);
      const behavior =
        input && input.behavior === "smooth"
          ? "smooth"
          : input && input.behavior === "instant"
            ? "instant"
            : "auto";
      if (typeof globalScope.scrollBy !== "function") {
        throw new Error("window.scrollBy is not available");
      }
      globalScope.scrollBy({ left: deltaX, top: deltaY, behavior });
      const doc = globalScope.document;
      const scrollResult = {
        ok: true,
        action,
        input: {
          deltaX,
          deltaY,
          behavior,
        },
        scrollX: Number(globalScope.scrollX || 0),
        scrollY: Number(globalScope.scrollY || 0),
        viewportWidth: Number(globalScope.innerWidth || 0),
        viewportHeight: Number(globalScope.innerHeight || 0),
        documentWidth: Number(doc?.documentElement?.scrollWidth || doc?.body?.scrollWidth || 0),
        documentHeight: Number(doc?.documentElement?.scrollHeight || doc?.body?.scrollHeight || 0),
        installationId,
        installedScriptId: installed.scriptId,
        tabUrl: String(ctx?.tab?.url || installed.url),
        installCount: state.installs.length,
      };
      state.scrollEvents.push(scrollResult);
      state.invocations.push(scrollResult);
      return scrollResult;
    }

    if (action === "click_xy") {
      const x = normalizeCoordinate(input?.x, "x");
      const y = normalizeCoordinate(input?.y, "y");
      const doc = globalScope.document;
      if (!doc || typeof doc.elementFromPoint !== "function") {
        throw new Error("document.elementFromPoint is not available");
      }
      const el = doc.elementFromPoint(x, y);
      if (!el || typeof el.dispatchEvent !== "function") {
        throw new Error(`No clickable element at (${x}, ${y})`);
      }
      if (typeof el.focus === "function") {
        el.focus();
      }
      dispatchMouseClick(el, x, y);
      const clickResult = {
        ok: true,
        action,
        x,
        y,
        tagName: (el.tagName || "").toLowerCase(),
        textContent: (el.textContent || "").slice(0, 200),
        installationId,
        installedScriptId: installed.scriptId,
        tabUrl: String(ctx?.tab?.url || installed.url),
        installCount: state.installs.length,
      };
      state.clickXyEvents.push(clickResult);
      state.invocations.push(clickResult);
      return clickResult;
    }

    if (action === "type_text") {
      const text = input && typeof input.text === "string" ? input.text : undefined;
      if (typeof text !== "string") {
        throw new Error("page.type_text requires input.text");
      }
      const doc = globalScope.document;
      const el = getDeepActiveElement(doc);
      if (!el) {
        throw new Error("page.type_text requires a focused editable element");
      }
      const tagName = (el.tagName || "").toLowerCase();
      if (tagName === "input" || tagName === "textarea") {
        el.value = `${el.value || ""}${text}`;
      } else if (el.isContentEditable === true) {
        el.textContent = `${el.textContent || ""}${text}`;
      } else {
        throw new Error(
          "page.type_text requires a focused input, textarea, or contenteditable element",
        );
      }
      dispatchInputEvents(el);
      const typeResult = {
        ok: true,
        action,
        text,
        tagName,
        value: tagName === "input" || tagName === "textarea" ? String(el.value || "") : undefined,
        installationId,
        installedScriptId: installed.scriptId,
        tabUrl: String(ctx?.tab?.url || installed.url),
        installCount: state.installs.length,
      };
      state.typeTextEvents.push(typeResult);
      state.invocations.push(typeResult);
      return typeResult;
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

    if (action === "fetch_with_session") {
      const url = input && typeof input === "object" ? input.url : undefined;
      const method =
        input && typeof input === "object" && typeof input.method === "string" && input.method
          ? input.method.toUpperCase()
          : "GET";
      const body = input && typeof input === "object" ? input.body : undefined;
      const headers = normalizeStringMap(input && typeof input === "object" ? input.headers : null);
      if (typeof url !== "string" || !url) {
        throw new Error("site.fetch_with_session requires input.url");
      }
      if (body !== undefined && typeof body !== "string") {
        throw new Error("site.fetch_with_session requires input.body to be a string");
      }
      if (typeof globalScope.fetch !== "function") {
        throw new Error("fetch is not available on the page hook global scope");
      }

      const response = await globalScope.fetch(url, {
        method,
        credentials: "include",
        ...(headers ? { headers } : {}),
        ...(body !== undefined ? { body } : {}),
      });
      const responseBody = await response.text();
      const fetchResult = {
        ok: true,
        action,
        url: typeof response.url === "string" && response.url ? response.url : url,
        method,
        status: typeof response.status === "number" ? response.status : 0,
        statusText: typeof response.statusText === "string" ? response.statusText : "",
        body: responseBody,
        responseOk: response.ok === true,
        installationId,
        installedScriptId: installed.scriptId,
        tabUrl: String(ctx?.tab?.url || installed.url),
        installCount: state.installs.length,
      };
      state.fetchEvents.push({
        action,
        url: fetchResult.url,
        method,
        credentials: "include",
        status: fetchResult.status,
        body: responseBody,
        responseOk: fetchResult.responseOk,
        installationId,
        installedScriptId: installed.scriptId,
        tabUrl: fetchResult.tabUrl,
      });
      state.invocations.push(fetchResult);
      return fetchResult;
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

  function asRecord(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return null;
    }
    return value;
  }

  function readStabilizationHint(result) {
    const resultRecord = asRecord(result);
    if (!resultRecord) {
      return null;
    }
    return (
      asRecord(resultRecord.stabilization) ?? asRecord(asRecord(resultRecord.input)?.stabilization)
    );
  }

  function evaluateStabilization(result) {
    const hint = readStabilizationHint(result);
    if (!hint) {
      return null;
    }
    if (hint.kind === "selector_present" && typeof hint.selector === "string" && hint.selector) {
      const doc = globalScope.document;
      if (!doc || typeof doc.querySelectorAll !== "function") {
        return {
          status: "failed",
          reason: "document.querySelectorAll is not available",
        };
      }
      const minCount =
        typeof hint.minCount === "number" && hint.minCount >= 1 ? Math.floor(hint.minCount) : 1;
      const nodes = doc.querySelectorAll(hint.selector);
      const count = typeof nodes?.length === "number" ? nodes.length : 0;
      if (count < minCount) {
        return {
          status: "not_ready",
          reason: `selector:${hint.selector}`,
          payload: {
            selector: hint.selector,
            matchedCount: count,
            minCount,
          },
        };
      }
      return {
        status: "verified",
      };
    }
    return null;
  }

  function verify(installationId, action, _verifier, result) {
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
    if (verified && action === "info") {
      verified =
        Array.isArray(result.interactiveElements) &&
        typeof result.visibleText === "string" &&
        state.infoEvents.some((entry) => entry.installationId === installationId);
    }
    if (verified && action === "click") {
      verified =
        typeof result.uid === "string" &&
        state.clickEvents.some(
          (entry) => entry.installationId === installationId && entry.uid === result.uid,
        );
    }
    if (verified && action === "click_xy") {
      verified =
        typeof result.x === "number" &&
        typeof result.y === "number" &&
        state.clickXyEvents.some((entry) => entry.installationId === installationId);
    }
    if (verified && action === "fill") {
      verified =
        typeof result.uid === "string" &&
        typeof result.value === "string" &&
        state.fillEvents.some(
          (entry) => entry.installationId === installationId && entry.uid === result.uid,
        );
    }
    if (verified && action === "scroll") {
      verified =
        typeof result.scrollY === "number" &&
        state.scrollEvents.some((entry) => entry.installationId === installationId);
    }
    if (verified && action === "type_text") {
      verified =
        typeof result.text === "string" &&
        state.typeTextEvents.some((entry) => entry.installationId === installationId);
    }
    if (verified && action === "fetch_with_session") {
      verified =
        typeof result.url === "string" &&
        typeof result.status === "number" &&
        typeof result.body === "string" &&
        state.fetchEvents.some(
          (entry) =>
            entry.installationId === installationId &&
            entry.url === result.url &&
            entry.status === result.status,
        );
    }
    const stabilizationResult = verified ? evaluateStabilization(result) : null;
    if (stabilizationResult?.status === "not_ready" || stabilizationResult?.status === "failed") {
      verified = false;
    }
    state.verifications.push({
      action,
      verified,
    });
    if (stabilizationResult) {
      return stabilizationResult.status === "verified" ? true : stabilizationResult;
    }
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
