# AEDs on the open map

Counted 2026-10-19 from OpenStreetMap via the Overpass API (`emergency=defibrillator` inside each city's boundary).
Reproduce with `npm run evidence`. Populations are 2020 US Census counts.

| City | Population | AEDs mapped | Per 100,000 people |
|---|---:|---:|---:|
| Virginia Beach, Virginia | 459,470 | 0 | 0.0 |
| Dallas, Texas | 1,304,379 | 0 | 0.0 |
| Houston, Texas | 2,304,580 | 20 | 0.9 |
| Austin, Texas | 961,855 | 19 | 2.0 |
| Chicago, Illinois | 2,746,388 | 52 | 1.9 |
| Seattle, Washington | 737,015 | 15 | 2.0 |

These numbers do not mean these cities have few AEDs. They mean the AEDs that exist are invisible to any app,
map or bystander who doesn't already know where they are.
