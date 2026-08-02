#!/usr/bin/env node
/**
 * Împrospătarea prețurilor din data/prices.yaml.
 *
 *   npm run prices:refresh          # încearcă automat, apoi întreabă pentru ce n-a mers
 *   npm run prices:refresh -- --auto     # doar automat, fără întrebări
 *   npm run prices:refresh -- --manual   # doar manual, fără browser
 *   npm run prices:refresh -- --only chicken_thigh_bone_in,potato
 *
 * DE CE RULEAZĂ LOCAL ȘI NU ÎN CI
 * Tesco.ie și Aldi.ie răspund cu 403 (Akamai) la orice cerere care nu vine dintr-un
 * browser real. IP-urile de CI sunt blocate și mai agresiv decât cele rezidențiale.
 * Un scraper în GitHub Actions ar eșua tăcut și ar scrie prețuri false — mai rău decât
 * prețuri vechi marcate cinstit ca vechi. Deci: browser adevărat, de pe conexiunea ta.
 *
 * Playwright e opțional. Fără el, unealta trece direct în modul manual, care e oricum
 * cea mai de încredere sursă: prețul pe care l-ai văzut tu pe raft.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

const PRICES = 'data/prices.yaml';
const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const only = (() => {
  const i = args.indexOf('--only');
  return i === -1 ? null : new Set((args[i + 1] || '').split(',').filter(Boolean));
})();

const MODE_AUTO = has('--auto') || !has('--manual');
const MODE_MANUAL = has('--manual') || !has('--auto');

/* Termenii de căutare din magazin, pe cheia de ingredient. */
const SEARCH = {
  chicken_thigh_bone_in: 'chicken thighs',
  chicken_thigh_boneless: 'boneless chicken thighs',
  pork_shoulder: 'pork shoulder steak',
  beef_mince_20: 'beef mince',
  pork_sausage: 'pork sausages',
  salmon_fillet: 'salmon fillets',
  mackerel_tinned: 'tinned mackerel',
  sardines_tinned: 'tinned sardines',
  egg: 'large eggs',
  butter_unsalted: 'unsalted butter',
  cooking_cream: 'cooking cream',
  rapeseed_oil: 'rapeseed oil',
  olive_oil: 'extra virgin olive oil',
  tomato_paste: 'tomato puree',
  apple_vinegar: 'apple cider vinegar',
  dijon_mustard: 'dijon mustard',
  potato: 'potatoes',
  onion: 'onions',
  red_onion: 'red onions',
  carrot: 'carrots',
  parsnip: 'parsnips',
  cabbage_white: 'white cabbage',
  courgette: 'courgette',
  pepper_red: 'red peppers',
  mushrooms: 'mushrooms',
  garlic: 'garlic',
  lemon: 'lemons',
  parsley: 'fresh parsley',
  broccoli_frozen: 'frozen broccoli',
  cauliflower_frozen: 'frozen cauliflower',
  green_beans_frozen: 'frozen green beans',
};

const today = new Date().toISOString().slice(0, 10);

/* ── YAML: editare chirurgicală, linie cu linie ────────────────
   Nu folosesc un parser+serializer, ca să nu pierd comentariile și formatarea
   fișierului. Prețurile sunt pe o singură linie, deci un regex e suficient. */
function updatePrice(text, key, storeKey, price) {
  const lines = text.split('\n');
  let inItem = false, inStores = false, changed = false;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^  [a-z0-9_]+:\s*$/.test(l)) { inItem = l.trim().slice(0, -1) === key; inStores = false; continue; }
    if (!inItem) continue;
    if (/^    stores:\s*$/.test(l)) { inStores = true; continue; }
    if (!inStores) continue;
    const m = l.match(new RegExp(`^(\\s+${storeKey}:\\s*\\{)(.*)(\\}\\s*)$`));
    if (m) {
      lines[i] = `${m[1]} price: ${price.toFixed(2)}, updated: "${today}", source: ${
        has('--manual') || !MODE_AUTO ? 'manual' : 'scraped'} ${m[3].trim()}`;
      changed = true;
      break;
    }
  }
  return { text: lines.join('\n'), changed };
}

function listItems(text) {
  const out = [];
  let inItems = false;
  for (const l of text.split('\n')) {
    if (/^items:\s*$/.test(l)) { inItems = true; continue; }
    if (!inItems) continue;
    const m = l.match(/^  ([a-z0-9_]+):\s*$/);
    if (m) out.push(m[1]);
  }
  return out;
}

/* ── scraping ─────────────────────────────────────────────────── */
async function loadPlaywright() {
  try { return (await import('playwright')).chromium; }
  catch { return null; }
}

const EUR = /€\s*(\d+[.,]\d{2})/;

async function scrapeTesco(browser, term) {
  const ctx = await browser.newContext({
    locale: 'en-IE',
    timezoneId: 'Europe/Dublin',
    viewport: { width: 1280, height: 900 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
               '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  });
  const page = await ctx.newPage();
  try {
    await page.goto(`https://www.tesco.ie/groceries/en-IE/search?query=${encodeURIComponent(term)}`,
      { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2500);
    const body = await page.locator('body').innerText().catch(() => '');
    if (/access denied|are you a robot/i.test(body)) throw new Error('blocat (Akamai)');
    const m = body.match(EUR);
    if (!m) throw new Error('niciun preț găsit');
    return parseFloat(m[1].replace(',', '.'));
  } finally {
    await ctx.close();
  }
}

/* ── program principal ────────────────────────────────────────── */
let text = readFileSync(PRICES, 'utf8');
const keys = listItems(text).filter((k) => (only ? only.has(k) : true) && SEARCH[k]);
const failed = [];
let updated = 0;

if (MODE_AUTO) {
  const chromium = await loadPlaywright();
  if (!chromium) {
    console.log('ℹ Playwright nu e instalat — sar peste partea automată.');
    console.log('  Dacă vrei să încerci: npm i -D playwright && npx playwright install chromium\n');
    failed.push(...keys);
  } else {
    const browser = await chromium.launch({ headless: true });
    console.log(`Încerc ${keys.length} produse pe tesco.ie…\n`);
    for (const k of keys) {
      try {
        const price = await scrapeTesco(browser, SEARCH[k]);
        const r = updatePrice(text, k, 'tesco', price);
        if (r.changed) { text = r.text; updated++; console.log(`  ✓ ${k.padEnd(26)} ${price.toFixed(2)} €`); }
        else failed.push(k);
      } catch (e) {
        console.log(`  ✗ ${k.padEnd(26)} ${e.message}`);
        failed.push(k);
      }
    }
    await browser.close();
  }
} else {
  failed.push(...keys);
}

if (MODE_MANUAL && failed.length) {
  console.log(`\n${failed.length} produse au rămas. Le poți introduce manual — Enter le sare.`);
  console.log('Scrie prețul unui pachet, în euro (ex: 5.49).\n');
  const rl = createInterface({ input: stdin, output: stdout });
  for (const k of failed) {
    const cur = text.match(new RegExp(`^  ${k}:[\\s\\S]*?tesco:\\s*\\{ price: ([\\d.]+)`, 'm'));
    const ans = (await rl.question(`  ${k} (${SEARCH[k]}) [${cur ? cur[1] : '?'}] € `)).trim();
    if (!ans) continue;
    const v = parseFloat(ans.replace(',', '.'));
    if (!Number.isFinite(v) || v <= 0) { console.log('    valoare ignorată'); continue; }
    const r = updatePrice(text, k, 'tesco', v);
    if (r.changed) { text = r.text; updated++; }
  }
  rl.close();
}

if (updated) {
  text = text.replace(/^(  updated: )".*"$/m, `$1"${today}"`);
  writeFileSync(PRICES, text);
  console.log(`\n✓ ${updated} prețuri actualizate în ${PRICES}.`);
  console.log('  Rulează `hugo` sau fă un commit ca site-ul să le preia.');
} else {
  console.log('\nNimic de actualizat.');
}
