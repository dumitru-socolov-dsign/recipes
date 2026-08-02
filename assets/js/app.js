/* ═══════════════════════════════════════════════════════════════
   Bucătărie — logica aplicației.
   Fără dependențe. Fără rețea în afară de /app.json. Fără telemetrie.
   Tot ce ține de tine rămâne în localStorage, pe telefonul tău.
   ═══════════════════════════════════════════════════════════════ */

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del(k)    { try { localStorage.removeItem(k); } catch {} },
};

/* ───────────────────────── formatare ───────────────────────── */
const nf = (d) => new Intl.NumberFormat('ro-RO', { minimumFractionDigits: d, maximumFractionDigits: d });
const n0 = nf(0), n1 = nf(1), n2 = nf(2);

/** Aceeași logică ca partials/fmt/qty.html — valorile scalate arată identic cu cele randate la build. */
function fmtQty(q, unit) {
  if (unit === 'buc') {
    const r = Math.round(q * 2) / 2;
    return `${(Number.isInteger(r) ? n0 : n1).format(r)} buc`;
  }
  const big = unit === 'ml' ? 'l' : 'kg';
  if (q >= 1000) return `${n2.format(q / 1000)} ${big}`;
  if (q >= 50)   return `${n0.format(Math.round(q / 5) * 5)} ${unit}`;
  if (q >= 10)   return `${n0.format(Math.round(q))} ${unit}`;
  const r = Math.round(q * 10) / 10;
  return `${(Number.isInteger(r) ? n0 : n1).format(r)} ${unit}`;
}

const eur = (v) => `${n2.format(v)} €`;
const mmss = (s) => {
  s = Math.max(0, Math.round(s));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  const pad = (v) => String(v).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(x)}` : `${pad(m)}:${pad(x)}`;
};

/* ───────────────────────── date ────────────────────────────── */
let _data = null;
const getData = () => (_data ??= fetch('/app.json', { cache: 'no-cache' }).then((r) => r.json()));

/* ───────────────────────── setări ──────────────────────────── */
const SETTINGS_KEY = 'settings.v1';
const DEFAULTS = {
  kcal: 3000, protein: 84, sodium: 2000,
  includeNuts: true, limitPotassium: false, lowSodium: true,
  store: 'tesco', split: false,
};
const getSettings = () => ({ ...DEFAULTS, ...store.get(SETTINGS_KEY, {}) });
const setSettings = (patch) => {
  const s = { ...getSettings(), ...patch };
  store.set(SETTINGS_KEY, s);
  document.dispatchEvent(new CustomEvent('settings:change', { detail: s }));
  return s;
};

/* ═════════════════════════ temă ═════════════════════════════ */
function initTheme() {
  const btn = $('#themeBtn');
  if (!btn) return;
  const sync = () => {
    const cur = document.documentElement.dataset.theme;
    const dark = cur === 'dark' || (!cur && matchMedia('(prefers-color-scheme: dark)').matches);
    $('[data-theme-icon="light"]', btn)?.classList.toggle('hidden', dark);
    $('[data-theme-icon="dark"]', btn)?.classList.toggle('hidden', !dark);
  };
  btn.addEventListener('click', () => {
    const dark = document.documentElement.dataset.theme === 'dark' ||
      (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
    const next = dark ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    store.set('theme', next);
    sync();
  });
  sync();
}

function initAppbar() {
  const bar = $('#appbar');
  if (!bar) return;
  const on = () => bar.classList.toggle('scrolled', window.scrollY > 4);
  addEventListener('scroll', on, { passive: true });
  on();
}

/* ═════════════════ calculator de porții ═════════════════════ */
function initServings() {
  const root = $('[data-recipe][data-base-servings]');
  if (!root) return;
  const base = parseFloat(root.dataset.baseServings) || 1;
  const key = `servings.${root.dataset.recipe}`;
  let cur = store.get(key, base);

  const items = $$('[data-ing]', root).map((li) => ({
    li, qty: parseFloat(li.dataset.qty), unit: li.dataset.unit, out: $('[data-out="qty"]', li),
  }));
  const outServings = $('[data-out="servings"]', root);
  const outCost = $('[data-out="costTotal"]', root);
  const baseCost = outCost ? parseFloat(outCost.textContent.replace(/\s/g, '').replace(',', '.')) : 0;
  const minus = $('[data-serv="-"]', root), plus = $('[data-serv="+"]', root);

  function render() {
    const f = cur / base;
    for (const it of items) it.out.textContent = fmtQty(it.qty * f, it.unit);
    if (outServings) outServings.textContent = n0.format(cur);
    if (outCost) outCost.textContent = n2.format(baseCost * f);
    if (minus) minus.disabled = cur <= 1;
    if (plus) plus.disabled = cur >= 12;
    store.set(key, cur);
  }
  minus?.addEventListener('click', () => { cur = Math.max(1, cur - 1); render(); });
  plus?.addEventListener('click', () => { cur = Math.min(12, cur + 1); render(); });
  render();
}

/* ═══════════════════════ mod gătit ══════════════════════════ */
const Cook = {
  el: null, slug: null, steps: [], i: 0, wake: null, audio: null, tick: null,

  async open(slug, resumeIdx) {
    const d = await getData();
    const r = d.recipes.find((x) => x.slug === slug);
    if (!r || !r.steps.length) return;
    this.slug = slug; this.steps = r.steps;
    this.i = resumeIdx ?? store.get(`cook.${slug}.i`, 0);
    if (this.i >= this.steps.length) this.i = 0;

    this.el = $('#cook');
    this.el.hidden = false;
    this.el.classList.add('is-open');
    document.body.classList.add('is-cooking');
    store.set('cook.active', slug);

    this.unlockAudio();
    this.requestWake();
    this.render();
    if (!this.tick) this.tick = setInterval(() => this.tickTimer(), 250);
  },

  close() {
    this.el?.classList.remove('is-open');
    if (this.el) this.el.hidden = true;
    document.body.classList.remove('is-cooking');
    store.del('cook.active');
    this.releaseWake();
    clearInterval(this.tick); this.tick = null;
  },

  go(delta) {
    const n = this.i + delta;
    if (n < 0) return;
    if (n >= this.steps.length) { this.finish(); return; }
    this.i = n;
    store.set(`cook.${this.slug}.i`, this.i);
    this.render();
  },

  finish() {
    store.del(`cook.${this.slug}.i`);
    this.close();
  },

  render() {
    const s = this.steps[this.i];
    $('#cookCount').textContent = `${this.i + 1}/${this.steps.length}`;
    $('#cookProg').style.width = `${((this.i + 1) / this.steps.length) * 100}%`;
    $('#cookLabel').textContent = s.temp ? `Pasul ${s.n} · ${s.temp}°C` : `Pasul ${s.n}`;
    $('#cookText').textContent = s.text;

    const tip = $('#cookTip');
    tip.textContent = s.tip || '';
    tip.classList.toggle('hidden', !s.tip);

    const box = $('#cookTimerBox');
    box.classList.toggle('hidden', !s.timer);
    if (s.timer) this.paintTimer();

    $('[data-cook="next"] span').textContent =
      this.i === this.steps.length - 1 ? 'Gata' : 'Următorul';
    $('.cook__body').scrollTop = 0;
  },

  timerKey() { return `timer.${this.slug}.${this.i}`; },

  toggleTimer() {
    const s = this.steps[this.i];
    if (!s.timer) return;
    const t = store.get(this.timerKey(), null);
    if (t && t.deadline > Date.now()) {
      store.del(this.timerKey());                       // pornit → oprit
    } else {
      this.unlockAudio();
      store.set(this.timerKey(), { deadline: Date.now() + s.timer * 1000, fired: false });
    }
    this.paintTimer();
  },

  /* Timerul se calculează dintr-un deadline absolut, nu prin decrementare:
     iOS încetinește temporizatoarele când aplicația e în fundal, dar un
     deadline salvat rămâne corect indiferent cât a stat ecranul stins. */
  paintTimer() {
    const s = this.steps[this.i];
    if (!s.timer) return;
    const t = store.get(this.timerKey(), null);
    const clock = $('#cookClock');
    const btn = $('#cookTimerBtn');
    const left = t ? (t.deadline - Date.now()) / 1000 : s.timer;

    clock.textContent = mmss(Math.max(0, left));
    const running = !!t && left > 0;
    const done = !!t && left <= 0;
    clock.classList.toggle('is-done', done);
    $('span', btn).textContent = done ? 'Gata — resetează' : running ? 'Oprește' : 'Pornește timerul';
    $('use', btn).setAttribute('href', running ? '#i-pause' : '#i-play');
    if (done) store.del(this.timerKey());
  },

  tickTimer() {
    if (!this.el?.classList.contains('is-open')) return;
    const s = this.steps[this.i];
    if (!s?.timer) return;
    const t = store.get(this.timerKey(), null);
    if (!t) return;
    if (t.deadline - Date.now() <= 0 && !t.fired) {
      t.fired = true; store.set(this.timerKey(), t);
      this.alarm();
    }
    this.paintTimer();
  },

  /* Pe iOS, AudioContext trebuie deblocat de un gest al utilizatorului.
     Îl deblocăm la „Începe gătitul", nu la expirarea timerului — atunci ar fi prea târziu. */
  unlockAudio() {
    try {
      this.audio ??= new (window.AudioContext || window.webkitAudioContext)();
      if (this.audio.state === 'suspended') this.audio.resume();
    } catch {}
  },

  alarm() {
    try {
      const ctx = this.audio; if (!ctx) return;
      [0, 0.28, 0.56].forEach((off) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine'; o.frequency.value = 880;
        g.gain.setValueAtTime(0.0001, ctx.currentTime + off);
        g.gain.exponentialRampToValueAtTime(0.35, ctx.currentTime + off + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + off + 0.22);
        o.connect(g); g.connect(ctx.destination);
        o.start(ctx.currentTime + off); o.stop(ctx.currentTime + off + 0.24);
      });
    } catch {}
    navigator.vibrate?.([200, 100, 200]);   // ignorat pe iOS, gratuit oriunde altundeva
  },

  async requestWake() {
    try { this.wake = await navigator.wakeLock?.request('screen'); } catch {}
  },
  releaseWake() { try { this.wake?.release(); } catch {} this.wake = null; },
};

function initCook() {
  $$('[data-cook="start"]').forEach((b) =>
    b.addEventListener('click', () => Cook.open(b.dataset.recipe, 0)));

  const el = $('#cook');
  if (!el) return;
  $('[data-cook="close"]', el)?.addEventListener('click', () => Cook.close());
  $('[data-cook="prev"]', el)?.addEventListener('click', () => Cook.go(-1));
  $('[data-cook="next"]', el)?.addEventListener('click', () => Cook.go(1));
  $('[data-cook="timer"]', el)?.addEventListener('click', () => Cook.toggleTimer());

  addEventListener('keydown', (e) => {
    if (!el.classList.contains('is-open')) return;
    if (e.key === 'Escape') Cook.close();
    if (e.key === 'ArrowRight') Cook.go(1);
    if (e.key === 'ArrowLeft') Cook.go(-1);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && el.classList.contains('is-open')) {
      Cook.requestWake();
      Cook.paintTimer();
    }
  });

  /* Legătură directă: /retete/x/?cook=1 intră direct în modul gătit. */
  const deep = new URLSearchParams(location.search).get('cook');
  if (deep) {
    const slug = deep === '1' ? $('[data-cook="start"]')?.dataset.recipe : deep;
    if (slug) { Cook.open(slug, 0); return; }
  }

  /* Reluare: dacă ai închis aplicația în mijlocul gătitului, o redeschidem de unde ai rămas. */
  const active = store.get('cook.active', null);
  if (active && $(`[data-cook="start"][data-recipe="${active}"]`)) Cook.open(active);
}

/* ═══════════════════ lista de cumpărături ═══════════════════ */
function packsFor(need, packSize) { return Math.max(1, Math.ceil(need / packSize - 1e-9)); }

/** Lista de rețete×porții pentru un domeniu: o sesiune anume, sau săptămâna întreagă. */
function scopeRecipes(d, scope) {
  const plan = d.plan;
  if (scope === 'week') {
    const out = plan.sessions.flatMap((s) => s.recipes.map((r) => ({ ...r })));
    out.push({ slug: plan.breakfast, servings: 7 });          // micul dejun, în fiecare zi
    for (const f of plan.fresh) out.push({ slug: f.slug, servings: 1 });
    return { label: 'Săptămâna', recipes: out };
  }
  const sess = plan.sessions.find((x) => x.id === scope) || plan.sessions[0];
  return { label: sess.day_name, recipes: sess.recipes, sess };
}

/**
 * Cantitățile necesare se însumează o singură dată pe tot domeniul, apoi se rotunjesc
 * la pachete. Altfel o pungă de conopidă ar fi numărată de trei ori într-o săptămână.
 */
function buildList(d, scope) {
  const { label, recipes, sess } = scopeRecipes(d, scope);
  const need = new Map();

  for (const r of recipes) {
    const rec = d.recipes.find((x) => x.slug === r.slug);
    if (!rec) continue;
    const f = r.servings / rec.servings;
    for (const ing of rec.ingredients) need.set(ing.key, (need.get(ing.key) || 0) + ing.grams * f);
  }

  const rows = [];
  for (const [key, grams] of need) {
    const meta = d.ingredients[key];
    const price = d.prices.items[key];
    if (!meta || !price) continue;
    const packSize = price.pack.size;
    const packs = packsFor(grams, packSize);
    const buy = packs * packSize;

    const offers = Object.entries(price.stores)
      .map(([st, o]) => ({ store: st, price: o.price, updated: o.updated, source: o.source }));
    const cheapest = offers.reduce((a, b) => (b.price < a.price ? b : a));
    const primary = offers.find((o) => o.store === d.prices.meta.default_store) || cheapest;

    rows.push({
      key, meta, grams, packs, buy, packSize, staple: !!meta.staple,
      packLabel: price.pack.label, unit: price.pack.unit,
      offers, cheapest, primary,
      costPrimary: primary.price * packs,
      costCheapest: cheapest.price * packs,
      /* Valoarea consumată efectiv — restul rămâne în dulap pentru săptămâna viitoare. */
      usedPrimary: (primary.price / packSize) * grams,
      usedCheapest: (cheapest.price / packSize) * grams,
    });
  }
  return { label, sess, rows };
}

function ageDays(iso) {
  if (!iso) return 999;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

function renderList(d, scope, mount) {
  const { label, rows } = buildList(d, scope);
  const aisles = d.stores.aisles;
  const split = getSettings().split;
  const isWeek = scope === 'week';

  const groups = new Map();
  for (const r of rows) {
    if (!groups.has(r.meta.aisle)) groups.set(r.meta.aisle, []);
    groups.get(r.meta.aisle).push(r);
  }
  const ordered = [...groups.entries()]
    .sort((a, b) => (aisles[a[0]]?.order ?? 99) - (aisles[b[0]]?.order ?? 99));

  const cost = (r) => (split ? r.costCheapest : r.costPrimary);
  const used = (r) => (split ? r.usedCheapest : r.usedPrimary);
  const fresh = rows.filter((r) => !r.staple);
  const pantry = rows.filter((r) => r.staple);
  const totalPrimary = rows.reduce((s, r) => s + r.costPrimary, 0);
  const totalSplit = rows.reduce((s, r) => s + r.costCheapest, 0);
  const totalUsed = rows.reduce((s, r) => s + used(r), 0);
  const totalFresh = fresh.reduce((s, r) => s + cost(r), 0);
  const totalPantry = pantry.reduce((s, r) => s + cost(r), 0);
  const total = split ? totalSplit : totalPrimary;
  const saving = totalPrimary - totalSplit;
  const worthIt = saving >= d.stores.strategy.min_saving_for_second_trip;

  const checkedKey = `buy.${scope}`;
  const checked = new Set(store.get(checkedKey, []));
  const oldest = rows.length ? Math.max(...rows.map((r) => ageDays(r.primary.updated))) : 0;
  const stale = oldest > d.prices.meta.stale_after_days;
  const storeName = (st) => d.stores.stores[st]?.name || st;

  const tabs = [{ id: 'week', name: 'Săptămâna' }]
    .concat(d.plan.sessions.map((s) => ({ id: s.id, name: s.day_name })));

  let html = `
    <div class="seg" role="tablist" aria-label="Ce cumperi" style="margin-bottom:var(--s-5)">
      ${tabs.map((t) => `<button role="tab" data-sess="${t.id}" aria-selected="${t.id === scope}">${t.name}</button>`).join('')}
    </div>`;

  html += isWeek
    ? `<div class="notice" style="margin-bottom:var(--s-5)">
         <svg viewBox="0 0 24 24"><use href="#i-info"/></svg>
         <div>Un singur drum la magazin acoperă toată săptămâna. Astea sunt pachetele întregi pe care le pui în coș.</div></div>`
    : `<div class="notice" style="margin-bottom:var(--s-5)">
         <svg viewBox="0 0 24 24"><use href="#i-info"/></svg>
         <div>Ce ai nevoie pe masă în ziua asta de gătit. Dacă ai făcut cumpărăturile pe săptămână, ai deja tot — asta e doar lista de verificat.</div></div>`;

  if (stale) {
    html += `<div class="notice notice--warn" style="margin-bottom:var(--s-5)">
      <svg viewBox="0 0 24 24"><use href="#i-warn"/></svg>
      <div>Prețurile au ${oldest} de zile, deci sunt estimări, nu prețuri de azi.
      Rulează <b>npm run prices:refresh</b> ca să le împrospătezi.</div></div>`;
  }

  html += `<div class="switch" style="margin-bottom:var(--s-5)">
      <div>
        <b style="font-size:.9375rem">Împarte între magazine</b>
        <div class="set__help">${worthIt
          ? `Economisești ${eur(saving)}. ${d.stores.strategy.verdict_split}`
          : `Ai economisi ${eur(saving)}. ${d.stores.strategy.verdict_single}`}</div>
      </div>
      <input type="checkbox" id="splitToggle" ${split ? 'checked' : ''}>
      <span class="switch__track"></span>
    </div>`;

  const sections = [];
  for (const [aisleKey, items] of ordered) {
    const a = aisles[aisleKey] || { name: aisleKey };
    const weekly = items.filter((r) => !r.staple);
    const stock = items.filter((r) => r.staple);
    if (weekly.length) sections.push({ name: a.name, items: weekly, stock: false });
    if (stock.length)  sections.push({ name: `${a.name} · cămară`, items: stock, stock: true });
  }

  let openedStock = false;
  for (const sec of sections) {
    if (sec.stock && !openedStock && isWeek) {
      openedStock = true;
      html += `<hr class="rule">
        <div class="notice" style="margin-bottom:var(--s-5)">
          <svg viewBox="0 0 24 24"><use href="#i-info"/></svg>
          <div><b>Cămara.</b> Uleiuri, oțet, condimente. Se cumpără o dată la câteva luni,
          nu în fiecare săptămână. Prima dată costă ceva; după aia, aproape nimic.</div></div>`;
    }
    const sum = sec.items.reduce((s, r) => s + (isWeek ? cost(r) : used(r)), 0);
    html += `<section class="aisle">
      <div class="aisle__h"><h2>${sec.name}</h2><span class="chip aisle__n num">${eur(sum)}</span></div>
      <ul class="buy">`;
    for (const r of sec.items.sort((x, y) => x.meta.name.localeCompare(y.meta.name, 'ro'))) {
      const offer = split ? r.cheapest : r.primary;
      const id = `b-${scope}-${r.key}`;
      const surplus = r.buy - r.grams;
      const sub = isWeek
        ? `${r.packs} × ${r.packLabel}${split ? ` · ${storeName(offer.store)}` : ''}` +
          (surplus > r.packSize * 0.12 ? ` · folosești ${fmtQty(r.grams, r.unit)}, rămâne ${fmtQty(surplus, r.unit)}` : '')
        : fmtQty(r.grams, r.unit);
      html += `<li>
        <label for="${id}">
          <input type="checkbox" id="${id}" data-buy="${r.key}" ${checked.has(r.key) ? 'checked' : ''}>
          <span class="buy__box"><svg viewBox="0 0 24 24"><use href="#i-check"/></svg></span>
          <span class="buy__main">
            <span class="buy__name">${r.meta.name}</span>
            <span class="buy__sub">${sub}</span>
          </span>
          <span class="buy__price num">${eur(isWeek ? cost(r) : used(r))}</span>
        </label></li>`;
    }
    html += `</ul></section>`;
  }

  html += `<div class="total">
      <div style="flex:1">
        <div class="label">${isWeek ? 'De plătit la casă' : `Valoarea consumată · ${label}`}</div>
        <div class="total__v">${eur(isWeek ? totalFresh : totalUsed)}</div>
        ${isWeek ? `<div class="total__sub">Mâncarea consumată face ${eur(totalUsed)} — asta e cheltuiala reală pe săptămână, restul rămâne în dulap.<br>Prima dată mai adaugi ${eur(totalPantry)} de cămară.</div>` : ''}
      </div>
      <button class="btn btn--ghost" type="button" id="resetBuy">Șterge bifele</button>
    </div>`;

  mount.innerHTML = html;

  $$('[data-sess]', mount).forEach((b) => b.addEventListener('click', () => {
    history.replaceState(null, '', `?s=${b.dataset.sess}`);
    renderList(d, b.dataset.sess, mount);
  }));
  $('#splitToggle', mount)?.addEventListener('change', (e) => {
    setSettings({ split: e.target.checked });
    renderList(d, scope, mount);
  });
  $$('[data-buy]', mount).forEach((cb) => cb.addEventListener('change', () => {
    const set = new Set(store.get(checkedKey, []));
    cb.checked ? set.add(cb.dataset.buy) : set.delete(cb.dataset.buy);
    store.set(checkedKey, [...set]);
  }));
  $('#resetBuy', mount)?.addEventListener('click', () => {
    store.del(checkedKey);
    renderList(d, scope, mount);
  });
}

async function initShopping() {
  const mount = $('#shopping');
  if (!mount) return;
  const d = await getData();
  const want = new URLSearchParams(location.search).get('s');
  const valid = want === 'week' || d.plan.sessions.some((s) => s.id === want);
  renderList(d, valid ? want : 'week', mount);
}

/* ═══════════════════════ săptămâna ══════════════════════════ */
async function initWeek() {
  const mount = $('#weekCost');
  if (!mount) return;
  const d = await getData();
  const { rows } = buildList(d, 'week');
  mount.textContent = eur(rows.filter((r) => !r.meta.staple).reduce((a, r) => a + r.usedPrimary, 0));
  const pantry = $('#weekPantry');
  if (pantry) pantry.textContent = eur(rows.filter((r) => r.meta.staple).reduce((a, r) => a + r.costPrimary, 0));
  const used = $('#weekUsed');
  if (used) used.textContent = eur(rows.reduce((a, r) => a + r.usedPrimary, 0));
}

/* ═══════════════════════ setări ═════════════════════════════ */
function initSettings() {
  const form = $('#settings');
  if (!form) return;
  const s = getSettings();

  $$('[data-set]', form).forEach((el) => {
    const key = el.dataset.set;
    if (el.type === 'checkbox') el.checked = !!s[key];
    else el.value = s[key];
    const out = $(`[data-set-out="${key}"]`, form);
    const paint = () => { if (out) out.textContent = el.type === 'checkbox' ? '' : n0.format(el.value); };
    paint();
    el.addEventListener('input', () => {
      paint();
      setSettings({ [key]: el.type === 'checkbox' ? el.checked : Number(el.value) });
    });
    el.addEventListener('change', () => {
      setSettings({ [key]: el.type === 'checkbox' ? el.checked : Number(el.value) });
    });
  });

  $('#resetSettings')?.addEventListener('click', () => {
    store.del(SETTINGS_KEY);
    location.reload();
  });
  $('#wipeAll')?.addEventListener('click', () => {
    if (!confirm('Ștergi toate datele salvate pe acest telefon? Setări, bife, progres la gătit.')) return;
    try { localStorage.clear(); } catch {}
    location.reload();
  });
}

/* ═══════════════════════ pornire ════════════════════════════ */
initTheme();
initAppbar();
initServings();
initCook();
initShopping();
initWeek();
initSettings();

if ('serviceWorker' in navigator) {
  addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
