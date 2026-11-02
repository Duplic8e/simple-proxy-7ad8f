'use strict';

const STORE_KEY = 'pantry-chef-v1';
const CATEGORIES = ['Produce', 'Meat & Fish', 'Dairy & Eggs', 'Grains & Pasta', 'Canned & Jarred', 'Frozen', 'Baking', 'Spices & Herbs', 'Oils & Sauces', 'Snacks & Other'];
const EQUIPMENT = [
  { id: 'air fryer', label: 'Air fryer' },
  { id: 'oven', label: 'Oven' },
  { id: 'stove', label: 'Stove' },
  { id: 'pan', label: 'Pan' },
  { id: 'pot', label: 'Pot' },
];
const FREE_STAPLES = ['salt', 'pepper', 'oil', 'water'];

// ---------- state ----------
const defaults = () => ({
  items: [],
  equipment: EQUIPMENT.map((e) => e.id),
  prefs: { meal: 'any', servings: 2, maxMinutes: '', notes: '' },
});

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY));
    if (raw && Array.isArray(raw.items)) return { ...defaults(), ...raw, prefs: { ...defaults().prefs, ...(raw.prefs || {}) } };
  } catch (e) { /* ignore */ }
  return defaults();
}
let state = load();
const save = () => { try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { toast('Could not save (storage full or blocked)'); } };

let tab = 'pantry';
let search = '';

// ---------- helpers ----------
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
const num = (v) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n >= 0 ? n : 0; };

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

// ---------- prompt / export ----------
function pantryForClaude() {
  return {
    pantry: state.items
      .filter((i) => i.current > 0)
      .map((i) => ({ name: i.name, category: i.category, available_grams: i.current })),
    equipment: state.equipment,
    free_staples: FREE_STAPLES,
    preferences: {
      meal_type: state.prefs.meal,
      servings: Number(state.prefs.servings) || 2,
      ...(state.prefs.maxMinutes ? { max_total_minutes: Number(state.prefs.maxMinutes) } : {}),
      ...(state.prefs.notes.trim() ? { notes: state.prefs.notes.trim() } : {}),
    },
  };
}

function buildPrompt() {
  const data = pantryForClaude();
  const equip = data.equipment.length ? data.equipment.join(', ') : '(none selected)';
  return `You are a practical home-cooking assistant. Using the JSON below, create ONE recipe.

Rules:
1. Use ONLY ingredients listed in "pantry", plus the free staples: ${FREE_STAPLES.join(', ')}. Do not use any other ingredient, not even common ones.
2. Every quantity in "pantry" is in GRAMS (liquids too, so treat 1 ml of water-like liquid as about 1 g). Never use more of an ingredient than "available_grams". You do not have to use everything.
3. Cook ONLY with this equipment: ${equip}. No microwave, grill, blender, or anything else.
4. Respect the "preferences" (meal type, servings, time limit, notes).
5. Give ALL ingredient amounts in grams (free staples may use teaspoons/tablespoons/"to taste").
6. If a good recipe isn't possible with these items, say so and suggest the single most useful thing to add instead of breaking the rules.

Respond in this format:
- Title
- Servings, prep time, cook time
- Equipment used
- Ingredients (with grams) — and mark which are free staples
- Numbered steps (include temperatures and times)
- "Pantry deductions": a JSON array like [{"name": "...", "grams_used": 0}] for the non-staple ingredients, so I can update my pantry.

My pantry JSON:
\`\`\`json
${JSON.stringify(data, null, 2)}
\`\`\``;
}

function buildBackup() {
  return {
    app: 'pantry-chef',
    version: 1,
    equipment: state.equipment,
    preferences: state.prefs,
    pantry: state.items.map((i) => ({ name: i.name, category: i.category, current_grams: i.current, max_grams: i.max })),
  };
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
    document.body.appendChild(ta);
    ta.focus(); ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (err) { /* ignore */ }
    ta.remove();
    return ok;
  }
}

// ---------- import ----------
function parseImport(text) {
  let data;
  try { data = JSON.parse(text); } catch (e) { throw new Error('That file is not valid JSON.'); }
  const list = Array.isArray(data) ? data : (data.pantry || data.items);
  if (!Array.isArray(list)) throw new Error('No "pantry" list found in the file.');
  const items = list.map((r, idx) => {
    const name = String(r.name || '').trim();
    if (!name) throw new Error(`Item #${idx + 1} has no name.`);
    const cur = r.current_grams ?? r.available_grams ?? r.current_g ?? r.current ?? r.max_grams ?? r.max;
    const max = r.max_grams ?? r.max_g ?? r.max ?? cur;
    const m = num(max);
    return { id: uid(), name, category: CATEGORIES.includes(r.category) ? r.category : (r.category ? String(r.category) : 'Snacks & Other'), max: m, current: Math.min(num(cur), Math.max(m, num(cur))) };
  });
  return { items, equipment: Array.isArray(data.equipment) ? data.equipment.map(String) : null, prefs: data.preferences && typeof data.preferences === 'object' ? data.preferences : null };
}

function applyImport(text, label) {
  try {
    const clean = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    const imp = parseImport(clean);
    if (!confirm(`Replace your current pantry (${state.items.length} items) with ${imp.items.length} items from ${label}?`)) return false;
    state.items = imp.items;
    if (imp.equipment) state.equipment = imp.equipment;
    if (imp.prefs) state.prefs = { ...state.prefs, ...imp.prefs };
    save(); render();
    toast(`Imported ${imp.items.length} items`);
    return true;
  } catch (e) { alert(e.message); return false; }
}

function handleFile(file) {
  const reader = new FileReader();
  reader.onload = () => applyImport(String(reader.result), `"${file.name}"`);
  reader.onerror = () => alert('Could not read that file.');
  reader.readAsText(file);
}

function openPasteDialog() {
  const dlg = $('#dlg');
  dlg.innerHTML = `
    <form method="dialog" id="pasteForm">
      <h3>Paste pantry JSON</h3>
      <p class="hint">Replaces your whole pantry.</p>
      <textarea id="paste-text" class="preview" placeholder='{"pantry": [...]}' autocapitalize="off" autocorrect="off" spellcheck="false"></textarea>
      <div style="margin-top:14px">
        <button class="btn" value="go">Import</button>
        <button class="btn secondary" type="button" id="paste-cancel">Cancel</button>
      </div>
    </form>`;
  dlg.querySelector('#paste-cancel').addEventListener('click', () => dlg.close());
  dlg.querySelector('form').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const text = dlg.querySelector('#paste-text').value;
    if (!text.trim()) return;
    if (applyImport(text, 'the pasted text')) dlg.close();
  });
  dlg.showModal();
}

// ---------- item dialog ----------
function openItemDialog(id) {
  const existing = state.items.find((i) => i.id === id);
  const it = existing || { name: '', category: CATEGORIES[0], max: 1000, current: 1000 };
  const dlg = $('#dlg');
  dlg.innerHTML = `
    <form method="dialog" id="itemForm">
      <h3>${existing ? 'Edit item' : 'Add item'}</h3>
      <label>Name</label>
      <input id="f-name" value="${esc(it.name)}" placeholder="e.g. Chicken breast" autocomplete="off" required>
      <label>Category</label>
      <select id="f-cat">${CATEGORIES.map((c) => `<option ${c === it.category ? 'selected' : ''}>${esc(c)}</option>`).join('')}${CATEGORIES.includes(it.category) ? '' : `<option selected>${esc(it.category)}</option>`}</select>
      <label>Max quantity (grams) — what "full" means</label>
      <input id="f-max" type="number" inputmode="numeric" min="0" value="${it.max}" required>
      <label>Current quantity (grams)</label>
      <input id="f-cur" type="number" inputmode="numeric" min="0" value="${it.current}" required>
      <div class="chips">
        ${[['Full', 1], ['¾', .75], ['½', .5], ['¼', .25], ['Empty', 0]].map(([l, f]) => `<button type="button" data-f="${f}">${l}</button>`).join('')}
      </div>
      <p class="hint">${existing ? '' : 'New items start full. '}Tap a chip to set the current amount from max.</p>
      <div style="margin-top:14px">
        <button class="btn" value="save">Save</button>
        <button class="btn secondary" type="button" id="f-cancel">Cancel</button>
        ${existing ? '<button class="btn danger" type="button" id="f-del">Delete item</button>' : ''}
      </div>
    </form>`;
  const max = dlg.querySelector('#f-max');
  const cur = dlg.querySelector('#f-cur');
  let curTouched = !!existing;
  cur.addEventListener('input', () => { curTouched = true; });
  max.addEventListener('input', () => { if (!curTouched) cur.value = max.value; });
  dlg.querySelectorAll('.chips button').forEach((b) => b.addEventListener('click', () => {
    cur.value = Math.round(num(max.value) * Number(b.dataset.f));
    curTouched = true;
  }));
  dlg.querySelector('#f-cancel').addEventListener('click', () => dlg.close());
  const del = dlg.querySelector('#f-del');
  if (del) del.addEventListener('click', () => {
    if (confirm(`Delete "${it.name}"?`)) { state.items = state.items.filter((i) => i.id !== id); save(); dlg.close(); render(); }
  });
  dlg.querySelector('form').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const name = dlg.querySelector('#f-name').value.trim();
    if (!name) return;
    const m = num(max.value);
    const c = num(cur.value);
    const rec = { name, category: dlg.querySelector('#f-cat').value, max: Math.max(m, c), current: c };
    if (existing) Object.assign(existing, rec);
    else state.items.push({ id: uid(), ...rec });
    save(); dlg.close(); render();
  });
  dlg.showModal();
}

// ---------- views ----------
function pantryView() {
  const q = search.trim().toLowerCase();
  const items = state.items.filter((i) => !q || i.name.toLowerCase().includes(q));
  let html = `<input type="search" id="search" placeholder="Search pantry" value="${esc(search)}">`;
  if (!state.items.length) {
    html += '<div class="empty">Your pantry is empty.<br>Tap <b>+</b> to add your first item.<br><br>New items start full; update them as you use stuff.</div>';
  } else if (!items.length) {
    html += '<div class="empty">No matches.</div>';
  } else {
    const cats = [...new Set(items.map((i) => i.category))].sort((a, b) => (CATEGORIES.indexOf(a) + 99 * (CATEGORIES.indexOf(a) < 0)) - (CATEGORIES.indexOf(b) + 99 * (CATEGORIES.indexOf(b) < 0)));
    for (const c of cats) {
      html += `<div class="cat">${esc(c)}</div>`;
      for (const i of items.filter((x) => x.category === c).sort((a, b) => a.name.localeCompare(b.name))) {
        const pct = i.max ? Math.min(100, Math.round((i.current / i.max) * 100)) : 0;
        const cls = i.current === 0 ? 'out' : pct <= 25 ? 'low' : '';
        html += `<button class="item" data-id="${i.id}"><div class="line"><span class="name">${esc(i.name)}</span><span class="qty">${i.current} / ${i.max} g</span></div><div class="bar"><i class="${cls}" style="width:${pct}%"></i></div></button>`;
      }
    }
  }
  html += '<button class="fab" id="add" aria-label="Add item">+</button>';
  return html;
}

function recipeView() {
  const p = state.prefs;
  const inStock = state.items.filter((i) => i.current > 0).length;
  const prompt = buildPrompt();
  return `
    <div class="card">
      <h2>Preferences</h2>
      <label>Meal type</label>
      <select id="p-meal">${['any', 'breakfast', 'lunch', 'dinner', 'snack', 'dessert'].map((m) => `<option ${m === p.meal ? 'selected' : ''}>${m}</option>`).join('')}</select>
      <div class="row">
        <div><label>Servings</label><input id="p-serv" type="number" inputmode="numeric" min="1" value="${esc(p.servings)}"></div>
        <div><label>Max minutes</label><input id="p-min" type="number" inputmode="numeric" min="0" placeholder="any" value="${esc(p.maxMinutes)}"></div>
      </div>
      <label>Notes (cravings, diet, dislikes)</label>
      <textarea id="p-notes" rows="2" placeholder="e.g. high protein, no spicy food">${esc(p.notes)}</textarea>
    </div>
    <button class="btn" id="copy">📋 Copy prompt + pantry</button>
    <p class="hint">${inStock} item${inStock === 1 ? '' : 's'} in stock will be included. Items at 0 g are left out. Paste the result into Claude.</p>
    <label>Preview</label>
    <textarea class="preview" readonly id="preview">${esc(prompt)}</textarea>`;
}

function settingsView() {
  return `
    <div class="card">
      <h2>Equipment</h2>
      ${EQUIPMENT.map((e) => `<label class="check"><input type="checkbox" data-eq="${e.id}" ${state.equipment.includes(e.id) ? 'checked' : ''}> ${e.label}</label>`).join('')}
      <p class="hint">Recipes will only use what's checked. Salt, pepper, oil and water are always free.</p>
    </div>
    <div class="card">
      <h2>Pantry data</h2>
      <p class="hint">Stored only on this device. Back it up regularly.</p>
      <button class="btn secondary" id="upload">⬆️ Upload JSON (replaces pantry)</button>
      <button class="btn secondary" id="paste">📥 Paste JSON (replaces pantry)</button>
      <button class="btn secondary" id="download">⬇️ Download pantry JSON</button>
      <button class="btn secondary" id="copyjson">📋 Copy pantry JSON only</button>
      <button class="btn danger" id="clear">Clear entire pantry</button>
    </div>`;
}

const TITLES = { pantry: 'Pantry', recipe: 'Recipe', settings: 'Settings' };

function render() {
  $('#title').textContent = TITLES[tab];
  document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  const view = $('#view');
  view.innerHTML = { pantry: pantryView, recipe: recipeView, settings: settingsView }[tab]();
  bind();
}

function bind() {
  const on = (sel, ev, fn) => { const el = $(sel); if (el) el.addEventListener(ev, fn); };
  if (tab === 'pantry') {
    on('#add', 'click', () => openItemDialog());
    document.querySelectorAll('.item').forEach((b) => b.addEventListener('click', () => openItemDialog(b.dataset.id)));
    on('#search', 'input', (e) => {
      search = e.target.value;
      const pos = e.target.selectionStart;
      render();
      const s = $('#search'); s.focus(); s.setSelectionRange(pos, pos);
    });
  }
  if (tab === 'recipe') {
    const upd = () => {
      state.prefs.meal = $('#p-meal').value;
      state.prefs.servings = $('#p-serv').value;
      state.prefs.maxMinutes = $('#p-min').value;
      state.prefs.notes = $('#p-notes').value;
      save();
      $('#preview').value = buildPrompt();
    };
    ['#p-meal', '#p-serv', '#p-min', '#p-notes'].forEach((s) => on(s, 'input', upd));
    on('#copy', 'click', async () => {
      upd();
      if (!state.items.some((i) => i.current > 0)) { toast('Pantry has nothing in stock yet'); return; }
      toast((await copyText(buildPrompt())) ? 'Copied! Paste it into Claude' : 'Copy failed — select the preview text manually');
    });
  }
  if (tab === 'settings') {
    document.querySelectorAll('[data-eq]').forEach((c) => c.addEventListener('change', () => {
      state.equipment = [...document.querySelectorAll('[data-eq]')].filter((x) => x.checked).map((x) => x.dataset.eq);
      save();
    }));
    on('#upload', 'click', () => { $('#file').value = ''; $('#file').click(); });
    on('#paste', 'click', openPasteDialog);
    on('#download', 'click', () => {
      const blob = new Blob([JSON.stringify(buildBackup(), null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'pantry.json';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });
    on('#copyjson', 'click', async () => toast((await copyText(JSON.stringify(buildBackup(), null, 2))) ? 'Pantry JSON copied' : 'Copy failed'));
    on('#clear', 'click', () => {
      if (confirm('Delete every item in your pantry? This cannot be undone.')) { state.items = []; save(); render(); toast('Pantry cleared'); }
    });
  }
}

document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.tab; render(); window.scrollTo(0, 0); }));
$('#file').addEventListener('change', (e) => { if (e.target.files[0]) handleFile(e.target.files[0]); });
render();

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
