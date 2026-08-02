# Bucătărie

Aplicație web pentru gătit în serie: rețete cu pași și timere, calculator de porții,
listă de cumpărături grupată pe raioane și cost calculat automat.

Site static, generat cu Hugo. Fără backend, fără conturi, fără analytics.
Tot ce ține de utilizator (setări, bife, progresul la gătit) stă în `localStorage`,
pe telefonul lui. Nu există server care să primească ceva.

---

## Ce face

| | |
|---|---|
| **Azi** | Ce mănânci astăzi, totalul zilei și când e următoarea sesiune de gătit |
| **Rețete** | 12 rețete, grupate pe cele trei sesiuni de gătit ale săptămânii |
| **Rețetă** | Porții reglabile care rescalează toate cantitățile, nutriție per porție, cost, pași |
| **Mod gătit** | Ecran complet, un pas pe rând, timere cu alarmă, ecranul rămâne aprins |
| **Cumpărături** | Pe săptămână sau pe zi de gătit, grupat pe raioane, cu pachete întregi și cost |
| **Plan** | Cronologia paralelă a fiecărei sesiuni — ce faci în fiecare minut |
| **Setări** | Ținte de calorii, proteine și sodiu; se recalculează tot |

Instalabil pe telefon (Add to Home Screen). Funcționează offline după prima vizită.

## Cerințe

- **Hugo extended ≥ 0.156** — `hugo version` trebuie să conțină `+extended`.
  Șabloanele folosesc `hugo.Data`, care nu există înainte de 0.156. `hugo.toml` are o gardă
  care oprește build-ul cu mesaj clar dacă versiunea e prea veche. Testat pe 0.164.0.
- **Node ≥ 20** doar pentru unelte (prețuri, imagini). Nu e nevoie la build.

Nicio dependență npm în producție. Fără Hugo Modules, deci fără Go.

## Dezvoltare

```bash
hugo server --bind 0.0.0.0     # deschide http://localhost:1313
                               # --bind 0.0.0.0 îl face vizibil de pe telefon în aceeași rețea
hugo --gc --minify             # build rapid în ./public
./build.sh                     # build identic cu cel de pe Cloudflare
```

## Structură

```
content/retete/*.md     o rețetă = un fișier, cu ingrediente și pași în front matter
data/ingredients.yaml   nutriție per 100 g, raion, randament comestibil
data/prices.yaml        prețuri per pachet, per magazin, cu dată și sursă
data/targets.yaml       ținte nutriționale implicite
data/plan.yaml          rotația săptămânii + cronologia fiecărei sesiuni
layouts/                tema, scrisă de la zero
layouts/partials/calc/  motorul de calcul: nutriție și cost, la build
assets/css/main.css     tot design system-ul
assets/js/app.js        toată logica din browser
```

Nutriția și costul se calculează **la build**, în Hugo. Browserul primește în `/app.json`
valori gata calculate — scalarea porțiilor e o simplă înmulțire, iar telefonul nu descarcă
baza de ingrediente.

### Cum adaugi o rețetă

Creează `content/retete/slug-nou.md`:

```yaml
---
title: "Titlul rețetei"
summary: "O propoziție care spune de ce merită."
image: "slug-nou"        # assets/img/retete/slug-nou.jpg
tint: amber              # amber | rose | sage — fundalul când nu există poză
servings: 2
time_active: 15          # minute cu mâinile pe mâncare
time_total: 45
session: a               # a | b | c, sau lipsește pentru rețete în afara planului
tags: ["cuptor", "pui"]
ingredients:
  - group: "Carne"
    items:
      - { key: chicken_thigh_bone_in, qty: 400, unit: g }   # g | ml | buc
steps:
  - text: "Ce faci."
    timer: 1800          # secunde — apare buton de timer pe pasul ăsta
    temp: 200            # °C, opțional
    tip: "Detaliul care schimbă rezultatul."
---

Textul lung de sub rețetă, în Markdown.
```

Cheile din `key:` trebuie să existe în `data/ingredients.yaml`, altfel build-ul se oprește
cu o eroare care spune exact care lipsește. `qty` e cantitatea **cumpărată** — cu os, cu coajă;
`yield` din baza de ingrediente o transformă în partea comestibilă.

## Prețuri

`data/prices.yaml` e sursa de adevăr. Fiecare preț are `updated` și `source`:

- `baseline` — estimare de pornire, nu preț citit din magazin
- `scraped` — citit automat
- `manual` — introdus după ce l-ai văzut pe raft (cel mai de încredere)

```bash
npm run prices:refresh      # încearcă automat, apoi întreabă pentru ce n-a mers
npm run prices:manual       # doar introducere manuală
```

**Rulează local, nu în CI, și asta e intenționat.** Tesco.ie și Aldi.ie răspund cu 403
la orice cerere care nu vine dintr-un browser real, iar IP-urile de CI sunt blocate și mai
tare. Un scraper care rulează în GitHub Actions ar eșua tăcut și ar scrie prețuri false —
mai rău decât prețuri vechi marcate cinstit ca vechi. Dacă un preț are peste 14 zile,
site-ul îl marchează vizibil ca estimare.

Partea automată cere Playwright, care e opțional:

```bash
npm i -D playwright && npx playwright install chromium
```

Fără el, unealta trece direct în modul manual.

## Imagini

```bash
npm run images:fetch        # doar ce lipsește
npm run images:fetch -- --force
```

Aduce fotografii cu licență liberă prin Openverse, le decupează la 3:2 și scrie atribuirea
în `data/credits.yaml`. Atribuirea e obligatorie la licențele Creative Commons și e afișată
la finalul fiecărei rețete. Dacă înlocuiești o poză cu una proprie, șterge intrarea din
`data/credits.yaml`.

## Deploy pe Cloudflare

Cloudflare are două fluxuri. Cel recomandat acum, și cel pe care e configurat repo-ul,
e **Workers cu assets statice**. Se recunoaște după faptul că interfața îți cere un
**Deploy command** — Pages nu are așa ceva.

### Workers (recomandat)

Workers & Pages → **Create** → **Workers** → **Import a repository** → alege `recipes`.

| Setare | Valoare |
|---|---|
| Build command | **lasă gol** |
| Deploy command | `npx wrangler deploy` |
| Environment variable | `SKIP_DEPENDENCY_INSTALL` = `true` |

Restul e deja în repo: `wrangler.jsonc` spune că assets-urile sunt în `./public`, iar
build-ul propriu-zis îl face `build.sh`.

**De ce build command gol și un script separat.** Imaginea de build a Cloudflare vine cu o
versiune veche de Hugo, iar site-ul folosește sintaxa de layout din Hugo ≥ 0.146.
`build.sh` descarcă exact versiunea din `HUGO_VERSION` și abia apoi construiește. Tot acolo
e fixat și fusul orar `Europe/Dublin`, care contează: pagina „Azi mănânci" și rotația
sesiunilor de gătit se calculează la build din data curentă.

Când ridici versiunea de Hugo local, schimb-o și în `build.sh`. Poți verifica înainte să
împingi, fiindcă scriptul rulează identic și local:

```bash
./build.sh
```

### Pages (varianta clasică, încă funcționează)

Dacă ai deja un proiect Pages:

| Setare | Valoare |
|---|---|
| Framework preset | None |
| Build command | `bash build.sh` |
| Build output directory | `public` |

**Nu folosi presetul Hugo.** Acela rulează `hugo --gc --minify` cu versiunea din imaginea
de build a Cloudflare, care e mult în urmă — la data scrierii, 0.147.7 — și build-ul eșuează
cu erori de șablon care nu spun de ce. `bash build.sh` descarcă versiunea corectă și e exact
scriptul folosit și de fluxul Workers, deci ai un singur mod de a construi, peste tot.
(`bash build.sh`, nu `./build.sh`, ca să nu depindă de bitul de execuție al fișierului.)

Alternativa, dacă vrei totuși presetul Hugo: build command `hugo --gc --minify` plus
variabila `HUGO_VERSION` = `0.164.0`. Merge, dar versiunea trăiește atunci într-o setare
de dashboard pe care o uiți, nu în repo, lângă cod.

Aici `wrangler.jsonc` e ignorat.

### Rebuild zilnic la 06:00

`.github/workflows/daily-rebuild.yml` rulează în fiecare dimineață și reîmprospătează ziua
curentă, rotația sesiunilor și eticheta de vechime a prețurilor.

Funcționează din start cu ambele fluxuri: workflow-ul face un commit mic în
`data/build-log.json`, iar push-ul declanșează build-ul. Commit-ul are și rolul de a
împiedica GitHub să suspende workflow-ul după 60 de zile de inactivitate.

Dacă vrei și un declanșator explicit, creează un deploy hook în Cloudflare și pune URL-ul
în repo la Settings → Secrets and variables → Actions → `CLOUDFLARE_DEPLOY_HOOK`.

Cron-ul GitHub e best-effort: poate întârzia 5–15 minute. De aceea sunt două intrări
(pentru ora de vară și cea de iarnă) și o verificare a orei reale de la Dublin în interior.

## Nutriție

Valorile implicite din `data/targets.yaml` țintesc 3000 kcal, 84 g proteine și sub 2000 mg
sodiu pe zi — pragul recomandat de OMS pentru adulți.

Planul nu conține cereale, făinoase, cartofi sau alte rădăcinoase amidonoase, iar legumele
intră în cantități mici. Cu proteina plafonată la 84 g, singura sursă rămasă pentru restul
caloriilor e grăsimea: rezultatul e ~275 g grăsime și sub 40 g carbohidrați pe zi, adică
peste 80% din calorii din grăsime. Nu e o alegere de stil, e ce rămâne după constrângeri.

Consecința pe care o urmărește aplicația explicit: **fibrele**. Cartoful era principala sursă,
iar înlocuitorii — varză, conopidă, broccoli, nuci — ajung la ~20 g pe zi, sub recomandarea
generală de 25–30 g. Fibrele se afișează per porție, cu bară proprie, iar acolo bara plină e
lucrul bun; la sodiu, potasiu și fosfor e invers.

Rețetele afișează și potasiul și fosforul per porție, informativ. Toate țintele se pot
schimba din pagina **Setări**; valorile alese rămân în browser.

Datele nutriționale sunt valori uzuale de referință per 100 g, nu analize de laborator ale
produselor concrete din magazin. Sunt bune pentru orientare, nu pentru decizii medicale.
