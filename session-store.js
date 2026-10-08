/* One participant per browser tab; frames merge their own checkpoints. */
(function (root) {
  'use strict';
  const key = 'festival-session-v1';
  function load() {
    try {
      const value = JSON.parse(root.sessionStorage.getItem(key));
      if (value?.version === 1 && typeof value.id === 'string' && value.data && typeof value.data === 'object' && !Array.isArray(value.data)) return value;
    } catch {}
    return { version: 1, id: 'initial', data: {} };
  }
  function write(value) { try { root.sessionStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; } }
  root.FestivalSession = {
    get id() { return load().id; },
    read(name) { return load().data[name]; },
    save(name, value, expectedId) {
      const session = load();
      if (expectedId !== session.id) return false;
      session.data[name] = value; return write(session);
    },
    reset() {
      const id = root.crypto?.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2);
      write({ version: 1, id, data: {} }); return id;
    }
  };
})(window);
