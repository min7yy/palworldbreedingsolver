# Pal Route Solver

Find the **shortest breeding path** between any two Palworld pals — an exact lookup of the game's own breeding table, not a formula approximation.

**Live demo:** enable GitHub Pages on this repo (Settings → Pages → deploy from `main`, root) and it's live at `https://<your-username>.github.io/<repo-name>/`.

## Features

- **Exact game data** — every result comes from the game's precomputed breeding table (25,650 pairs across 226 pals, DLC included). No breeding-power formulas, no tiebreak guesses.
- **Shortest-route solver** — BFS over the species graph finds the minimum number of breeding generations between any start and target, with every valid partner listed per step.
- **Gender-locked combos** handled (Wixen/Katress) and flagged with ♀/♂.
- **Catch-only detection** — pals that can never hatch from an egg are reported as such instead of returning a wrong route.
- **Works anywhere** — plain static HTML/CSS/JS. Runs on GitHub Pages, any static host, or opened directly from disk. No build step, no dependencies.

## Usage

Pick a **start** pal (your passive-skill carrier) and a **target** pal. The solver returns the fastest species route. Passive skills transfer between species, so your passives ride along every step — keep each pairing's combined passive pool at ≤4 target skills for ~10% perfect-inherit odds per egg.

Partner options within a step are **unordered** — any listed partner produces the same child.

## Project structure

```
index.html          app shell
css/style.css       theme (Linear-inspired dark)
js/app.js           solver logic (BFS + rendering)
data/data.js        breeding table + pal names (generated from game data)
assets/pals/        226 pal icons (named by English pal name)
```

## Updating after a game patch

`data/data.js` is generated from [PalCalc](https://github.com/tylercamp/palcalc)'s extracted game data (`PalCalc.Model/breeding.json` + `db.json`). When Palworld updates, regenerate from the fresh files. New pal icons go in `assets/pals/<Name>.png`.

## Credits & disclaimer

- Breeding data and pal icons extracted from Palworld via [PalCalc](https://github.com/tylercamp/palcalc) (MIT).
- Palworld and all pal names/artwork are © Pocketpair, Inc. This is an unofficial fan-made tool, not affiliated with or endorsed by Pocketpair.
