# Heartline

**Find an AED fast. Know where your neighborhood has none.**

Heartline is a free web app for the first minutes of a cardiac arrest, and for the neighbors who want to make those minutes shorter. It works on any phone with no install and no account, in English and Spanish, and the CPR coach works offline.

Neighborhood Hacks 2026 · Safety & Emergency Response track.

## The problem

When someone's heart stops, survival falls with every minute until CPR and a shock. In King County data, it dropped about 5.5 percentage points per minute with no treatment ([Larsen 1993](https://doi.org/10.1016/S0196-0644(05)81302-2)). An AED in a bystander's hands changes the odds a lot. In the US registry CARES, survival was 32.8% when a bystander used an AED, versus 10.2% overall. But bystanders used one in only **2.1%** of eligible cases ([CARES 2013–2025](https://mycares.net/sitepages/uploads/2026/CARES%202013-2025%20Non-Traumatic%20National%20Survival%20Report.pdf)).

One reason: **nobody can find them.** OpenStreetMap, the open map that thousands of apps are built on, lists zero AEDs in Virginia Beach and zero in Dallas ([counts, reproducible](docs/evidence-aed-counts.md)):

| City | Population | AEDs on the open map |
|---|---:|---:|
| Virginia Beach, VA | 459,470 | 0 |
| Dallas, TX | 1,304,379 | 0 |
| Houston, TX | 2,304,580 | 20 |
| Chicago, IL | 2,746,388 | 52 |

And 71.6% of cardiac arrests happen at home (CARES), in residential neighborhoods, often at night, when the AEDs in schools and offices are locked inside.

## What it does

| | |
|---|---|
| **Emergency** | One tap to call 911. One tap to find the nearest AED that is **open right now**, ranked by the estimated round trip for someone fetching it. Places that *usually* have an AED (fire stations, police, gyms, schools) are shown too, clearly labelled "not confirmed", because in most US cities the confirmed list is empty. The app then gives plain advice: send a runner, or keep doing CPR. A "Send to a helper" button texts a neighbor the directions. |
| **CPR coach** | A 110-per-minute beat (sound, vibration and a pulsing circle) with spoken prompts in English or Spanish. It follows AHA hands-only CPR guidance (100–120/min, at least 2 inches deep) and keeps the screen awake. |
| **Neighborhood gaps** | Splits the map into 100 m squares weighted by residential streets. It shows which homes can get an AED back within your time limit **at the hour you choose**, plots coverage across the whole week, and picks the 24/7 places where an outdoor AED cabinet would close the most gap. The result prints as a one-page advocacy sheet for a city council, HOA or school board. |
| **Add an AED** | Turns an AED you spotted into a public OpenStreetMap note with the right tags (`emergency=defibrillator`, `indoor`, `opening_hours`, `defibrillator:location`). Local mappers add it, and every app that uses OSM learns about it. |

Example from a real run, Capitol Hill in Seattle, counting likely AED sites: **37% of homes are within a 4-minute AED round trip on a weekday morning, and 9% at 2 AM on Saturday.**

## How it works

- **Data:** live OpenStreetMap data from the Overpass API, falling back to a second mirror. The last result is cached on the device, so the app still answers with no signal.
- **Open-now check:** a parser for OSM `opening_hours` ([src/lib/hours.js](src/lib/hours.js)). It handles ranges, split shifts, overnight hours, `off` rules and `24/7`. Anything it can't read is reported as "hours unknown", never guessed.
- **Fetch time:** 2 × straight-line distance × 1.3 (streets aren't straight) ÷ 2 m/s, + 60 s to find an indoor AED or 20 s for an outdoor cabinet.
- **Ranking:** round-trip time plus a penalty for uncertainty: +90 s for unknown hours, +120 s for a likely-but-unconfirmed site. A confirmed AED wins a close race, but a fire station 3 minutes away still beats a confirmed AED 15 minutes away.
- **Gap analysis:** coverage is weighted by home density. It is computed for all 168 hours of the week, and AEDs with unknown hours count as unavailable, so coverage is never overstated. Cabinet sites are chosen greedily by newly covered homes. Greedy is the standard algorithm for this coverage problem and is guaranteed to get within 63% of the best possible choice ([src/lib/gaps.js](src/lib/gaps.js)).

## Built with

Plain HTML, CSS and JavaScript (ES modules, no build step), [Leaflet](https://leafletjs.com/), OpenStreetMap + Overpass API, OSM Notes API, Web Speech API, Web Audio, Vibration, Screen Wake Lock, Geolocation, Web Share, and a service worker for offline use. Tests use Node's built-in test runner.

## Run it

```bash
npm run serve          # then open http://localhost:8080
npm test               # 29 unit tests, no dependencies to install
npm run evidence       # recount AEDs on OpenStreetMap per city
node scripts/count_aeds.mjs "Your City" "Your State" 123456   # add your own city
```

Geolocation needs `https://` or `localhost`. Any static host works (GitHub Pages, Netlify, Deployxa).

## Limitations

- "Likely" sites and their typical hours are guesses by category. They are labelled as such everywhere.
- Fetch times are straight-line estimates, not real routes.
- Residential street density only roughly approximates where people live.
- Opening hours are checked in the phone's local time zone, so demo places in other time zones use your clock.
- Heartline is not a medical device. It does not replace calling 911 or learning CPR.

## Sources

- CARES. *National Survival Report, 2013–2025, Non-Traumatic Etiology* (2026).
- Larsen MP et al. Predicting survival from out-of-hospital cardiac arrest: a graphic model. *Ann Emerg Med* 1993;22(11):1652–1658.
- Pollack RA et al. Impact of bystander AED use on survival and functional outcomes in shockable observed public cardiac arrests. *Circulation* 2018;137(20):2104–2113.
- Panchal AR et al. Part 3: Adult Basic and Advanced Life Support. 2020 AHA Guidelines for CPR and ECC. *Circulation* 2020;142(16 suppl 2):S366–S468.

Map data © OpenStreetMap contributors, ODbL. Code MIT licensed.
