const CFG = {
  owner: 'slom2025', repo: 'avito-app-data',
  publicKey: 'BGFz_R0BNrnhfsZkRLu-ntVtTFNraOOrl3dKmAIuhxxjL-aKDbMh0hTmc0cqUEf7n1qmTCxm3Jnz5_VXqdrxGo4',
  version: '0.19', pollMs: 30000
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
  if (b.dataset.tab === 'goals') loadGoals();
});

// ---------- Лента ----------
const hm = ms => { const d = new Date(ms), today = new Date().toDateString() === d.toDateString();
  return (today ? '' : d.toLocaleDateString('ru-RU', {day: 'numeric', month: 'short'}) + ' ') + d.toLocaleTimeString('ru-RU', {hour: '2-digit', minute: '2-digit'}); };
// Время публикации: из published_at, если комп его прислал, иначе из строки «⏱ N мин/ч от публикации» (от момента отправки компом)
function pubAt(it) {
  if (it.published_at) { const ms = typeof it.published_at === 'number' ? it.published_at : Date.parse(it.published_at); if (ms) return {ms, approx: false}; }
  const m = /⏱\s*(\d+)\s*(мин|ч) от публикации/.exec(it.body || '');
  if (!m || !it.sent_at) return null;
  return {ms: it.sent_at - (+m[1]) * (m[2] === 'ч' ? 3600000 : 60000), approx: m[2] === 'ч'};
}
const cleanBody = b => String(b || '').replace(/\n?⏱[^\n]*от публикации/g, '').trim();
// Поправка часов телефона по времени сервера сайта (заголовок Date своего же сайта; у api.github.com он скрыт), чтобы «пришло» не врало из-за неточных часов
const clockFix = () => +(ls.get('clock_fix') || 0);
function noteServerTime(r) { const d = Date.parse(r.headers.get('Date') || ''); if (d) ls.set('clock_fix', String(Math.round((d + 500 - Date.now()) / 1000) * 1000)); }
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
    // Два времени, которые важны: когда продавец выложил и когда пуш пришёл на телефон. Остальное убрано (23.11).
    const pub = pubAt(it), got = it.received_at ? it.received_at + clockFix() : null;
    const pubTxt = pub ? `выложено ${pub.approx ? '~' : ''}${hm(pub.ms)}` : '';
    let gotTxt = got ? `пуш пришёл ${hm(got)}` : 'пуша не было, только лента';
    if (got && pub && !pub.approx) { const m = Math.max(0, Math.round((got - pub.ms) / 60000)); gotTxt += ` <span class="badge ${m <= 10 ? 'fast' : 'slow'}">через ${m} мин</span>`; }
    const t = [pubTxt, gotTxt].filter(Boolean).join(' · ');
    const dl = '';
    const tag = '';
    const price = it.price ? `<span class="price">${esc(it.price)}</span>` : '';
    const inner = `${price}<div class="t">${esc(it.title)}</div>
      <div class="meta">${tag}${dl}${t}</div>${cleanBody(it.body) ? `<div class="body">${esc(cleanBody(it.body))}</div>` : ''}`;
    const nd = it.url && /^\d+$/.test(String(it.id || '')) ? (marked.has(String(it.id))
      ? `<button class="sec nd on" data-nd="${esc(it.id)}">✓ Отмечено: доставки нет (отменить)</button>`
      : `<button class="sec nd" data-nd="${esc(it.id)}" data-ndt="${esc(it.title)}">Доставки нет — пуш зря</button>`) : '';
    return it.url ? `<div class="card"><a class="item" href="${esc(avitoIntent(it.url))}">${inner}</a>${nd}</div>` : `<div class="card item">${inner}</div>`;
  }).join('');
  el.querySelectorAll('[data-nd]').forEach(b => b.onclick = () => toggleMark(b.dataset.nd, b.dataset.ndt || ''));
}
// ---------- Отметка «доставки нет» ----------
// marks.json: {rev, updated_at, marks:[{item, mark:'no_delivery', at, title}]}; комп забирает его в data/app_marks.json.
// На компе: объявление считается без доставки, действует правило 150 км от Таганрога; при любой ошибке файла пуши идут как раньше.
let marked = new Set((() => { try { return JSON.parse(ls.get('nd_marks') || '[]'); } catch (_) { return []; } })());
async function toggleMark(id, title) {
  if (!token()) { toast('Нужен ключ доступа'); return; }
  const was = marked.has(id);
  try {
    for (let t = 0; ; t++) {
      const cur = await readJson('marks.json');
      const doc = Object.assign({rev: 0, marks: []}, cur.data || {});
      doc.marks = (doc.marks || []).filter(m => !(m.item === id && m.mark === 'no_delivery'));
      if (!was) doc.marks.push({item: id, mark: 'no_delivery', at: new Date().toISOString(), title});
      doc.marks = doc.marks.slice(-500); doc.rev = Date.now(); doc.updated_at = new Date().toISOString();
      try { await writeJson('marks.json', doc, cur.sha, 'app: доставки нет ' + id); break; }
      catch (e) { if (!(t < 1 && /409|422/.test(String(e.message)))) throw e; }
    }
    if (was) marked.delete(id); else marked.add(id);
    ls.set('nd_marks', JSON.stringify([...marked].slice(-500)));
    toast(was ? 'Отметка снята' : 'Отмечено: доставки нет. Повторов издалека не будет');
    renderFeed();
  } catch (e) { toast('Не сохранилось: ' + (e.message || e)); }
}
// Квитанции о доставке пушей (23.11, разбор «куда теряются 5 минут»): когда комп отправил и когда телефон получил.
// Пишутся в receipts.json хранилища не чаще раза в 10 минут и только если появилось новое. Ошибка ничего не ломает.
let rcptBusy = false;
async function uploadReceipts() {
  if (rcptBusy || !token()) return;
  const last = +(ls.get('rcpt_at') || 0); if (Date.now() - last < 10 * 60 * 1000) return;
  rcptBusy = true;
  try {
    const items = (await Store.all()).filter(it => it.sent_at && it.received_at)
      .map(it => ({id: it.id, sent_at: it.sent_at, received_at: it.received_at, app_open: it.app_open, test: it.test || undefined}))
      .sort((x, y) => x.sent_at - y.sent_at).slice(-300);
    if (!items.length) return;
    const sig = items.length + ':' + (items.length ? items[items.length - 1].id : '');
    if (sig === ls.get('rcpt_sig')) { ls.set('rcpt_at', String(Date.now())); return; }
    const doc = {updated_at: new Date().toISOString(), clock_fix_ms: clockFix(), ua: navigator.userAgent, items};
    for (let t = 0; ; t++) {
      const cur = await readJson('receipts.json');
      try { await writeJson('receipts.json', doc, cur.sha, 'app: квитанции пушей'); break; }
      catch (e) { if (!(t < 1 && /409|422/.test(String(e.message)))) throw e; }
    }
    ls.set('rcpt_sig', sig); ls.set('rcpt_at', String(Date.now()));
  } catch (_) {} finally { rcptBusy = false; }
}
let feedEtag = ls.get('feed_etag') || '';
async function loadFeed() {
  if (!token()) { $('conn').textContent = 'Нет ключа доступа (вкладка «Ещё»)'; return; }
  try {
    const r = await gh('feed.json', {headers: Object.assign({Accept: 'application/vnd.github.raw+json'}, feedEtag ? {'If-None-Match': feedEtag} : {})});
    const now = new Date().toLocaleTimeString('ru-RU', {hour: '2-digit', minute: '2-digit', second: '2-digit'});
    if (r.status === 304) { $('conn').textContent = 'На связи · ' + now; uploadReceipts(); return; }
    if (r.status === 404) { $('conn').textContent = 'На связи, лента пока пустая'; return; }
    if (!r.ok) throw new Error(r.status);
    feedEtag = r.headers.get('ETag') || ''; ls.set('feed_etag', feedEtag);
    const j = await r.json();
    for (const it of (j.items || [])) {
      const old = await Store.get(it.id);
      await Store.put(Object.assign({}, it, old && old.received_at ? {received_at: old.received_at, app_open: old.app_open} : {}));
    }
    await Store.trim();
    $('conn').textContent = 'На связи · ' + now;
    renderFeed(); uploadReceipts();
  } catch (e) { $('conn').textContent = 'Нет связи с хранилищем (' + (e.message || e) + ')'; }
}

// ---------- Цели ----------
// targets.json пишет комп (что ищется сейчас и цифры по каждой цели), prefs.json пишет приложение (твой выбор).
// Комп читает prefs.json только как сито перед отправкой пуша: если файл сломан или пропал, пуши идут как раньше.
// targets.json: {updated, groups:[{id,name,median_min,add_min}], targets:[{id,group,kind,name,sub,on,market,sales_month,pushes_month,listed,median_min}],
//                ram_tree:{DDR4:[{set,label,market,sales_month}], DDR5:[...]}}
// prefs.json:   {rev, targets:{<id>:{on:false}}, ram:[{type,set,use}]}
const rub = n => n == null ? '—' : Math.round(n).toLocaleString('ru-RU') + ' ₽';
const num = n => n == null ? '—' : String(n);
const mins = n => n == null ? '—' : Math.round(n) + ' мин';
const USES = [['desktop', 'Компьютерная'], ['laptop', 'Ноутбучная']];
let goals = null, prefs = {rev: 0, targets: {}, ram: []}, prefsSha = null, gOpen = {}, gOffOpen = {}, gAdd = {type: 'DDR4', sets: [], use: 'desktop'};
const ramId = r => 'ram-' + r.type.toLowerCase() + '-' + r.set + '-' + r.use;
const ramName = r => 'Оперативка ' + r.type + ' ' + String(r.set).replace('x', '×') + ', ' + (r.use === 'laptop' ? 'ноутбучная' : 'компьютерная');
const isOn = t => { const p = prefs.targets[t.id]; return p && 'on' in p ? p.on !== false : t.on !== false; };
async function loadGoals() {
  if (!token()) { $('gmsg').textContent = 'Сначала вставь ключ доступа на вкладке «Ещё».'; return; }
  $('gmsg').textContent = 'Загружаю…';
  try {
    const [tg, pf] = await Promise.all([readJson('targets.json'), readJson('prefs.json')]);
    goals = tg.data; prefsSha = pf.sha;
    if (pf.data) prefs = Object.assign({rev: 0, targets: {}, ram: []}, pf.data);
    $('gmsg').textContent = goals ? 'Обновлено ' + new Date(goals.updated).toLocaleString('ru-RU', {day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'}) : 'Список целей ещё не пришёл с компа. Оперативку уже можно добавить, пуши по ней начнутся, когда комп подхватит.';
  } catch (e) { $('gmsg').textContent = 'Не удалось загрузить: ' + (e.message || e); }
  renderGoals();
}
function goalRow(t) {
  const on = isOn(t), open = gOpen[t.id];
  const det = open ? `<div class="det"><span>Обычно продают за</span><span>${rub(t.market)}</span><span>Продаж за месяц</span><span>${num(t.sales_month)}</span>
    <span>Выгодных пушей за месяц</span><span>${num(t.pushes_month)}</span><span>Сейчас на Авито</span><span>${num(t.listed)}</span>
    <span>Находка через</span><span>${mins(t.median_min)}</span></div>` : '';
  const sub = t.sub || (t.pushes_month != null ? t.pushes_month + ' пушей за месяц' : '');
  return `<div class="row ${on ? '' : 'off'}" data-open="${esc(t.id)}"><span class="ar">${open ? '▾' : '▸'}</span>
    <div class="l">${esc(t.name)}${sub ? `<div class="h">${esc(sub)}</div>` : ''}</div>
    <label class="sw" data-stop="1"><input type="checkbox" data-goal="${esc(t.id)}" ${on ? 'checked' : ''}><span></span></label></div>${det}`;
}
function renderGoals() {
  const ts = (goals && goals.targets) || [];
  const groups = (goals && goals.groups && goals.groups.length) ? goals.groups : [{id: 'fast', name: 'Быстрый поиск'}, {id: 'other', name: 'Остальные цели'}];
  const known = new Set(ts.map(t => t.id));
  const ramRows = (prefs.ram || []).map(r => ({id: ramId(r), group: 'other', kind: 'ram', name: ramName(r), sub: 'твоя цель', ram: r}))
    .filter(r => !known.has(r.id));
  $('ggroups').innerHTML = groups.map(g => {
    const rows = ts.filter(t => (t.group || 'other') === g.id).concat(g.id === 'other' ? ramRows : []);
    const one = t => t.ram
      ? `<div class="row"><span class="ar">·</span><div class="l">${esc(t.name)}<div class="h">${esc(t.sub)}</div></div><button class="sec" data-delram="${esc(t.id)}" style="padding:8px 12px">Убрать</button></div>`
      : goalRow(t);
    // Выключенные цели прячем в свёрнутый список внизу группы, чтобы не листать их каждый раз
    const onRows = rows.filter(t => t.ram || isOn(t)), offRows = rows.filter(t => !t.ram && !isOn(t));
    const offHtml = offRows.length ? `<button class="offt" data-offg="${esc(g.id)}">${gOffOpen[g.id] ? '▾' : '▸'} Выключенные: ${offRows.length}</button>${gOffOpen[g.id] ? offRows.map(one).join('') : ''}` : '';
    const rowsHtml = rows.length ? (onRows.length ? onRows.map(one).join('') : '<p class="m">Все цели здесь выключены.</p>') + offHtml : '<p class="m">Пока пусто.</p>';
    const fc = g.add_min != null && g.id === 'other' ? `<div class="fc">Если добавить ещё цель: примерно +${Math.round(g.add_min)} мин</div>` : '';
    return `<div class="card"><div class="gh"><b>${g.id === 'fast' ? '⚡ ' : ''}${esc(g.name)}</b><span class="md">${g.median_min != null ? 'находка через ~' + Math.round(g.median_min) + ' мин' : (goals ? '<span style="color:var(--muted)">мало данных для медианы</span>' : '')}</span></div>${rowsHtml}${fc}</div>`;
  }).join('');
  $('ggroups').querySelectorAll('[data-open]').forEach(el => el.onclick = e => { if (e.target.closest('[data-stop]')) return; gOpen[el.dataset.open] = !gOpen[el.dataset.open]; renderGoals(); });
  $('ggroups').querySelectorAll('[data-offg]').forEach(el => el.onclick = () => { gOffOpen[el.dataset.offg] = !gOffOpen[el.dataset.offg]; renderGoals(); });
  $('ggroups').querySelectorAll('[data-goal]').forEach(el => el.onchange = () => {
    prefs.targets[el.dataset.goal] = {on: el.checked}; savePrefs(el.checked ? 'Цель включена' : 'Цель выключена и убрана вниз, в «Выключенные»'); renderGoals();
  });
  $('ggroups').querySelectorAll('[data-delram]').forEach(el => el.onclick = () => {
    prefs.ram = (prefs.ram || []).filter(r => ramId(r) !== el.dataset.delram); savePrefs('Цель убрана'); renderGoals();
  });
}
function renderAdd() {
  const tree = (goals && goals.ram_tree) || {};
  const types = Object.keys(tree).length ? Object.keys(tree) : ['DDR4', 'DDR5'];
  if (!types.includes(gAdd.type)) gAdd.type = types[0];
  $('gtype').innerHTML = types.map(t => `<button class="chip ${t === gAdd.type ? 'on' : ''}" data-gt="${esc(t)}">${esc(t)}</button>`).join('');
  const sets = tree[gAdd.type] || [];
  $('gset').innerHTML = sets.length ? sets.map(x => `<button class="chip ${gAdd.sets.includes(x.set) ? 'on' : ''}" data-gs="${esc(x.set)}">${esc(x.label || x.set)} <span class="m" style="color:var(--ok)">${x.market != null ? rub(x.market) : ''}</span></button>`).join('')
    : '<p class="m">Наборы и цены появятся, когда комп посчитает рынок оперативки.</p>';
  $('guse').innerHTML = USES.map(([k, l]) => `<button class="chip ${k === gAdd.use ? 'on' : ''}" data-gu="${k}">${l}</button>`).join('');
  $('gaddnote').textContent = gAdd.sets.length ? 'Пуши придут только по: ' + gAdd.sets.map(s => ramName({type: gAdd.type, set: s, use: gAdd.use})).join('; ') + '.' : 'Выбери один или несколько наборов.';
  $('gtype').querySelectorAll('[data-gt]').forEach(b => b.onclick = () => { gAdd.type = b.dataset.gt; gAdd.sets = []; renderAdd(); });
  $('gset').querySelectorAll('[data-gs]').forEach(b => b.onclick = () => { const v = b.dataset.gs, i = gAdd.sets.indexOf(v); if (i >= 0) gAdd.sets.splice(i, 1); else gAdd.sets.push(v); renderAdd(); });
  $('guse').querySelectorAll('[data-gu]').forEach(b => b.onclick = () => { gAdd.use = b.dataset.gu; renderAdd(); });
}
$('gaddopen').onclick = () => { $('gadd').hidden = false; $('gaddopen').hidden = true; renderAdd(); };
$('gaddcancel').onclick = () => { $('gadd').hidden = true; $('gaddopen').hidden = false; };
$('gaddsave').onclick = () => {
  if (!gAdd.sets.length) { toast('Выбери набор'); return; }
  const have = new Set((prefs.ram || []).map(ramId));
  gAdd.sets.forEach(s => { const r = {type: gAdd.type, set: s, use: gAdd.use}; if (!have.has(ramId(r))) prefs.ram.push(r); });
  gAdd.sets = []; $('gadd').hidden = true; $('gaddopen').hidden = false; savePrefs('Цель сохранена'); renderGoals();
};
async function savePrefs(okText) {
  if (!token()) { toast('Нужен ключ доступа'); return; }
  prefs.rev = Date.now(); prefs.updated_at = new Date().toISOString();
  try {
    for (let t = 0; ; t++) {
      try { prefsSha = await writeJson('prefs.json', prefs, prefsSha, 'app: цели'); break; }
      catch (e) { if (t < 1 && /409|422/.test(String(e.message))) prefsSha = (await readJson('prefs.json')).sha; else throw e; }
    }
    toast(okText);
  } catch (e) { toast('Не сохранилось: ' + (e.message || e)); }
}

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
    if (c.type === 'bool') settings.values[k] = el.checked;
    else {
      let n = Number(el.value); if (!isFinite(n)) n = c.default;
      if (c.min != null) n = Math.max(c.min, n); if (c.max != null) n = Math.min(c.max, n);
      el.value = n; settings.values[k] = n;
    }
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
// Внутри своего Android-приложения «Охотник» уведомления показывает само приложение, а не Chrome
const NATIVE = (() => { try { return !!window.HunterApp; } catch (_) { return false; } })();
function nativeState() {
  let st = {}; try { st = JSON.parse(window.HunterApp.status() || '{}'); } catch (_) {}
  const warn = [];
  if (!st.has_token) warn.push('вставь ключ доступа ниже');
  if (st.notifications === false) warn.push('разреши уведомления');
  if (st.battery_free === false) warn.push('сними ограничение батареи');
  $('pushstate').textContent = 'Уведомления показывает приложение «Охотник» (версия ' + (st.version || '?') + '). ' +
    (warn.length ? 'Нужно: ' + warn.join(', ') + '.' : 'Всё включено. ') + (st.status ? ' ' + st.status : '');
  $('pushbtn').textContent = 'Проверить уведомление';
  $('pushtest').hidden = false; $('pushtest').textContent = st.battery_free === false ? 'Снять ограничение батареи' : 'Настройки батареи';
  $('pushfresh').hidden = false; $('pushfresh').textContent = 'Настройки уведомлений';
}
async function pushState() {
  if (NATIVE) { nativeState(); return; }
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) { $('pushstate').textContent = 'Этот браузер не умеет пуши.'; return; }
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg && await reg.pushManager.getSubscription();
    $('pushstate').textContent = sub && Notification.permission === 'granted' ? 'Пуши включены.' : 'Не включены.';
    $('pushbtn').textContent = sub ? 'Записать подписку ещё раз' : 'Включить пуши';
    $('pushtest').hidden = !sub; $('pushfresh').hidden = !sub;
  } catch (_) {}
}
// Записать подписку в хранилище, чтобы комп слал на неё. Пишем только если адрес новый (или force).
async function saveSub(sub, force) {
  const subJson = sub.toJSON();
  if (!token()) return false;
  if (!force && ls.get('sub_endpoint') === subJson.endpoint) return true;
  const id = (subJson.keys.auth || 'dev').replace(/[^A-Za-z0-9]/g, '').slice(0, 16);
  const cur = await readJson('subs/' + id + '.json');
  await writeJson('subs/' + id + '.json', {added: new Date().toISOString(), ua: navigator.userAgent, subscription: subJson}, cur.sha, 'app: подписка на пуши');
  ls.set('sub_endpoint', subJson.endpoint);
  return true;
}
// 23.11: кнопка больше НЕ убивает подписку. Каждая новая подписка делала старую мёртвой, и пуши, ушедшие на неё, терялись.
// Обычное нажатие = записать текущую подписку ещё раз; новая подписка — только отдельной кнопкой «Новая подписка».
async function doSubscribe(fresh) {
  try {
    const reg = await navigator.serviceWorker.register('sw.js'); await navigator.serviceWorker.ready;
    if (await Notification.requestPermission() !== 'granted') { toast('Уведомления не разрешены в настройках сайта'); return; }
    let sub = await reg.pushManager.getSubscription();
    if (sub && fresh) { try { await sub.unsubscribe(); } catch (_) {} sub = null; }
    if (!sub) sub = await reg.pushManager.subscribe({userVisibleOnly: true, applicationServerKey: b64u(CFG.publicKey)});
    toast(await saveSub(sub, true) ? (fresh ? 'Новая подписка записана' : 'Пуши включены и записаны') : 'Пуши включены. Вставь ключ доступа, чтобы парсер мог слать пуши.');
    pushState();
  } catch (e) { toast('Ошибка: ' + (e.message || e)); }
}
$('pushbtn').onclick = () => { if (NATIVE) { window.HunterApp.testNotification(); setTimeout(nativeState, 500); return; } doSubscribe(false); };
$('pushfresh').onclick = () => { if (NATIVE) { window.HunterApp.openNotificationSettings(); return; } if ($('pushfresh').dataset.arm) { delete $('pushfresh').dataset.arm; doSubscribe(true); } else { $('pushfresh').dataset.arm = '1'; toast('Нажми ещё раз: старая подписка умрёт. Нужно, только если пуши совсем не идут'); setTimeout(() => delete $('pushfresh').dataset.arm, 5000); } };
// При каждом запуске: если Chrome сам сменил подписку, тихо записываем новую
async function syncSub() { if (NATIVE) return; try { const reg = await navigator.serviceWorker.getRegistration(); const sub = reg && await reg.pushManager.getSubscription(); if (sub && Notification.permission === 'granted') await saveSub(sub, false); } catch (_) {} }
$('pushtest').onclick = async () => {
  if (NATIVE) { window.HunterApp.openBatterySettings(); return; }
  const reg = await navigator.serviceWorker.getRegistration(); const sub = reg && await reg.pushManager.getSubscription();
  if (!sub) return; $('subtext').hidden = false; $('subtext').value = JSON.stringify(sub.toJSON()); $('subtext').select();
};
$('savetoken').onclick = async () => {
  const v = $('token').value.trim(); if (!v) return;
  ls.set('gh_token', v); $('token').value = ''; feedEtag = ''; ls.set('feed_etag', '');
  if (NATIVE) { try { window.HunterApp.setToken(v); } catch (_) {} setTimeout(nativeState, 800); }
  $('tokenmsg').textContent = 'Проверяю…';
  try { const r = await gh('feed.json'); const ok = r.ok || r.status === 404; $('tokenmsg').textContent = ok ? 'Ключ принят.' : 'Ключ не подошёл (' + r.status + ').'; if (ok) loadFeed(); }
  catch (e) { $('tokenmsg').textContent = 'Нет связи с GitHub.'; }
};
$('reload').onclick = async () => {
  try { const rs = await navigator.serviceWorker.getRegistrations(); for (const r of rs) await r.update(); const ks = await caches.keys(); for (const k of ks) await caches.delete(k); } catch (_) {}
  location.replace(location.pathname + '?r=' + Date.now());
};

// ---------- Запуск ----------
$('ver').textContent = 'Версия ' + CFG.version + (clockFix() ? ' · часы телефона ' + (clockFix() > 0 ? 'отстают на ' : 'спешат на ') + Math.abs(clockFix() / 1000) + ' с' : '');
if (token()) $('tokenmsg').textContent = 'Ключ сохранён (…' + token().slice(-4) + '). Вставлять заново не нужно.';
// Автообновление: если на сервере версия новее, приложение само перезагружается со свежими файлами
async function autoUpdate() {
  try {
    const r = await fetch('version.json?t=' + Date.now(), {cache: 'no-store'}); if (!r.ok) return; noteServerTime(r);
    const v = (await r.json()).v;
    if (v && v !== CFG.version) {
      const key = 'upd_' + v; let done = false; try { done = sessionStorage.getItem(key); sessionStorage.setItem(key, '1'); } catch (_) {}
      if (done) return;
      try { const ks = await caches.keys(); for (const k of ks) await caches.delete(k); const rs = await navigator.serviceWorker.getRegistrations(); for (const x of rs) await x.update(); } catch (_) {}
      location.replace(location.pathname + '?r=' + Date.now());
    }
  } catch (_) {}
}
autoUpdate(); setInterval(autoUpdate, 5 * 60 * 1000);
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
  navigator.serviceWorker.addEventListener('message', e => {
    if (e.data && e.data.type === 'item') renderFeed();
    if (e.data && e.data.type === 'go') showGo(e.data.url);
  });
}
if (NATIVE && token()) { try { window.HunterApp.setToken(token()); } catch (_) {} }
renderFeed(); loadFeed(); pushState(); syncSub();
if (NATIVE) setInterval(() => { if (document.visibilityState === 'visible') nativeState(); }, 5000);
setInterval(() => { if (document.visibilityState === 'visible') loadFeed(); }, CFG.pollMs);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { renderFeed(); loadFeed(); } });
try { const go = new URLSearchParams(location.search).get('go'); if (go) showGo(go); } catch (_) {}
