/* ═══════════════════════════════════════════════════════════════
   Bucătărie — logica aplicației.
   Fără dependențe. Fără rețea în afară de /app.json. Fără telemetrie.
   Tot ce ține de tine rămâne în localStorage, pe telefonul tău.

   Bilingv: nu există niciun text scris aici. Tot ce se afișează vine din `d.ui`,
   generat de Hugo în /app.json și /en/app.json. La fel numele de ingrediente și de
   raioane — ajung aici deja traduse. Setările și bifele sunt comune celor două limbi,
   fiindcă sunt aceleași date; doar eticheta de deasupra lor se schimbă.
   ═══════════════════════════════════════════════════════════════ */

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del(k)    { try { localStorage.removeItem(k); } catch {} },
};

/* ───────────────────────── formatare ───────────────────────── */
let LOC = document.documentElement.dataset.locale || 'ro-RO';
let UI = {};

const nf = (d) => new Intl.NumberFormat(LOC, { minimumFractionDigits: d, maximumFractionDigits: d });
let n0 = nf(0), n1 = nf(1), n2 = nf(2);
const reformat = () => { n0 = nf(0); n1 = nf(1); n2 = nf(2); };

/** Înlocuiește {marcaje} dintr-un text venit din /app.json. */
const t = (key, vars) => {
  let s = UI[key] || '';
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(v);
  return s;
};

/** Aceeași logică ca partials/fmt/qty.html — valorile scalate arată identic cu cele randate la build. */
function fmtQty(q, unit) {
  if (unit === 'buc') {
    const r = Math.round(q * 2) / 2;
    return `${(Number.isInteger(r) ? n0 : n1).format(r)} ${UI.pieces || 'buc'}`;
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

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ───────────────────────── date ────────────────────────────── */
/* Fiecare limbă are propriul app.json. Calea vine din <body data-app>, pusă de Hugo. */
const APP = document.body?.dataset.app || '/app.json';
let _data = null;
const getData = () => (_data ??= fetch(APP, { cache: 'no-cache' }).then((r) => r.json()));

/* ───────────────────────── setări ──────────────────────────── */
const SETTINGS_KEY = 'settings.v1';
const DEFAULTS = {
  kcal: 3200, protein: 90, sodium: 2000,
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

/* ══════════════════════ porții alese ════════════════════════ */
/* O singură cheie pentru fiecare rețetă, folosită și de pagina rețetei, și de lista de
   cumpărături. Asta era gaura de dinainte: numărul de porții se salva, dar îl citea doar
   pagina pe care îl schimbaseși, așa că lista de cumpărături rămânea la cantitățile din plan. */
const servKey = (slug) => `servings.${slug}`;

/** Porțiile alese pentru o rețetă, sau cele din rețetă dacă n-ai schimbat nimic. */
function chosenServings(rec) {
  const v = store.get(servKey(rec.slug), null);
  return v == null ? rec.servings : v;
}

/** Cu cât se înmulțește tot ce ține de rețeta asta față de plan. */
function servingFactor(d, slug) {
  const rec = d.recipes.find((r) => r.slug === slug);
  if (!rec || !rec.servings) return 1;
  return chosenServings(rec) / rec.servings;
}

const hasCustomServings = (d, slugs) =>
  slugs.some((s) => store.get(servKey(s), null) != null);

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
  const slug = root.dataset.recipe;
  let cur = store.get(servKey(slug), base);

  const items = $$('[data-ing]', root).map((li) => ({
    li, qty: parseFloat(li.dataset.qty), unit: li.dataset.unit, out: $('[data-out="qty"]', li),
  }));
  const outServings = $('[data-out="servings"]', root);
  const outCost = $('[data-out="costTotal"]', root);
  /* Costul de bază se citește dintr-un atribut, nu din textul afișat: acela e formatat
     după limbă (1.234,56 pe română, 1,234.56 pe engleză) și l-am parsa greșit. */
  const baseCost = parseFloat(root.dataset.baseCost) || 0;
  const minus = $('[data-serv="-"]', root), plus = $('[data-serv="+"]', root);

  function render() {
    const f = cur / base;
    for (const it of items) it.out.textContent = fmtQty(it.qty * f, it.unit);
    if (outServings) outServings.textContent = n0.format(cur);
    if (outCost) outCost.textContent = n2.format(baseCost * f);
    if (minus) minus.disabled = cur <= 1;
    if (plus) plus.disabled = cur >= 12;
    /* Valoarea implicită nu se scrie: dacă n-ai schimbat nimic, lista de cumpărături
       trebuie să urmeze planul, nu o alegere pe care n-ai făcut-o. */
    if (cur === base) store.del(servKey(slug)); else store.set(servKey(slug), cur);
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
    const label = t('step', { n: s.n });
    $('#cookLabel').textContent = s.temp ? `${label} · ${s.temp}°C` : label;
    $('#cookText').textContent = s.text;

    const tip = $('#cookTip');
    tip.textContent = s.tip || '';
    tip.classList.toggle('hidden', !s.tip);

    const box = $('#cookTimerBox');
    box.classList.toggle('hidden', !s.timer);
    if (s.timer) this.paintTimer();

    $('[data-cook="next"] span').textContent =
      this.i === this.steps.length - 1 ? t('done') : t('next');
    $('.cook__body').scrollTop = 0;
  },

  timerKey() { return `timer.${this.slug}.${this.i}`; },

  toggleTimer() {
    const s = this.steps[this.i];
    if (!s.timer) return;
    const tm = store.get(this.timerKey(), null);
    if (tm && tm.deadline > Date.now()) {
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
    const tm = store.get(this.timerKey(), null);
    const clock = $('#cookClock');
    const btn = $('#cookTimerBtn');
    const left = tm ? (tm.deadline - Date.now()) / 1000 : s.timer;

    clock.textContent = mmss(Math.max(0, left));
    const running = !!tm && left > 0;
    const done = !!tm && left <= 0;
    clock.classList.toggle('is-done', done);
    $('span', btn).textContent = done ? t('timer_done') : running ? t('timer_stop') : t('timer_start');
    $('use', btn).setAttribute('href', running ? '#i-pause' : '#i-play');
    if (done) store.del(this.timerKey());
  },

  tickTimer() {
    if (!this.el?.classList.contains('is-open')) return;
    const s = this.steps[this.i];
    if (!s?.timer) return;
    const tm = store.get(this.timerKey(), null);
    if (!tm) return;
    if (tm.deadline - Date.now() <= 0 && !tm.fired) {
      tm.fired = true; store.set(this.timerKey(), tm);
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

/**
 * Lista de rețete×porții pentru un domeniu: o sesiune anume, sau săptămâna întreagă.
 * Fiecare cantitate din plan e înmulțită cu factorul tău — numărul de porții pe care
 * l-ai pus tu pe pagina rețetei. Fără asta, lista ar rămâne la ce zice planul.
 */
function scopeRecipes(d, scope) {
  const scale = (r) => ({ ...r, servings: r.servings * servingFactor(d, r.slug) });
  const plan = d.plan;
  if (scope === 'week') {
    const out = plan.sessions.flatMap((s) => s.recipes.map(scale));
    out.push(scale({ slug: plan.breakfast, servings: 7 }));    // micul dejun, în fiecare zi
    for (const f of plan.fresh) out.push(scale({ slug: f.slug, servings: 1 }));
    return { label: t('week'), recipes: out };
  }
  const sess = plan.sessions.find((x) => x.id === scope) || plan.sessions[0];
  return { label: sess.dayName, recipes: sess.recipes.map(scale), sess };
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
  return { label, sess, rows, recipes };
}

function ageDays(iso) {
  if (!iso) return 999;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

function renderList(d, scope, mount) {
  const { label, rows, recipes } = buildList(d, scope);
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
  const saving = totalPrimary - totalSplit;
  const worthIt = saving >= d.stores.strategy.min_saving_for_second_trip;

  const checkedKey = `buy.${scope}`;
  const checked = new Set(store.get(checkedKey, []));
  const oldest = rows.length ? Math.max(...rows.map((r) => ageDays(r.primary.updated))) : 0;
  const stale = oldest > d.prices.meta.stale_after_days;
  const storeName = (st) => d.stores.stores[st]?.name || st;

  const tabs = [{ id: 'week', name: t('week') }]
    .concat(d.plan.sessions.map((s) => ({ id: s.id, name: s.dayName })));

  let html = `
    <div class="seg" role="tablist" aria-label="${esc(t('scope_label'))}" style="margin-bottom:var(--s-5)">
      ${tabs.map((x) => `<button role="tab" data-sess="${x.id}" aria-selected="${x.id === scope}">${esc(x.name)}</button>`).join('')}
    </div>`;

  html += `<div class="notice" style="margin-bottom:var(--s-5)">
         <svg viewBox="0 0 24 24"><use href="#i-info"/></svg>
         <div>${isWeek ? t('notice_week') : t('notice_session')}</div></div>`;

  if (stale) {
    html += `<div class="notice notice--warn" style="margin-bottom:var(--s-5)">
      <svg viewBox="0 0 24 24"><use href="#i-warn"/></svg>
      <div>${t('stale', { days: oldest })}</div></div>`;
  }

  /* ── porții: reglabile chiar de aici, nu doar de pe pagina fiecărei rețete ── */
  const uniqueSlugs = [...new Set(recipes.map((r) => r.slug))];
  const edited = hasCustomServings(d, uniqueSlugs);
  html += `<section class="portions" style="margin-bottom:var(--s-5)">
      <div class="aisle__h"><h2>${esc(t('portions'))}</h2></div>
      <div class="set__help" style="margin:var(--s-2) 0 var(--s-3)">${esc(t('portions_help'))}</div>
      <ul class="portions__list">`;
  for (const slug of uniqueSlugs) {
    const rec = d.recipes.find((x) => x.slug === slug);
    if (!rec) continue;
    const own = chosenServings(rec);
    const inScope = recipes.filter((r) => r.slug === slug).reduce((a, r) => a + r.servings, 0);
    const word = Math.round(inScope) === 1 ? t('serving_one') : t('serving_many');
    html += `<li class="portions__row">
        <div class="portions__main">
          <a class="portions__name" href="${rec.url}">${esc(rec.title)}</a>
          <div class="tiny muted">${n0.format(Math.round(inScope))} ${esc(word)}</div>
        </div>
        <div class="stepper" role="group">
          <button type="button" data-portion="-" data-slug="${slug}" ${own <= 1 ? 'disabled' : ''}>−</button>
          <span class="stepper__val">${n0.format(own)}</span>
          <button type="button" data-portion="+" data-slug="${slug}" ${own >= 12 ? 'disabled' : ''}>+</button>
        </div>
      </li>`;
  }
  html += `</ul>`;
  if (edited) {
    html += `<div class="notice" style="margin-top:var(--s-3)">
        <svg viewBox="0 0 24 24"><use href="#i-info"/></svg>
        <div>${esc(t('portions_edited'))}
        <button class="btn btn--ghost" type="button" id="resetPortions" style="margin-top:var(--s-2)">${esc(t('portions_reset'))}</button></div></div>`;
  }
  html += `</section>`;

  html += `<div class="switch" style="margin-bottom:var(--s-5)">
      <div>
        <b style="font-size:.9375rem">${esc(t('split'))}</b>
        <div class="set__help">${worthIt
          ? `${t('split_yes', { sum: eur(saving) })} ${esc(d.stores.strategy.verdict_split)}`
          : `${t('split_no', { sum: eur(saving) })} ${esc(d.stores.strategy.verdict_single)}`}</div>
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
    if (stock.length)  sections.push({ name: `${a.name} ${t('pantry_suffix')}`, items: stock, stock: true });
  }

  let openedStock = false;
  for (const sec of sections) {
    if (sec.stock && !openedStock && isWeek) {
      openedStock = true;
      html += `<hr class="rule">
        <div class="notice" style="margin-bottom:var(--s-5)">
          <svg viewBox="0 0 24 24"><use href="#i-info"/></svg>
          <div>${t('pantry_note')}</div></div>`;
    }
    const sum = sec.items.reduce((s, r) => s + (isWeek ? cost(r) : used(r)), 0);
    html += `<section class="aisle">
      <div class="aisle__h"><h2>${esc(sec.name)}</h2><span class="chip aisle__n num">${eur(sum)}</span></div>
      <ul class="buy">`;
    for (const r of sec.items.sort((x, y) => x.meta.name.localeCompare(y.meta.name, LOC))) {
      const offer = split ? r.cheapest : r.primary;
      const id = `b-${scope}-${r.key}`;
      const surplus = r.buy - r.grams;
      const sub = isWeek
        ? `${r.packs} × ${esc(r.packLabel)}${split ? ` · ${esc(storeName(offer.store))}` : ''}` +
          (surplus > r.packSize * 0.12
            ? ` ${t('leftover', { used: fmtQty(r.grams, r.unit), left: fmtQty(surplus, r.unit) })}` : '')
        : fmtQty(r.grams, r.unit);
      /* Pe română, sub numele românesc apare și cel englezesc: ăsta e numele scris pe raft. */
      const alt = (d.lang !== 'en' && r.meta.nameEn && r.meta.nameEn !== r.meta.name)
        ? `<span class="buy__alt">${esc(r.meta.nameEn)}</span>` : '';
      html += `<li>
        <label for="${id}">
          <input type="checkbox" id="${id}" data-buy="${r.key}" ${checked.has(r.key) ? 'checked' : ''}>
          <span class="buy__box"><svg viewBox="0 0 24 24"><use href="#i-check"/></svg></span>
          <span class="buy__main">
            <span class="buy__name">${esc(r.meta.name)}${alt}</span>
            <span class="buy__sub">${sub}</span>
          </span>
          <span class="buy__price num">${eur(isWeek ? cost(r) : used(r))}</span>
        </label></li>`;
    }
    html += `</ul></section>`;
  }

  html += `<div class="total">
      <div style="flex:1">
        <div class="label">${isWeek ? esc(t('total_till')) : esc(t('total_used', { label }))}</div>
        <div class="total__v">${eur(isWeek ? totalFresh : totalUsed)}</div>
        ${isWeek ? `<div class="total__sub">${t('total_note', { used: eur(totalUsed), pantry: eur(totalPantry) })}</div>` : ''}
      </div>
      <button class="btn btn--ghost" type="button" id="resetBuy">${esc(t('clear_checks'))}</button>
    </div>`;

  mount.innerHTML = html;

  $$('[data-sess]', mount).forEach((b) => b.addEventListener('click', () => {
    history.replaceState(null, '', `?s=${b.dataset.sess}`);
    renderList(d, b.dataset.sess, mount);
  }));
  $$('[data-portion]', mount).forEach((b) => b.addEventListener('click', () => {
    const rec = d.recipes.find((x) => x.slug === b.dataset.slug);
    if (!rec) return;
    const next = Math.max(1, Math.min(12, chosenServings(rec) + (b.dataset.portion === '+' ? 1 : -1)));
    if (next === rec.servings) store.del(servKey(rec.slug)); else store.set(servKey(rec.slug), next);
    renderList(d, scope, mount);
  }));
  $('#resetPortions', mount)?.addEventListener('click', () => {
    for (const r of d.recipes) store.del(servKey(r.slug));
    renderList(d, scope, mount);
  });
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

function initShopping(d) {
  const mount = $('#shopping');
  if (!mount || !d) return;
  const want = new URLSearchParams(location.search).get('s');
  const valid = want === 'week' || d.plan.sessions.some((s) => s.id === want);
  renderList(d, valid ? want : 'week', mount);
}

/* ═══════════════════════ săptămâna ══════════════════════════ */
function initWeek(d) {
  const mount = $('#weekCost');
  if (!mount || !d) return;
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
    if (!confirm(t('wipe_confirm'))) return;
    try { localStorage.clear(); } catch {}
    location.reload();
  });
}

/* ═══════════════════════ pornire ════════════════════════════ */
(async function start() {
  initTheme();
  initAppbar();

  /* Textele și formatările numerice vin din app.json, deci tot ce le folosește
     așteaptă datele. Paginile sunt deja randate de Hugo, așa că nu se vede nimic gol. */
  let d = null;
  try { d = await getData(); } catch {}
  if (d) {
    LOC = d.locale || LOC;
    UI = d.ui || {};
    reformat();
  }

  initServings();
  initCook();
  initShopping(d);
  initWeek(d);
  initSettings();
})();

if ('serviceWorker' in navigator) {
  addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
