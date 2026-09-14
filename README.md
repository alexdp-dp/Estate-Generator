# Estate Studio Model Generator — V1.2 Hooks Fix

Fix pentru eroarea React production `#310`:
- `ProjectEditor` avea un `return` condițional înaintea unui `useEffect`;
- primul render (project=null) executa mai puține hook-uri decât renderul următor;
- toate hook-urile sunt acum executate în aceeași ordine la fiecare render;
- accesul la `project.assets` este null-safe;
- `/api/version` => `1.2-hooks-fix`.

# Estate Studio Model Generator — V1.1 Create Fix

Fix pentru proiect nou:
- erorile de creare sunt afișate în UI, nu mai pare că butonul nu face nimic;
- banner live `Supabase conectat / indisponibil`;
- `/api/health` spune explicit dacă lipsește o variabilă Render;
- acceptă `SUPABASE_SERVICE_ROLE_KEY` sau `SUPABASE_SECRET_KEY`;
- slug duplicat este rezolvat automat;
- proiectul incomplet este șters automat dacă inserarea blocurilor eșuează;
- `/api/version` => `1.1-create-fix`.

# Estate Studio Model Generator — V1

Repository recomandat: `estate-studio-model-generator`

## Render
Un singur **Web Service / Node.js**.

Build Command:
`npm install && npm run install:all && npm run build`

Start Command:
`npm start`

Environment:
- `SUPABASE_URL=https://tdcrjumaidgsdnohusmk.supabase.co`
- `SUPABASE_SERVICE_ROLE_KEY=...`
- `JWT_SECRET=...`
- `NODE_ENV=production`

## Ce face V1
- proiecte de generator separate de Estate Studio;
- alegi numărul de clădiri;
- redenumești și poziționezi clădirile;
- upload planuri, fațade, secțiuni, randări, imagini aeriene, plan amplasament;
- optimizare imagini în browser (max. 4096px, WebP) înainte de upload;
- clasificare documente pe proiect / clădire;
- tipuri de etaj: parter, etaj tip, retras, penthouse etc.;
- aplicare tip de plan la niveluri multiple;
- calibrare scară pe 2 puncte;
- trasare contur exterior cu snap 0/90 și 45;
- preview 3D procedural;
- export GLB per clădire sau pentru tot ansamblul;
- salvarea exporturilor în Supabase Storage.

## Limitarea intenționată a V1
V1 generează **volumetria 3D exterioră din contururile etajelor**. Nu încearcă încă să deducă automat ferestrele, balcoanele și materialele din randări. Acestea sunt următorul strat al generatorului.
