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
| **Rețetă** | Porții reglabile care rescalează cantitățile — și lista de cumpărături — plus nutriție per porție, cost, pași |
| **Mod gătit** | Ecran complet, un pas pe rând, timere cu alarmă, ecranul rămâne aprins |
| **Cumpărături** | Pe săptămână sau pe zi de gătit, grupat pe raioane, cu pachete întregi și cost |
| **Plan** | Cronologia paralelă a fiecărei sesiuni — ce faci în fiecare minut |
| **Setări** | Ținte de calorii, proteine și sodiu; se recalculează tot |
| **Limbă** | Română și engleză, comutabile din bara de sus, cu URL-uri proprii |

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

## Bilingv

Româna e limba implicită și stă în rădăcină; engleza stă sub `/en/`, cu URL-uri traduse
(`/retete/porc-varza/` ↔ `/en/recipes/pork-cabbage/`). Comutatorul din bara de sus duce la
aceeași pagină în cealaltă limbă.

Engleza nu e o traducere de fațadă. Motivul pentru care există e lista de cumpărături:
numele de produse și de raioane sunt cele scrise pe raft, nu traduceri literale — de aceea
„Băcănie" e *Grocery* și „Pastă de roșii" e *Tomato purée*. Din același motiv, când site-ul
e pe română lista afișează sub fiecare produs și numele englezesc.

Unde stă fiecare fel de text:

| | |
|---|---|
| `i18n/ro.toml`, `i18n/en.toml` | textele interfeței, inclusiv cele folosite din browser (prefix `js_`) |
| `data/*.yaml` | perechi `x` / `x_en` — nume de ingrediente, raioane, zile, cronologii |
| `content/**/*.en.md` | titlul, rezumatul, numele grupurilor de ingrediente și textul pașilor |

**Traducerea nu poartă cantități.** Fișierul `.en.md` al unei rețete conține doar text; porțiile,
gramele, timpii și timerele se citesc întotdeauna din varianta română, prin
`layouts/partials/calc/recipe.html`. Nu există niciun drum prin care o traducere uitată să
schimbe câte grame de carne cumperi sau cât ține un timer.

Un singur service worker, la rădăcină, cu precache pe ambele limbi — comutatorul trebuie să
meargă și fără semnal, fiindcă exact atunci ești în magazin.

## Porții

Numărul de porții ales pe pagina unei rețete se salvează în `localStorage` sub
`servings.<slug>` și e citit de **toate** locurile care numără mâncare: pagina rețetei, lista
de cumpărături și costul săptămânii. Aceleași porții se pot regla și direct din capul listei
de cumpărături. Dacă valoarea e egală cu cea din plan, cheia se șterge — o listă trebuie să
urmeze planul până când chiar ai schimbat ceva.

Slug-ul e același în ambele limbi (cel românesc, din numele fișierului), deci porțiile alese
pe română se văd și pe engleză.

## Structură

```
content/retete/*.md     o rețetă = un fișier, cu ingrediente și pași în front matter
content/retete/*.en.md  traducerea: doar text, fără cantități
data/ingredients.yaml   nutriție per 100 g, raion, randament comestibil
data/prices.yaml        prețuri per pachet, per magazin, cu dată și sursă
data/targets.yaml       ținte nutriționale implicite
data/plan.yaml          rotația săptămânii + cronologia fiecărei sesiuni
layouts/                tema, scrisă de la zero
i18n/*.toml             textele interfeței, pe limbi
layouts/partials/calc/  motorul de calcul: nutriție și cost, la build
layouts/partials/tr.html  alege varianta de limbă a unui câmp din data/
assets/css/main.css     tot design system-ul
assets/js/app.js        toată logica din browser
```

Nutriția și costul se calculează **la build**, în Hugo. Browserul primește în `/app.json`
valori gata calculate — scalarea porțiilor e o simplă înmulțire, iar telefonul nu descarcă
baza de ingrediente. Există câte un `app.json` pentru fiecare limbă, cu numele și textele
deja traduse, ca `app.js` să nu aibă nevoie de niciun dicționar propriu.

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

## Deploy pe Cloudflare Pages

Workers & Pages → **Create** → **Pages** → **Connect to Git** → alege `recipes`.

| Setare | Valoare |
|---|---|
| Framework preset | **None** |
| Build command | `bash build.sh` |
| Build output directory | `public` |
| Root directory | `/` (lasă gol) |

Nu e nevoie de nicio variabilă de mediu și de niciun fișier de configurare Cloudflare în
repo. Tot ce trebuie știut despre build stă în `build.sh`.

**Nu folosi presetul Hugo.** Acela rulează `hugo --gc --minify` cu versiunea de Hugo din
imaginea de build a Cloudflare, care e mult în urmă — la data scrierii, 0.147.7 — iar
site-ul folosește sintaxă de layout din Hugo ≥ 0.146. Build-ul eșuează cu erori de șablon
care nu spun de ce. `bash build.sh` descarcă întâi versiunea exactă din `HUGO_VERSION` și
abia apoi construiește. Tot acolo e fixat și fusul orar `Europe/Dublin`, care contează:
pagina „Azi mănânci" și rotația sesiunilor de gătit se calculează la build din data curentă.

(`bash build.sh`, nu `./build.sh` — așa nu depinde de bitul de execuție al fișierului.)

Când ridici versiunea de Hugo local, schimb-o și în `build.sh`. Poți verifica înainte să
împingi, fiindcă scriptul rulează identic și local:

```bash
./build.sh
```

**Antetele HTTP** vin din `static/_headers`, pe care Hugo îl copiază în rădăcina build-ului
și pe care Pages îl citește de acolo. Important e `Cache-Control: no-cache` pe `/sw.js` și
pe `/js/app.js`: service worker-ul decide ce versiune a aplicației rulează pe telefon, iar
dacă îl ține cache-ul rămâi cu rețete vechi fără să înțelegi de ce. Pozele, care au hash de
conținut în nume, sunt în schimb marcate `immutable`.

Paginile inexistente primesc `404.html` cu codul 404 — Pages face asta singur pentru un
site static, nu trebuie configurat.

### Rebuild zilnic la 06:00

`.github/workflows/daily-rebuild.yml` rulează în fiecare dimineață și reîmprospătează ziua
curentă, rotația sesiunilor și eticheta de vechime a prețurilor.

Funcționează din start: workflow-ul face un commit mic în
`data/build-log.json`, iar push-ul declanșează build-ul Pages. Commit-ul are și rolul de a
împiedica GitHub să suspende workflow-ul după 60 de zile de inactivitate.

Dacă vrei și un declanșator explicit, creează un deploy hook în Cloudflare și pune URL-ul
în repo la Settings → Secrets and variables → Actions → `CLOUDFLARE_DEPLOY_HOOK`.

Cron-ul GitHub e best-effort: poate întârzia 5–15 minute. De aceea sunt două intrări
(pentru ora de vară și cea de iarnă) și o verificare a orei reale de la Dublin în interior.

## Nutriție

Valorile implicite din `data/targets.yaml` țintesc 3200 kcal, 90 g proteine și sub 2000 mg
sodiu pe zi — pragul recomandat de OMS pentru adulți.

Planul nu conține cereale, făinoase, cartofi sau alte rădăcinoase amidonoase, iar legumele
intră în cantități mici. Cu proteina plafonată la 90 g, singura sursă rămasă pentru restul
caloriilor e grăsimea: rezultatul e ~295 g grăsime și sub 40 g carbohidrați pe zi, adică
peste 80% din calorii din grăsime. Nu e o alegere de stil, e ce rămâne după constrângeri.

**De unde vine grăsimea contează pentru cât de plină arată farfuria.** Aceleași calorii pot
veni dintr-un cub de unt sau dintr-o bucată de carne grasă. Untul are 717 kcal la 100 g și
aproape zero proteină; pieptul de porc are 518 kcal și 9 g proteină — jumătate cât ceafa,
la de două ori caloriile. Rezultatul: la același plafon de proteine încap ~250 g de carne
într-o porție în loc de ~150 g, la un cost pe calorie practic identic. Rețetele folosesc
carnea grasă și ca sursă de grăsime de gătit — se rumenește prima, în tigaie rece, și restul
se gătește în untura ieșită din ea.

Prețul acestei alegeri e **fosforul**: mai multă carne înseamnă proporțional mai mult fosfor,
~1260 mg pe zi față de pragul informativ de 1200. Fosforul din carne se absoarbe pe jumătate,
spre deosebire de cel din aditivi, dar cifra e afișată per porție tocmai ca să fie vizibilă.
Primul comutator care o scade e „Include nuci".

Cealaltă consecință pe care o urmărește aplicația explicit: **fibrele**. Cartoful era principala sursă,
iar înlocuitorii — varză, conopidă, broccoli, nuci — ajung la ~20 g pe zi, sub recomandarea
generală de 25–30 g. Fibrele se afișează per porție, cu bară proprie, iar acolo bara plină e
lucrul bun; la sodiu, potasiu și fosfor e invers.

Rețetele afișează și potasiul și fosforul per porție, informativ. Toate țintele se pot
schimba din pagina **Setări**; valorile alese rămân în browser.

Datele nutriționale sunt valori uzuale de referință per 100 g, nu analize de laborator ale
produselor concrete din magazin. Sunt bune pentru orientare, nu pentru decizii medicale.
