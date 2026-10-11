"""Bouwt de producten in data/kaart.json opnieuw op uit data/bron/beroepsproducten.txt.

Extra velden die al in kaart.json staan (beschrijving, tools, leerpad) blijven behouden
als rol + naam overeenkomen. Rollen, posities en leerpaden worden niet aangeraakt.

Gebruik:  python tools/importeer.py
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BRON = ROOT / "data" / "bron" / "beroepsproducten.txt"
GEDEELD = ROOT / "data" / "bron" / "gedeelde-onderwerpen.txt"
TREFWOORDEN = ROOT / "data" / "bron" / "trefwoorden.txt"
METHODEN = ROOT / "data" / "bron" / "onderzoeksmethoden.txt"
METHODEN_PER_PRODUCT = ROOT / "data" / "bron" / "methoden-per-product.txt"

# DOT framework: strategieën met hun logo (lokale kopie van ictresearchmethods.nl/img/methods/<s>/100px-Logo-<s>.png)
STRATEGIEEN = {
    "Library": "Standing on the shoulders of giants",
    "Field": "Understand your users",
    "Lab": "To measure is to know",
    "Showroom": "Know & show your contribution",
    "Workshop": "Seek variation and improvement",
}
LOGO = "img/dot/{s}.png"
KAART = ROOT / "data" / "kaart.json"
EXTRA_VELDEN = ("beschrijving", "tools", "leerpad")

# Eenmalige vertaling van oude (ingekorte) namen naar de officiële namen uit de bron
ALIASSEN = {
    ("UI/UX", "Affinity diagram"): "Affinity Diagrams",
    ("UI/UX", "Interactive prototype"): "Interactive Prototype",
    ("UI/UX", "Design systems"): "Design Systems",
    ("UI/UX", "Value proposition"): "Value Proposition",
    ("FE", "Interactief Figma-design"): "Interactief Figma design maken",
    ("FE", "Framework vergelijken"): "Framework Vergelijken",
    ("FE", "Rendering strategy (SSR, ISR, CSR)"): "Performance rendering strategy (SSR, ISR, CSR)",
    ("FE", "Storybook opzetten"): "Opzetten storybook",
    ("GD", "Player persona set"): "Player Persona Set",
    ("GD", "Game design document"): "Game Design Document",
    ("GD", "Core game mechanic prototype"): "Core Game Mechanic Prototype",
    ("GD", "Game engine recommendation"): "Game Engine Recommendation",
    ("GD", "Build & release pipeline script"): "Build & Release Pipeline Script",
    ("BE", "UML sequence diagram"): "UML - sequence diagram",
    ("BE", "OpenAPI / Swagger"): "Open API / swagger",
    ("AI", "Identificatie AI use cases"): "Identificatie AI use cases binnen organisatie",
    ("AI", "Trainen ML-model"): "Trainen ML model",
    ("BIT", "Gap-analyse"): "Gap analyse",
    ("BIT", "Adviesrapport o.b.v. analyse"): "Adviesrapport obv analyse",
    ("BIT", "Low-code oplossing"): "Low-code oplossing maken",
    ("CS", "Disaster recovery plan"): "Disaster Recovery Plan",
    ("CS", "Incident response book"): "Incident Response Book",
    ("CI", "Cloudstrategie-advies"): "Cloudstrategieadvies",
    ("CI", "Infrastructure as Code"): "Infrastructure as Code (Terraform | Bicep | CloudFormation)",
    ("TI", "Datasheet-vergelijking"): "Datasheet vergelijking",
    ("TI", "Advies hardwarekeuze"): "Adviesrapport hardware keuze",
    ("TI", "Firmware"): "Firmware (software voor hardware)",
    ("TI", "Over-the-air updates"): "Over the air updates",
}


def lees_trefwoorden():
    trefwoorden = {}
    for regel in TREFWOORDEN.read_text(encoding="utf-8").splitlines():
        regel = regel.strip()
        if regel and not regel.startswith("#"):
            code, _, omschrijving = (d.strip() for d in regel.partition("=>"))
            trefwoorden[code] = omschrijving
    return trefwoorden


def lees_bron(geldige_trefwoorden):
    regels = []
    for nr, regel in enumerate(BRON.read_text(encoding="utf-8").splitlines(), 1):
        regel = regel.strip()
        if not regel or regel.startswith("#"):
            continue
        # Productnamen kunnen zelf '|' bevatten: trefwoorden staan altijd na de laatste '|'
        basis, _, tags = regel.rpartition("|")
        delen = basis.split("|", 3)
        if len(delen) != 4:
            sys.exit(f"{BRON.name}:{nr}: verwacht ROL|Laag|Activiteit|Naam|trefwoorden, kreeg: {regel}")
        trefwoorden = [t.strip() for t in tags.split(",") if t.strip()]
        for t in trefwoorden:
            if t not in geldige_trefwoorden:
                sys.exit(f"{BRON.name}:{nr}: onbekend trefwoord '{t}' (zie {TREFWOORDEN.name})")
        regels.append((*(d.strip() for d in delen), trefwoorden))
    return regels


def lees_methoden(producten_per_rol):
    """Leest de onderzoeksmethoden en koppelt ze aan producten (veld 'methoden')."""
    methoden = {}
    for nr, regel in enumerate(METHODEN.read_text(encoding="utf-8").splitlines(), 1):
        regel = regel.strip()
        if not regel or regel.startswith("#"):
            continue
        strategie, naam, url = (d.strip() for d in regel.split("|"))
        if strategie not in STRATEGIEEN:
            sys.exit(f"{METHODEN.name}:{nr}: onbekende strategie '{strategie}'")
        methoden[naam] = {"strategie": strategie, "url": url}

    for nr, regel in enumerate(METHODEN_PER_PRODUCT.read_text(encoding="utf-8").splitlines(), 1):
        regel = regel.strip()
        if not regel or regel.startswith("#"):
            continue
        product_deel, _, methode_deel = regel.partition("=>")
        code, _, naam = (d.strip() for d in product_deel.partition(":"))
        gekozen = [m.strip() for m in methode_deel.split(";") if m.strip()]
        for m in gekozen:
            if m not in methoden:
                sys.exit(f"{METHODEN_PER_PRODUCT.name}:{nr}: onbekende methode '{m}'")
        producten = [p for p in producten_per_rol.get(code, []) if p["naam"] == naam]
        if not producten:
            sys.exit(f"{METHODEN_PER_PRODUCT.name}:{nr}: product '{code}: {naam}' bestaat niet")
        for p in producten:
            p["methoden"] = gekozen

    strategieen = {s: {"motto": motto, "logo": LOGO.format(s=s.lower())} for s, motto in STRATEGIEEN.items()}
    return methoden, strategieen


def lees_gedeeld(producten_per_rol):
    """Leest gedeelde-onderwerpen.txt en controleert of alle verwijzingen bestaan."""
    gedeeld = []
    for nr, regel in enumerate(GEDEELD.read_text(encoding="utf-8").splitlines(), 1):
        regel = regel.strip()
        if not regel or regel.startswith("#"):
            continue
        if "=>" not in regel:
            sys.exit(f"{GEDEELD.name}:{nr}: verwacht 'Onderwerp => ROL: naam ; ROL: naam'")
        naam, rest = (d.strip() for d in regel.split("=>", 1))
        refs = []
        for ref in rest.split(";"):
            code, _, product = (d.strip() for d in ref.partition(":"))
            if not any(p["naam"] == product for p in producten_per_rol.get(code, [])):
                sys.exit(f"{GEDEELD.name}:{nr}: product '{code}: {product}' bestaat niet in de bronlijst")
            refs.append([code, product])
        if len({code for code, _ in refs}) < 2:
            sys.exit(f"{GEDEELD.name}:{nr}: '{naam}' moet bij minstens twee rollen horen")
        gedeeld.append({"naam": naam, "producten": refs})
    return gedeeld


def main():
    kaart = json.loads(KAART.read_text(encoding="utf-8"))
    rollen = {r["code"]: r for r in kaart["rollen"]}

    # Bestaande extra informatie verzamelen, per (rol, naam, laag) en als terugval per (rol, naam)
    extra = {}
    for rol in kaart["rollen"]:
        for p in rol["producten"]:
            velden = {k: p[k] for k in EXTRA_VELDEN if k in p}
            if not velden:
                continue
            naam = ALIASSEN.get((rol["code"], p["naam"]), p["naam"])
            extra[(rol["code"], naam, p["laag"])] = velden
            extra.setdefault((rol["code"], naam, None), velden)

    trefwoorden = lees_trefwoorden()
    kaart["trefwoorden"] = trefwoorden

    nieuw = {code: [] for code in rollen}
    for code, laag, activiteit, naam, tags in lees_bron(trefwoorden):
        if code not in rollen:
            sys.exit(f"Onbekende rol '{code}' bij product '{naam}'")
        if laag not in kaart["lagen"] or activiteit not in kaart["activiteiten"]:
            sys.exit(f"Onbekende laag/activiteit bij '{naam}': {laag} / {activiteit}")
        product = {"naam": naam, "laag": laag, "activiteit": activiteit, "trefwoorden": tags}
        product.update(extra.get((code, naam, laag)) or extra.get((code, naam, None)) or {})
        nieuw[code].append(product)

    for code, producten in nieuw.items():
        rollen[code]["producten"] = producten

    kaart["gedeeld"] = lees_gedeeld(nieuw)
    kaart["onderzoeksmethoden"], kaart["strategieen"] = lees_methoden(nieuw)

    KAART.write_text(json.dumps(kaart, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    totaal = sum(len(p) for p in nieuw.values())
    print(f"{totaal} producten geïmporteerd: " + ", ".join(f"{c} {len(p)}" for c, p in nieuw.items()))


if __name__ == "__main__":
    main()
