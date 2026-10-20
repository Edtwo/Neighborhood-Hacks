# Devpost submission draft

> Sections marked **[YOU]** must be written by you, about things you actually saw, did, or heard. Judges weight "Is this a real, specific problem the team has direct knowledge of?" at 25%. Don't submit with any bracket left in. Rewrite the rest in your own voice too.

---

## Project name

Heartline

## Elevator pitch

Heartline finds the nearest AED that's actually open right now and coaches you through CPR until it arrives. It also shows neighbors exactly which blocks have no AED in reach at 2 AM, so they can fix it.

---

## What is the specific problem, and how do you know it's real?

**[YOU] Open with the moment that made this real for you.** Prompts. Use whichever is true, and don't invent any of it:
- Did you ever look for the AED at your school, gym, church or job? Did you know where it was? Is it locked in after hours?
- Has anyone you know, or anyone in your community, had a cardiac arrest? (Only if you're comfortable sharing.)
- Walk your own street or neighborhood this week and count the AEDs you can find that anyone could reach at night. Write down the number.

**What the data says.** Most people survive a cardiac arrest only if someone starts CPR and uses an AED before the ambulance arrives. In the national CARES registry, survival was **32.8%** when a bystander used an AED, versus **10.2%** overall. But bystanders used an AED in just **2.1%** of the cases where they could have. And **71.6%** of arrests happen at home, in neighborhoods, not in airports or malls.

**Why bystanders don't use AEDs: they can't find them.** I wrote a script ([`npm run evidence`](../scripts/count_aeds.mjs)) that counts every AED on OpenStreetMap, the open map behind thousands of apps, in major US cities:

| City | Population | AEDs on the open map |
|---|---:|---:|
| Virginia Beach, VA | 459,470 | 0 |
| Dallas, TX | 1,304,379 | 0 |
| Houston, TX | 2,304,580 | 20 |
| Chicago, IL | 2,746,388 | 52 |
| **[YOU] your city** | | |

These cities have thousands of AEDs. They're just invisible. If you call 911 or open a map app, there's often no way to know the gym down the block has one.

**[YOU] Who you talked to.** One or two real conversations make this much stronger. Easy ones to get before the deadline:
- Your school nurse, athletic trainer or a coach: "Where are our AEDs? Can anyone get to them after hours? Are they on any map?"
- The front desk at a gym or rec center near you: same questions.
- A firefighter or EMT you know, or your fire department's non-emergency line: "How long does an ambulance usually take in our neighborhood?"
Quote what they said, with their permission.

**[YOU] Your neighborhood's numbers.** Open the Neighborhood gaps tab on your own neighborhood and report two numbers: coverage on a weekday afternoon, and at 2 AM Saturday. (On Capitol Hill in Seattle, for example, it's 37% vs 9%, even when counting places that only *probably* have an AED.)

---

## What it does

**Emergency mode.** A huge "Call 911" button, then "Find the nearest AED". Heartline finds mapped AEDs near you, plus places that usually have one (fire stations, police, gyms, schools). Those are always labelled "not confirmed", because in most US cities the confirmed list is empty. It checks whether each one is **open right now** from its posted hours and estimates how long the round trip takes for someone running to get it. Then it gives one plain instruction: *"Send someone to get the AED now. You stay and do CPR,"* or, if the nearest AED is too far, *"Start CPR first."* A "Send to a helper" button texts a neighbor the directions.

**CPR coach.** A 110-beats-per-minute metronome (sound, vibration, and a pulsing circle you can see across a room), with spoken instructions in English or Spanish that follow American Heart Association hands-only CPR guidance. It keeps the screen awake and works with no signal.

**Neighborhood gaps.** Pick any time of the week. Heartline colors every 100 m block of homes green (an AED can be back within your limit, default 4 minutes) or red (it can't). It graphs coverage across all 168 hours of the week, so the "everything's locked at night" problem is visible at a glance. It also recommends the 24/7 places (fire stations, gas stations, convenience stores) where an outdoor AED cabinet would cover the most homes. One tap prints an advocacy sheet to bring to a city council, HOA or school board.

**Add an AED.** See an AED that isn't on the map? Drop a pin, answer four questions (inside or outside, exactly where, when it's reachable, who can use it), and Heartline posts a public OpenStreetMap note with the correct tags. Local mappers add it, and then it's on every app built on OpenStreetMap, not just this one.

## How we built it

- Plain HTML/CSS/JavaScript with ES modules and no build step, so it loads fast on old phones and anyone can read the code.
- **Leaflet** + **OpenStreetMap** tiles for maps; the **Overpass API** for live AED and building data, with a backup server and an on-device cache for offline use.
- A custom parser for OSM's `opening_hours` format. It handles weekday ranges, split shifts, overnight hours and closed days. Anything it can't read is reported as "hours unknown", never guessed.
- **Ranking:** estimated round-trip time plus a penalty for uncertainty (unknown hours, or an unconfirmed location). A confirmed AED wins a close race, but a fire station 3 minutes away still beats a confirmed AED 15 minutes away.
- **Gap analysis:** a coverage model weighted by residential-street density (a free, works-everywhere proxy for homes), evaluated for every hour of the week. Cabinet suggestions use a greedy maximum-coverage algorithm, which is guaranteed to get within 63% of the best possible placement.
- **Web Speech API** (voice prompts), **Web Audio** (metronome), **Vibration**, **Screen Wake Lock**, **Web Share**, **Geolocation**, and a **service worker** for offline use.
- The **OSM Notes API** for community AED reports.
- 29 unit tests with Node's built-in test runner, plus a reproducible data script that counts mapped AEDs per city.

## Challenges we ran into

- **The data I needed didn't exist.** I planned to show the nearest AED, then found that OpenStreetMap has zero AEDs in all of Virginia Beach and Dallas. Showing an empty list in an emergency would be useless. So I added "likely AED" places, labelled honestly, plus a way for neighbors to add real AEDs and fill the map in.
- **Being honest under uncertainty.** It would have been easy to make coverage look good by assuming every AED is always available. Instead, unknown hours count as unavailable, "likely" sites stay off unless you turn them on, and every assumption is written in the About tab.
- **Ranking.** My first version always put confirmed AEDs first, and then the app recommended an AED 18 minutes away over a fire station 3 minutes away. I switched to a time-plus-uncertainty penalty and wrote tests for both cases.
- **Opening hours** are written many different ways ("Mo-Fr 08:00-17:00, Sa 09:00-12:00", "Su 22:00-02:00", "PH off"…). I wrote and tested a parser for the common forms.
- **[YOU] add one challenge from your own experience building or testing it.**

## Accessibility

No install, no account, no cost. Large buttons, high contrast, dark mode, screen-reader labels, reduced-motion support, English and Spanish (with spoken prompts in both), and an emergency number you can change (911/112/999/000). The CPR coach and call button keep working offline.

## What's next

- **[YOU] a real "AED hunt" in your neighborhood.** Get friends, a school club or Scouts to walk a few blocks and add every AED to the map. Report the number you added.
- Take the printed gap sheet to **[YOU: your city council / HOA / school board]** and ask for one outdoor 24/7 AED cabinet at the top-ranked site.
- Real walking routes instead of straight-line estimates.
- More languages (the strings are in one file, so a new language is one block of translations).
- Partner with local EMS agencies so 911 dispatchers can see community-mapped AEDs.

## Built with

`javascript` `html5` `css3` `leaflet` `openstreetmap` `overpass-api` `web-speech-api` `service-workers` `pwa` `node.js`

## Links

- Live demo: **[YOU: GitHub Pages URL]**
- Code: **[YOU: GitHub repo URL]**
- Video: **[YOU: YouTube/Vimeo URL]**

---

### Sources

- CARES. *National Survival Report, 2013–2025, Non-Traumatic Etiology* (generated April 2026). mycares.net
- Larsen MP, Eisenberg MS, Cummins RO, Hallstrom AP. Predicting survival from out-of-hospital cardiac arrest: a graphic model. *Ann Emerg Med* 1993;22(11):1652–1658.
- Pollack RA et al. Impact of bystander automated external defibrillator use on survival and functional outcomes in shockable observed public cardiac arrests. *Circulation* 2018;137(20):2104–2113.
- Panchal AR et al. Part 3: Adult Basic and Advanced Life Support: 2020 AHA Guidelines for CPR and ECC. *Circulation* 2020;142(16 suppl 2):S366–S468.
- Map data © OpenStreetMap contributors (ODbL).
