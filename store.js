// Маленькое хранилище находок на телефоне (IndexedDB). Общий файл для страницы и для sw.js
const Store = (() => {
  const open = () => new Promise((res, rej) => {
    const r = indexedDB.open('hunter', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('items', {keyPath: 'id'});
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  const tx = async (mode, fn) => {
    const db = await open();
    return new Promise((res, rej) => {
      const t = db.transaction('items', mode); const s = t.objectStore('items');
      const out = fn(s); t.oncomplete = () => res(out && out.result !== undefined ? out.result : out); t.onerror = () => rej(t.error);
    });
  };
  return {
    put: item => tx('readwrite', s => { s.put(item); }),
    all: () => tx('readonly', s => s.getAll()).then(a => (a || []).sort((x, y) => (y.sent_at || 0) - (x.sent_at || 0))),
    get: id => tx('readonly', s => s.get(id)),
    trim: async (keep = 500) => { const a = await Store.all(); for (const it of a.slice(keep)) await tx('readwrite', s => { s.delete(it.id); }); }
  };
})();
