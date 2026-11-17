const CFG = {
  owner: 'slom2025', repo: 'avito-app-data',
  publicKey: 'BGFz_R0BNrnhfsZkRLu-ntVtTFNraOOrl3dKmAIuhxxjL-aKDbMh0hTmc0cqUEf7n1qmTCxm3Jnz5_VXqdrxGo4',
  version: '0.4', pollMs: 30000
};
const $ = id => document.getElementById(id);
const ls = {
  get: k => { try { return localStorage.getItem(k); } catch (_) { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch (_) {} }
};
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function toast(t) { const el = $('toast'); el.textContent = t; el.style.display = 'block'; clearTimeout(toast._t); toast._t = setTimeout(() => el.style.display = 'none', 2600); }

// ---------- Открытие в приложении Авито ----------
function avitoIntent(url) {
  try {
    const u = new URL(url);
    if (!/(^|\.)avito\.ru$/.test(u.hostname)) return url;
    return 'intent://' + u.host + u.pathname + u.search + '#Intent;scheme=https;package=com.avito.android;S.browser_fallback_url=' + encodeURIComponent(url) + ';end';
  } catch (_) { return url; }
}
function showGo(url) {
  if (!url) return;
  let box = document.getElementById('gobox');
  if (!box) { box = document.createElement('div'); box.id = 'gobox'; box.style.cssText = 'position:fixed;inset:0;background:rgba(10,12,16,.96);z-index:20;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:24px;text-align:center'; document.body.appendChild(box); }
  box.innerHTML = '<div style="font-size:18px;font-weight:600">Открыть объявление</div>' +
    '<a href="' + esc(avitoIntent(url)) + '" style="display:block;width:100%;max-width:340px;padding:18px;border-radius:14px;background:#3d8bfd;color:#fff;text-decoration:none;font-weight:700;font-size:18px">Открыть в приложении Авито</a>' +
    '<a href="' + esc(url) + '" style="color:#9aa1ae">Открыть в браузере</a>' +
    '<button id="goclose" style="background:#20242d">Закрыть</button>';
  if (!showGo.tried) { showGo.tried = true; try { location.href = avitoIntent(url); } catch (_) {} }
  document.getElementById('goclose').onclick = () => { box.remove(); history.replaceState(null, '', location.pathname); };
}

// ---------- GitHub ----------
const token = () => ls.get('gh_token') || '';
async function gh(path, opts = {}) {
  const r = await fetch(`https://api.github.com/repos/${CFG.owner}/${CFG.repo}/contents/${path}`, Object.assign({}, opts, {
    headers: Object.assign({Authorization: 'Bearer ' + token(), Accept: 'application/vnd.github+json'}, opts.headers || {}), cache: 'no-store'
  }));
  return r;
}
const dec = b64 => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\n/g, '')), c => c.charCodeAt(0)));
const enc = s => { const b = new TextEncoder().encode(s); let x = ''; b.forEach(c => x += String.fromCharCode(c)); return btoa(x); };
async function readJson(path) {
  const r = await gh(path);
  if (r.status === 404) return {data: null, sha: null};
  if (!r.ok) throw new Error(path + ': ' + r.status);
  const j = await r.json();
  return {data: JSON.parse(dec(j.content)), sha: j.sha};
}
async function writeJson(path, obj, sha, msg) {
  const body = {message: msg || 'app: ' + path, content: enc(JSON.stringify(obj, null, 2) + '\n')};
  if (sha) body.sha = sha;
  const r = await gh(path, {method: 'PUT', body: JSON.stringify(body)});
  if (!r.ok) throw new Error(path + ': ' + r.status);
  return (await r.json()).content.sha;
}

// ---------- Вкладки ----------
document.querySelectorAll('nav button').forEach(b => b.onclick = () => {
  document.querySelectorAll('nav button').forEach(x => x.classList.toggle('on', x === b));
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('on', t.id === 'tab-' + b.dataset.tab));
  if (b.dataset.tab === 'set') loadSettings();
});

// ---------- Лента ----------
function ago(ms) {
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 60) return Math.round(s) + ' с назад';
  if (s < 3600) return Math.round(s / 60) + ' мин назад';
  if (s < 86400) return Math.round(s / 3600) + ' ч назад';
  return Math.round(s / 86400) + ' дн назад';
}
async function renderFeed() {
  const items = await Store.all();
  const el = $('feed');
  if (!items.length) { el.innerHTML = '<div class="empty">Находок пока нет.<br>Когда парсер что-то найдёт, они появятся здесь.</div>'; return; }
  el.innerHTML = items.slice(0, 200).map(it => {
    const delay = (it.sent_at && it.received_at) ? (it.received_at - it.sent_at) / 1000 : null;
    const dl = delay == null ? '' : `<span class="badge ${delay < 5 ? 'fast' : 'slow'}">пуш шёл ${delay.toFixed(1)} с</span>`;
    const t = it.sent_at ? ago(it.sent_at) : '';
    const tag = it.category ? `<span class="badge">${esc(it.category)}</span>` : '';
    const price = it.price ? `<span class="price">${esc(it.price)}</span>` : '';
    const inner = `${price}<div class="t">${esc(it.title)}</div>
      <div class="meta">${tag}${dl}${t}</div>${it.body ? `<div class="body">${esc(it.body)}</div>` : ''}`;
    return it.url ? `<a class="card item" href="${esc(avitoIntent(it.url))}">${inner}</a>` : `<div class="card item">${inner}</div>`;
  }).join('');
}
let feedEtag = ls.get('feed_etag') || '';
async function loadFeed() {
  if (!token()) { $('conn').textContent = 'Нет ключа доступа (вкладка «Ещё»)'; return; }
  try {
    const r = await gh('feed.json', {headers: Object.assign({Accept: 'application/vnd.github.raw+json'}, feedEtag ? {'If-None-Match': feedEtag} : {})});
    const now = new Date().toLocaleTimeString('ru-RU', {hour: '2-digit', minute: '2-digit', second: '2-digit'});
    if (r.status === 304) { $('conn').textContent = 'На связи · ' + now; return; }
    if (r.status === 404) { $('conn').textContent = 'На связи, лента пока пустая'; return; }
    if (!r.ok) throw new Error(r.status);
    feedEtag = r.headers.get('ETag') || ''; ls.set('feed_etag', feedEtag);
    const j = await r.json();
    for (const it of (j.items || [])) {
      const old = await Store.get(it.id);
      await Store.put(Object.assign({}, it, old && old.received_at ? {received_at: old.received_at} : {}));
    }
    await Store.trim();
    $('conn').textContent = 'На связи · ' + now;
    renderFeed();
  } catch (e) { $('conn').textContent = 'Нет связи с хранилищем (' + (e.message || e) + ')'; }
}

// ---------- Настройки ----------
let settings = {values: {}, sha: null}, schema = [];
async function loadSettings() {
  if (!token()) { $('controls').innerHTML = '<p class="m">Сначала вставь ключ доступа на вкладке «Ещё».</p>'; return; }
  try {
    const [sc, st] = await Promise.all([readJson('schema.json'), readJson('settings.json')]);
    schema = (sc.data && sc.data.controls) || [];
    settings = {values: (st.data && st.data.values) || {}, sha: st.sha};
    renderSettings();
  } catch (e) { $('controls').innerHTML = '<p class="m">Не удалось загрузить настройки: ' + esc(e.message || e) + '</p>'; }
}
function renderSettings() {
  if (!schema.length) { $('controls').innerHTML = '<p class="m">Список настроек пока пуст.</p>'; return; }
  $('controls').innerHTML = schema.map(c => {
    const v = c.key in settings.values ? settings.values[c.key] : c.default;
    const ctl = c.type === 'bool'
      ? `<label class="sw"><input type="checkbox" data-k="${esc(c.key)}" ${v ? 'checked' : ''}><span></span></label>`
      : `<input type="number" data-k="${esc(c.key)}" value="${esc(v)}" ${c.min != null ? `min="${c.min}"` : ''} ${c.max != null ? `max="${c.max}"` : ''} ${c.step != null ? `step="${c.step}"` : ''}>`;
    return `<div class="row"><div class="l">${esc(c.label)}${c.hint ? `<div class="h">${esc(c.hint)}</div>` : ''}</div>${ctl}</div>`;
  }).join('');
  $('controls').querySelectorAll('[data-k]').forEach(el => el.onchange = () => {
    const k = el.dataset.k; const c = schema.find(x => x.key === k);
    settings.values[k] = c.type === 'bool' ? el.checked : Number(el.value);
    scheduleSave();
  });
}
let saveT;
function scheduleSave() { clearTimeout(saveT); $('setmsg').textContent = 'Сохраняю…'; saveT = setTimeout(() => saveSettings(0), 600); }
async function saveSettings(retry) {
  try {
    schema.forEach(c => { if (!(c.key in settings.values)) settings.values[c.key] = c.default; });
    const body = {rev: Date.now(), updated_at: new Date().toISOString(), updated_by: 'app', values: settings.values};
    settings.sha = await writeJson('settings.json', body, settings.sha, 'app: настройки');
    $('setmsg').textContent = 'Сохранено. Парсер подхватит в течение минуты.';
  } catch (e) {
    if (retry < 1 && /409|422/.test(String(e.message))) { const cur = await readJson('settings.json'); settings.sha = cur.sha; return saveSettings(retry + 1); }
    $('setmsg').textContent = 'Не сохранилось: ' + (e.message || e);
  }
}

// ---------- Пуши ----------
const b64u = s => { const p = '='.repeat((4 - s.length % 4) % 4); const r = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(r, c => c.charCodeAt(0)); };
async function pushState() {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) { $('pushstate').textContent = 'Этот браузер не умеет пуши.'; return; }
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg && await reg.pushManager.getSubscription();
    $('pushstate').textContent = sub && Notification.permission === 'granted' ? 'Пуши включены.' : 'Не включены.';
    $('pushbtn').textContent = sub ? 'Переподключить пуши' : 'Включить пуши';
    $('pushtest').hidden = !sub;
  } catch (_) {}
}
$('pushbtn').onclick = async () => {
  try {
    const reg = await navigator.serviceWorker.register('sw.js'); await navigator.serviceWorker.ready;
    if (await Notification.requestPermission() !== 'granted') { toast('Уведомления не разрешены в настройках сайта'); return; }
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({userVisibleOnly: true, applicationServerKey: b64u(CFG.publicKey)});
    const subJson = sub.toJSON();
    if (token()) {
      const id = (subJson.keys.auth || 'dev').replace(/[^A-Za-z0-9]/g, '').slice(0, 16);
      const cur = await readJson('subs/' + id + '.json');
      await writeJson('subs/' + id + '.json', {added: new Date().toISOString(), ua: navigator.userAgent, subscription: subJson}, cur.sha, 'app: подписка на пуши');
      toast('Пуши включены и записаны');
    } else toast('Пуши включены. Вставь ключ доступа, чтобы парсер мог слать пуши.');
    pushState();
  } catch (e) { toast('Ошибка: ' + (e.message || e)); }
};
$('pushtest').onclick = async () => {
  const reg = await navigator.serviceWorker.getRegistration(); const sub = reg && await reg.pushManager.getSubscription();
  if (!sub) return; $('subtext').hidden = false; $('subtext').value = JSON.stringify(sub.toJSON()); $('subtext').select();
};
$('savetoken').onclick = async () => {
  const v = $('token').value.trim(); if (!v) return;
  ls.set('gh_token', v); $('token').value = ''; feedEtag = ''; ls.set('feed_etag', '');
  $('tokenmsg').textContent = 'Проверяю…';
  try { const r = await gh('feed.json'); const ok = r.ok || r.status === 404; $('tokenmsg').textContent = ok ? 'Ключ принят.' : 'Ключ не подошёл (' + r.status + ').'; if (ok) loadFeed(); }
  catch (e) { $('tokenmsg').textContent = 'Нет связи с GitHub.'; }
};
$('reload').onclick = async () => {
  try { const rs = await navigator.serviceWorker.getRegistrations(); for (const r of rs) await r.update(); const ks = await caches.keys(); for (const k of ks) await caches.delete(k); } catch (_) {}
  location.replace(location.pathname + '?r=' + Date.now());
};

// ---------- Запуск ----------
$('ver').textContent = 'Версия ' + CFG.version;
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
  navigator.serviceWorker.addEventListener('message', e => {
    if (e.data && e.data.type === 'item') renderFeed();
    if (e.data && e.data.type === 'go') showGo(e.data.url);
  });
}
renderFeed(); loadFeed(); pushState();
setInterval(() => { if (document.visibilityState === 'visible') loadFeed(); }, CFG.pollMs);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { renderFeed(); loadFeed(); } });
try { const go = new URLSearchParams(location.search).get('go'); if (go) showGo(go); } catch (_) {}
