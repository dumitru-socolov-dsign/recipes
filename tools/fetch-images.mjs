#!/usr/bin/env node
/**
 * Aduce câte o fotografie cu licență liberă pentru fiecare rețetă, prin Openverse.
 *
 *   node tools/fetch-images.mjs              # doar ce lipsește
 *   node tools/fetch-images.mjs --force      # reia tot
 *   node tools/fetch-images.mjs --only somon-lamaie,porc-varza
 *
 * Imaginile ajung în assets/img/retete/<slug>.jpg (Hugo le redimensionează la build),
 * iar atribuirea — obligatorie la licențele Creative Commons — în data/credits.yaml.
 *
 * Căutarea simplă întoarce orice: „pork cabbage" dă găluște, „chicken mushroom" dă
 * suflé de ciocolată. De aceea fiecare rețetă declară ce TREBUIE și ce NU TREBUIE să
 * apară în titlul fotografiei, iar candidații se filtrează după asta.
 */
import { mkdirSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const OUT = 'assets/img/retete';
const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const ONLY = (() => {
  const i = args.indexOf('--only');
  return i === -1 ? null : new Set((args[i + 1] || '').split(',').filter(Boolean));
})();

/**
 * q    — interogări, de la specific la generic; se încearcă pe rând
 * must — grupuri de sinonime; titlul trebuie să conțină cel puțin unul din FIECARE grup
 * not  — cuvinte care descalifică imediat
 */
const RECIPES = {
  'pui-tava-cartofi': {
    q: ['roast chicken potatoes', 'roasted chicken thighs', 'chicken tray bake'],
    must: [['chicken'], ['potato', 'potatoes', 'roast', 'roasted', 'tray']],
    not: ['soup', 'salad', 'sandwich', 'burger', 'raw', 'curry', 'noodle'],
  },
  'porc-varza': {
    q: ['braised pork cabbage', 'pork and cabbage stew', 'cabbage with bacon'],
    must: [['cabbage'], ['pork', 'braised', 'stew', 'bacon', 'cooked', 'fried']],
    not: ['dumpling', 'gyoza', 'roll', 'soup', 'salad', 'coleslaw', 'raw', 'field'],
  },
  'chiftele-vita': {
    q: ['baked meatballs', 'beef meatballs', 'meatballs oven tray'],
    must: [['meatball', 'meatballs']],
    not: ['spaghetti', 'pasta', 'sub', 'sandwich', 'burger', 'soup', 'ikea', 'noodle'],
  },
  'pui-smantana-ciuperci': {
    q: ['chicken with mushroom sauce', 'creamy chicken mushrooms', 'chicken mushroom skillet'],
    must: [['chicken'], ['mushroom', 'mushrooms', 'cream', 'creamy']],
    not: ['soup', 'souffle', 'cake', 'pie', 'raw', 'pizza', 'sandwich', 'chocolate'],
  },
  'somon-lamaie': {
    q: ['baked salmon fillet', 'roasted salmon lemon', 'grilled salmon fillet'],
    must: [['salmon'], ['baked', 'roast', 'roasted', 'grilled', 'fillet', 'filet', 'oven', 'cooked']],
    not: ['benedict', 'smoked', 'sushi', 'sashimi', 'bagel', 'raw', 'pasta', 'burger', 'salad', 'river'],
  },
  'porc-ardei': {
    q: ['pork goulash', 'pork stew peppers', 'goulash'],
    must: [['goulash', 'stew', 'pork']],
    not: ['soup', 'raw', 'sandwich', 'burger', 'pig'],
  },
  'varza-calda-chimen': {
    q: ['fried cabbage', 'sauteed cabbage', 'buttered cabbage'],
    must: [['cabbage']],
    not: ['soup', 'borscht', 'salad', 'coleslaw', 'roll', 'raw', 'dumpling', 'stuffed', 'field', 'garden'],
  },
  'radacinoase-unt': {
    q: ['roasted root vegetables', 'roasted carrots parsnips', 'oven roasted vegetables'],
    must: [['roast', 'roasted', 'baked'], ['vegetable', 'vegetables', 'carrot', 'carrots', 'parsnip', 'root', 'veg']],
    not: ['soup', 'juice', 'raw', 'salad', 'cake', 'market'],
  },
  'oua-carnat': {
    q: ['fried eggs and sausage', 'full breakfast eggs sausage', 'fried egg breakfast plate'],
    must: [['egg', 'eggs']],
    not: ['cake', 'benedict', 'sandwich', 'burger', 'raw', 'salad', 'nest', 'easter', 'carton'],
  },
  'sardine-ceapa': {
    q: ['sardines on plate', 'tinned sardines', 'sardines'],
    must: [['sardine', 'sardines']],
    not: ['sea', 'shoal', 'aquarium', 'fishing', 'boat', 'market', 'factory'],
  },
  'omleta-cartofi': {
    q: ['potato omelette', 'spanish tortilla potato', 'tortilla de patatas'],
    must: [['omelette', 'omelet', 'tortilla', 'frittata']],
    not: ['wrap', 'mexican', 'chips', 'burrito', 'taco', 'flour'],
  },
  'macrou-ceapa': {
    q: ['cooked mackerel plate', 'grilled mackerel', 'mackerel fillet cooked'],
    must: [['mackerel'], ['cooked', 'grilled', 'fried', 'baked', 'plate', 'fillet', 'smoked', 'dish']],
    not: ['raw', 'sea', 'market', 'fishing', 'octopus', 'aquarium', 'catch', 'ice'],
  },
};

const UA = 'bucatarie-recipe-site/1.0 (static site build)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (s) => (s || '').toLowerCase();

async function search(q, page = 1) {
  const u = new URL('https://api.openverse.org/v1/images/');
  u.searchParams.set('q', q);
  u.searchParams.set('license_type', 'commercial,modification');
  u.searchParams.set('page_size', '20');
  u.searchParams.set('page', String(page));
  u.searchParams.set('mature', 'false');
  const r = await fetch(u, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`Openverse ${r.status}`);
  return (await r.json()).results || [];
}

function accepts(result, spec) {
  const t = norm(result.title) + ' ' + norm((result.tags || []).map((x) => x.name).join(' '));
  if (spec.not.some((w) => t.includes(w))) return false;
  return spec.must.every((group) => group.some((w) => t.includes(w)));
}

mkdirSync(OUT, { recursive: true });

/* Pornim de la atribuirile existente ca o rulare parțială să nu le șteargă pe cele vechi. */
const credits = {};
if (existsSync('data/credits.yaml')) {
  let cur = null;
  for (const line of readFileSync('data/credits.yaml', 'utf8').split('\n')) {
    if (/^[a-z0-9-]+:$/.test(line)) { cur = line.slice(0, -1); credits[cur] = {}; }
    else if (cur && /^\s{2}\w+:/.test(line)) {
      const i = line.indexOf(':');
      try { credits[cur][line.slice(2, i)] = JSON.parse(line.slice(i + 1).trim()); } catch {}
    }
  }
}

for (const [slug, spec] of Object.entries(RECIPES)) {
  if (ONLY && !ONLY.has(slug)) continue;
  const dest = join(OUT, `${slug}.jpg`);
  if (existsSync(dest) && !FORCE && !ONLY) { console.log(`· ${slug} — există deja`); continue; }

  let pick = null, seen = 0;
  try {
    outer:
    for (const q of spec.q) {
      for (const page of [1, 2]) {
        const results = await search(q, page);
        if (!results.length) break;
        seen += results.length;
        for (const r of results) {
          if (!r.url || (r.width ?? 0) < 600) continue;
          if (accepts(r, spec)) { pick = r; break outer; }
        }
        await sleep(250);
      }
    }
    if (!pick) { console.log(`✗ ${slug.padEnd(24)} ${seen} candidați, niciunul potrivit`); continue; }

    const img = await fetch(pick.url, { headers: { 'User-Agent': UA } });
    if (!img.ok) { console.log(`✗ ${slug} — descărcare ${img.status}`); continue; }
    writeFileSync(dest, Buffer.from(await img.arrayBuffer()));

    /* Decupare la 3:2 — Hugo se ocupă apoi de webp și de variantele de dimensiune. */
    execFileSync('convert', [dest, '-auto-orient', '-resize', '1400x1400^',
      '-gravity', 'center', '-extent', '1200x800', '-quality', '82', dest]);

    credits[slug] = {
      title: pick.title || '',
      creator: pick.creator || 'necunoscut',
      license: `${(pick.license || '').toUpperCase()} ${pick.license_version || ''}`.trim(),
      license_url: pick.license_url || '',
      source: pick.foreign_landing_url || pick.url,
    };
    console.log(`✓ ${slug.padEnd(24)} „${(pick.title || '').slice(0, 46)}" — ${credits[slug].creator}`);
    await sleep(350);
  } catch (e) {
    console.log(`✗ ${slug} — ${e.message}`);
  }
}

const yaml = ['# Generat de tools/fetch-images.mjs. Atribuirea e cerută de licențele Creative Commons.']
  .concat(Object.entries(credits).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) =>
    `${k}:\n` + Object.entries(v).map(([a, b]) => `  ${a}: ${JSON.stringify(b)}`).join('\n')))
  .join('\n');
writeFileSync('data/credits.yaml', yaml + '\n');
console.log(`\nAtribuiri în data/credits.yaml: ${Object.keys(credits).length}`);
