# Devpost submission draft

---

## Project name

Heartline

## Elevator pitch

On our street in Allen, Texas, every AED we could find is locked at night. Heartline finds the nearest AED that's actually open right now, coaches you through CPR until help arrives, and shows neighbors exactly where an always-open AED would save the most time, so they can fix it.

---

## What is the specific problem, and how do you know it's real?

I live on Audubon Pond Way in Allen, Texas, and a lot of my neighbors are older. When I looked up where the nearest public AED was, I couldn't find one I could actually reach at 2 a.m. When someone's heart stops, every minute without CPR or defibrillation counts: in one major study, the chance of surviving fell about **5.5 percentage points per minute** with no treatment ([Larsen 1993](https://doi.org/10.1016/S0196-0644(05)81302-2)). So I wanted to know how big that gap really is in my own neighborhood.

**What we found on foot.** We walked the neighborhood and found **two AEDs. Both were locked at night.**

**What the data says.** Survival depends heavily on what bystanders do before the ambulance arrives. In the national CARES registry, survival was **32.8%** when a bystander used an AED, versus **10.2%** overall. But bystanders used an AED in just **2.1%** of the cases where they could have. And **71.6%** of arrests happen at home, in neighborhoods, not in airports or malls.

**Why bystanders don't use AEDs: they can't find them.** We wrote a script ([`npm run evidence`](../scripts/count_aeds.mjs)) that counts every AED on OpenStreetMap, the open map behind thousands of apps, in major US cities:

| City | Population | AEDs on the open map |
|---|---:|---:|
| Virginia Beach, VA | 459,470 | 0 |
| Dallas, TX | 1,304,379 | 0 |
| Houston, TX | 2,304,580 | 20 |
| Chicago, IL | 2,746,388 | 52 |
| **Allen, TX (our city)** | 104,627 | **0** |

These cities do have AEDs, in schools, gyms, offices and police cars. They're just invisible. If you call 911 or open a map app, there's often no way to know the gym down the block has one.

**What the fire department told us.** We asked our local fire department about our area. They told us a fire engine or medic unit usually reaches the Audubon Pond Way area in about **4 to 6 minutes**, depending on traffic and which units are free, and every one of their response vehicles carries an AED. But the AED inside the nearby station on McDermott is in the lobby, and **after hours, when the doors are locked, it can't be reached from outside.**

So at night, the first AED to reach a neighbor here arrives on the truck. Until then, the minutes belong to whoever is standing there: calling 911 right away and starting CPR is what gives someone the best chance until help arrives.

**It gets worse after dark.** In a study of 4,789 cardiac arrests in Philadelphia, 30-day survival was **8.6% at night** (8 PM–8 AM) versus **10.9% in the day**, even after adjusting for other factors ([Wallace 2013](https://doi.org/10.1161/CIRCULATIONAHA.113.002058)). In England, only **34.3%** of public AEDs could be reached at night ([Deakin 2018](https://doi.org/10.1136/heartjnl-2018-312998)), because most are locked inside schools, offices and gyms.

**Our neighborhood's numbers (Audubon Pond, Allen, TX).** From OpenStreetMap data saved on 2026-10-20:
- **Zero** confirmed AEDs are mapped within 2.5 km (1.5 miles) of Audubon Pond Way, and zero in all of Allen.
- Within 2.5 km, **16** places that usually have an AED are open at 3 PM, **6** at dusk, and **0** at 2 AM (using typical hours for schools, churches, gyms and fire-station lobbies).
- By day, the closest is the fire station on West McDermott Drive, about a **9-minute** round trip on foot. At dusk and at night, Heartline's answer for our street is: *"No AED is available nearby right now. Keep doing CPR until help arrives."*
- Even counting every place that probably has an AED, under **1% of homes** can get one back within 4 minutes during the day, and **0%** at night.
- Heartline's top site for a 24/7 outdoor AED cabinet is **right outside the McDermott fire station**, the same station whose lobby AED is locked after hours.

---

## What it does

**Emergency mode.** A huge "Call 911" button, then "Find the nearest AED". Heartline finds mapped AEDs near you, plus places that usually have one (fire stations, police, gyms, schools). Those are always labelled "not confirmed", because in most US cities the confirmed list is empty. It checks whether each one is **open right now** from its posted hours and estimates how long the round trip takes for someone running to get it. Then it gives one plain instruction: *"Send someone to get the AED now. You stay and do CPR,"* or, if the nearest AED is too far, *"Start CPR first."* A "Send to a helper" button texts a neighbor the directions.

**CPR coach.** A 110-beats-per-minute metronome (sound, vibration, and a pulsing circle you can see across a room), with spoken instructions in English or Spanish that follow American Heart Association hands-only CPR guidance. It keeps the screen awake and works with no signal.

**Neighborhood gaps.** Pick any time of the week. Heartline colors every 100 m block of homes green (an AED can be back within your limit, default 4 minutes) or red (it can't). It graphs coverage across all 168 hours of the week, so the "everything's locked at night" problem is visible at a glance. It also recommends the 24/7 places (fire stations, gas stations, convenience stores) where an outdoor AED cabinet would cover the most homes. One tap prints an advocacy sheet to bring to a city council, HOA or school board.

**Add an AED.** See an AED that isn't on the map? Drop a pin, answer four questions (inside or outside, exactly where, when it's reachable, who can use it), and Heartline posts a public OpenStreetMap note with the correct tags. Local mappers add it, and then it's on every app built on OpenStreetMap, not just this one.

## How we built it

- Plain HTML/CSS/JavaScript with ES modules and no build step, so it loads fast on old phones and anyone can read the code.
- **Leaflet** + **OpenStreetMap** tiles for maps; the **Overpass API** for live AED and building data, with backup servers queried in parallel and an on-device cache for offline use.
- A custom parser for OSM's `opening_hours` format. It handles weekday ranges, split shifts, overnight hours and closed days. Anything it can't read is reported as "hours unknown", never guessed.
- **Ranking:** estimated round-trip time plus a penalty for uncertainty (unknown hours, or an unconfirmed location). A confirmed AED wins a close race, but a fire station 3 minutes away still beats a confirmed AED 15 minutes away.
- **Gap analysis:** a coverage model weighted by residential-street density (a free, works-everywhere proxy for homes), evaluated for every hour of the week. Cabinet suggestions use a greedy maximum-coverage algorithm, which is guaranteed to get within 63% of the best possible placement.
- **Web Speech API** (voice prompts), **Web Audio** (metronome), **Vibration**, **Screen Wake Lock**, **Web Share**, **Geolocation**, and a **service worker** for offline use.
- The **OSM Notes API** for community AED reports.
- 39 unit tests with Node's built-in test runner, plus a reproducible data script that counts mapped AEDs per city.

## Challenges we ran into

- **The data we needed didn't exist.** We planned to show the nearest AED, then found that OpenStreetMap has zero AEDs in all of Virginia Beach and Dallas. Showing an empty list in an emergency would be useless. So we added "likely AED" places, labelled honestly, plus a way for neighbors to add real AEDs and fill the map in.
- **Being honest under uncertainty.** It would have been easy to make coverage look good by assuming every AED is always available. Instead, unknown hours count as unavailable, "likely" sites stay off unless you turn them on, and every assumption is written in the About tab.
- **Ranking.** Our first version always put confirmed AEDs first, and then the app recommended an AED 18 minutes away over a fire station 3 minutes away. We switched to a time-plus-uncertainty penalty and wrote tests for both cases.
- **Opening hours** are written many different ways ("Mo-Fr 08:00-17:00, Sa 09:00-12:00", "Su 22:00-02:00", "PH off"…). We wrote and tested a parser for the common forms.
- **AED location data was missing or out of date.** Not one AED in our city is on the open map, and the places that probably have one rarely list hours. We had to combine the map, typical hours for each kind of place, and what we saw on foot, and label every guess as a guess.
- **Defining "reachable."** An AED behind a locked door might as well not exist. We first assumed fire stations were reachable around the clock. Then our local fire department told us the nearby station's lobby AED is locked after hours, so we changed the model: fire-station lobbies now count as closed at night, and the station became our top recommendation for an outdoor cabinet instead.

## Accessibility

No install, no account, no cost. Large buttons, high contrast, dark mode, screen-reader labels, reduced-motion support, English and Spanish (with spoken prompts in both), and an emergency number you can change (911/112/999/000). The CPR coach and call button keep working offline.

## What's next

- Add the two AEDs we found to OpenStreetMap with their real hours, so they show up in every map app.
- Share the printed gap sheet with the city and the fire department, recommending one outdoor 24/7 AED cabinet outside the McDermott station.
- Real walking routes instead of straight-line estimates.
- More languages (the strings are in one file, so a new language is one block of translations).
- Partner with local EMS agencies so 911 dispatchers can see community-mapped AEDs.

## Built with

`javascript` `html5` `css3` `leaflet` `openstreetmap` `overpass-api` `web-speech-api` `service-workers` `pwa` `node.js`

## Links

- Live demo: **[TODO: GitHub Pages URL, once the repo is public]**
- Code: https://github.com/Edtwo/Neighborhood-Hacks
- Video: **[TODO: YouTube/Vimeo URL]**

---

### Sources

- CARES. *National Survival Report, 2013–2025, Non-Traumatic Etiology* (generated April 2026). mycares.net
- Larsen MP, Eisenberg MS, Cummins RO, Hallstrom AP. Predicting survival from out-of-hospital cardiac arrest: a graphic model. *Ann Emerg Med* 1993;22(11):1652–1658.
- Pollack RA et al. Impact of bystander automated external defibrillator use on survival and functional outcomes in shockable observed public cardiac arrests. *Circulation* 2018;137(20):2104–2113.
- Panchal AR et al. Part 3: Adult Basic and Advanced Life Support: 2020 AHA Guidelines for CPR and ECC. *Circulation* 2020;142(16 suppl 2):S366–S468.
- Wallace SK et al. Effect of time of day on prehospital care and outcomes after out-of-hospital cardiac arrest. *Circulation* 2013;127(15):1591–1596.
- Deakin CD et al. Underutilisation of public access defibrillation is related to retrieval distance and time-dependent availability. *Heart* 2018;104(16):1339–1343.
- Our local fire department, answering our questions about the Audubon Pond Way area (October 2026).
- Map data © OpenStreetMap contributors (ODbL).
