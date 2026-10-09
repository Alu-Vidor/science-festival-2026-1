/* One participant per browser tab; frames merge their own checkpoints. */
(function (root) {
  'use strict';
  const key = 'festival-session-v1';
  // Local-file iframes have opaque storage; their containing page owns the city checkpoint.
  const embeddedFile = root.location?.protocol === 'file:' && root !== root.parent;
  let fileSession, ready;
  if (embeddedFile) {
    const session = new URLSearchParams(root.location.search).get('session') || 'initial';
    fileSession = { version: 1, id: session, data: {} };
    ready = new Promise(resolve => {
      let retry;
      const request = () => {
        root.parent.postMessage({ kind: 'festival-session-read', version: 1, session, name: 'city' }, '*');
        retry = root.setTimeout(request, 100);
      };
      root.addEventListener('message', function seed(event) {
        const data = event.data;
        if (event.source !== root.parent || event.origin !== 'null' || data?.kind !== 'festival-session-seed' ||
            data.version !== 1 || data.session !== session || data.name !== 'city') return;
        root.clearTimeout(retry); root.removeEventListener('message', seed);
        if (data.value !== undefined) fileSession.data.city = data.value;
        resolve();
      });
      request();
    });
  }
  function load() {
    if (embeddedFile) return fileSession;
    try {
      const value = JSON.parse(root.sessionStorage.getItem(key));
      if (value?.version === 1 && typeof value.id === 'string' && value.data && typeof value.data === 'object' && !Array.isArray(value.data)) return value;
    } catch {}
    return { version: 1, id: 'initial', data: {} };
  }
  function write(value) {
    if (embeddedFile) { fileSession = value; return true; }
    try { root.sessionStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
  }
  root.FestivalSession = {
    ...(ready ? { ready } : {}),
    get id() { return load().id; },
    read(name) { return load().data[name]; },
    save(name, value, expectedId) {
      const session = load();
      if (expectedId !== session.id) return false;
      session.data[name] = value;
      if (embeddedFile && name === 'city') root.parent.postMessage({
        kind: 'festival-session-save', version: 1, session: expectedId, name, value
      }, '*');
      return write(session);
    },
    reset() {
      const id = root.crypto?.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2);
      write({ version: 1, id, data: {} }); return id;
    }
  };
})(window);
