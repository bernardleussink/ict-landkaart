# ICT-landkaart (prototype)

Interactieve kaart van de 9 ICT-beroepsrollen als eilanden van zeshoeken. Elke zeshoek op een eiland is een
beroepsproduct (bron: lef.hu.nl/beroepsproducten). Klik op een zeshoek voor de factsheet.

## Starten

Geen buildstap of Node nodig, alleen Python:

```bash
python tools/serve.py
```

Open daarna http://localhost:5180. Deze server zet browsercaching uit, zodat wijzigingen direct zichtbaar zijn.

## Hoe de kaart wordt opgebouwd (`js/layout.js`)

1. **Middelpunten**: verwante rollen (gedeelde onderwerpen + gelijkenis van trefwoorden) trekken elkaar aan en
   drukken een beetje in elkaar, zodat hun gemeenschappelijke grens langer wordt. `positie` in `kaart.json` is
   alleen het startpunt van die berekening.
2. **Eilanden** groeien tegelijk vanuit hun middelpunt, met een voorkeur voor de richting van verwante buren.
   Raakt een eiland ingesloten, dan duwt het zijn buren een stukje op richting open zee. Hoe sterk het
   indrukken en uitrekken is, staat bovenin `js/layout.js` (`INDRUKKEN`, `UITREKKEN`).
3. **Gedeelde onderwerpen** (zie hieronder) worden één zeshoek op de grens tussen de betrokken eilanden; bij drie
   rollen waar mogelijk op het drielandenpunt. Ze hebben een gestippelde rand en de kleuren van de rollen.
4. **Plek binnen een eiland**: producten die alleen deze rol maakt liggen bij het midden; producten met
   trefwoorden die buurrollen ook veel hebben liggen aan de grens met die buren. Dezelfde trefwoorden bepalen
   ook welke rollen naar elkaar toe trekken en de "Lijkt op"-score in de factsheet. De HBO-i-laag bepaalt de
   plek niet; die staat in de factsheet en is te filteren.
5. **Kleur**: rolkleur van lef.hu.nl; de activiteit bepaalt de tint (Analyseren licht → Manage & control donker).

## Structuur

| Bestand | Wat |
|---|---|
| `data/bron/beroepsproducten.txt` | Bronlijst van alle producten (`ROL\|Laag\|Activiteit\|Naam\|trefwoorden`) |
| `data/bron/trefwoorden.txt` | De toegestane trefwoorden met omschrijving |
| `data/bron/onderzoeksmethoden.txt` | Methoden van het DOT framework (ictresearchmethods.nl) per strategie |
| `img/dot/*.png` | Logo's van de vijf DOT-strategieën, gekopieerd van ictresearchmethods.nl (HBO-i, 2018); bron vermelden bij publicatie |
| `data/bron/methoden-per-product.txt` | Welke onderzoeksmethoden bij welk product horen (`ROL: Product => Methode ; Methode`) |
| `data/bron/gedeelde-onderwerpen.txt` | Welke producten van verschillende rollen hetzelfde onderwerp zijn |
| `data/kaart.json` | Gegenereerd + aangevuld: rollen, producten, beschrijvingen, tools, gedeelde onderwerpen |
| `tools/importeer.py` | Bouwt `kaart.json` opnieuw op uit de bronbestanden |
| `tools/serve.py` | Lokale webserver zonder cache |
| `js/hex.js` | Hex-grid wiskunde (axiale coördinaten, buren, randen) |
| `js/layout.js` | Plaatsing van eilanden, grenzen, gedeelde onderwerpen en producten |
| `js/kaart.js` | Tekenen, zoomen/pannen, filters, deeplinks (`#be/unit-tests`, `#gedeeld/ci-cd`) |
| `js/factsheet.js` | HTML van de factsheet voor rol, product en gedeeld onderwerp |
| `css/style.css` | Opmaak, dark mode, mobiele bottom sheet |

## Inhoud aanpassen

1. Pas `data/bron/beroepsproducten.txt` en/of `data/bron/gedeelde-onderwerpen.txt` aan.
2. Draai:

   ```bash
   python tools/importeer.py
   ```

   Het script controleert of alle verwijzingen kloppen en bouwt de producten in `data/kaart.json` opnieuw op.
   Beschrijvingen, tools en leerpaden die al in `kaart.json` stonden blijven bewaard zolang rol en naam gelijk blijven.

Een product in `kaart.json` heeft minimaal `naam`, `laag` en `activiteit`; optioneel `beschrijving`, `tools` en
`leerpad` (URL). Lege velden worden in de factsheet als placeholder getoond.

Een gedeeld onderwerp schrijf je als:

```
Personas => UI/UX: Personas ; BIT: User persona's ; GD: Player Persona Set
```

## Bekende beperkingen van dit prototype

- Alle 429 beroepsproducten staan erin, maar slechts 16 hebben een beschrijving of tools.
- De lijst met gedeelde onderwerpen en de toegekende trefwoorden zijn een eerste voorstel en moeten
  inhoudelijk getoetst worden.
- Er is (nog) geen manier voor het werkveld om feedback te geven vanuit de kaart.
- Geen lijstweergave als toegankelijk alternatief voor de kaart (wel toetsenbordbediening: Tab, Enter, Esc).

## Volgende stap (productie)

1. Overzetten naar Astro (of SvelteKit) als statische site; layout tijdens de build berekenen in plaats van in de browser.
2. Decap CMS of Keystatic erbovenop, zodat docenten via een formulier wijzigingen als pull request indienen.
3. Feedback opslaan (bijv. Supabase of Microsoft Forms) en jaarlijks met een werkveldpanel doorlopen.
4. Per studiejaar een versie taggen in Git.
