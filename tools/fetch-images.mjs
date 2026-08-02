#!/usr/bin/env node
/**
 * Aduce câte o fotografie cu licență liberă pentru fiecare rețetă, prin Openverse.
 *
 *   node tools/fetch-images.mjs           # doar ce lipsește
 *   node tools/fetch-images.mjs --force   # reia tot
 *
 * Imaginile ajung în assets/img/retete/<slug>.jpg (Hugo le redimensionează la build),
 * iar atribuirea — obligatorie la licențele CC — în data/credits.yaml.
 */
import { mkdirSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const OUT = 'assets/img/retete';
const FORCE = process.argv.includes('--force');

/* Fiecare rețetă are mai multe interogări, de la specific la generic.
   Se oprește la prima care întoarce rezultate. */
const QUERIES = {
  'pui-tava-cartofi':      ['roast chicken potatoes', 'roast chicken', 'chicken thighs'],
  'porc-varza':            ['pork cabbage', 'braised pork', 'cabbage stew'],
  'chiftele-vita':         ['meatballs', 'beef meatballs', 'meatball'],
  'pui-smantana-ciuperci': ['chicken mushroom cream', 'chicken mushrooms', 'creamy chicken'],
  'somon-lamaie':          ['baked salmon lemon', 'salmon fillet', 'salmon'],
  'porc-ardei':            ['pork goulash', 'pork stew', 'goulash'],
  'varza-calda-chimen':    ['fried cabbage', 'cooked cabbage', 'cabbage'],
  'radacinoase-unt':       ['roasted root vegetables', 'roasted carrots', 'roast vegetables'],
  'oua-carnat':            ['fried eggs sausage', 'eggs and sausage', 'fried egg breakfast'],
  'sardine-ceapa':         ['sardines plate', 'sardines', 'canned sardines'],
  'omleta-cartofi':        ['potato omelette', 'spanish omelette', 'omelette'],
  'macrou-ceapa':          ['mackerel plate', 'mackerel fillet', 'mackerel'],
};

const UA = 'bucatarie-recipe-site/1.0 (static site build)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function search(q) {
  const u = new URL('https://api.openverse.org/v1/images/');
  u.searchParams.set('q', q);
  u.searchParams.set('license_type', 'commercial,modification');
  u.searchParams.set('page_size', '12');
  u.searchParams.set('mature', 'false');
  const r = await fetch(u, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`Openverse ${r.status}`);
  return (await r.json()).results || [];
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

for (const [slug, queries] of Object.entries(QUERIES)) {
  const dest = join(OUT, `${slug}.jpg`);
  if (existsSync(dest) && !FORCE) { console.log(`· ${slug} — există deja`); continue; }

  try {
    let results = [];
    for (const q of queries) {
      results = await search(q);
      if (results.length) break;
      await sleep(300);
    }
    const pick = results.find((r) => r.url && (r.width ?? 0) >= 640) || results[0];
    if (!pick) { console.log(`✗ ${slug} — niciun rezultat`); continue; }

    const img = await fetch(pick.url, { headers: { 'User-Agent': UA } });
    if (!img.ok) { console.log(`✗ ${slug} — descărcare ${img.status}`); continue; }
    writeFileSync(dest, Buffer.from(await img.arrayBuffer()));

    /* Decupare la 3:2 și redimensionare — Hugo se ocupă apoi de webp și de variante. */
    execFileSync('convert', [dest, '-auto-orient', '-resize', '1400x1400^',
      '-gravity', 'center', '-extent', '1200x800', '-quality', '82', dest]);

    credits[slug] = {
      title: pick.title || '',
      creator: pick.creator || 'necunoscut',
      license: `${(pick.license || '').toUpperCase()} ${pick.license_version || ''}`.trim(),
      license_url: pick.license_url || '',
      source: pick.foreign_landing_url || pick.url,
    };
    console.log(`✓ ${slug} — ${credits[slug].creator} (${credits[slug].license})`);
    await sleep(400);
  } catch (e) {
    console.log(`✗ ${slug} — ${e.message}`);
  }
}

{
  const yaml = ['# Generat de tools/fetch-images.mjs. Atribuirea e cerută de licențele Creative Commons.']
    .concat(Object.entries(credits).map(([k, v]) =>
      `${k}:\n` + Object.entries(v).map(([a, b]) => `  ${a}: ${JSON.stringify(b)}`).join('\n')))
    .join('\n');
  writeFileSync('data/credits.yaml', yaml + '\n');
  console.log(`\nAtribuiri scrise în data/credits.yaml (${Object.keys(credits).length})`);
}
