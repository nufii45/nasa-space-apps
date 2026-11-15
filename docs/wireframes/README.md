# Outpost Dial wireframes (3D console direction)

Live canvas (interactive): https://claude.ai/artifact/3DTtPn5KSV2k99XSF6EL2s
The canvas is private. Share it from its Share menu before sending the link to anyone.

These are mid-fidelity wireframes for the next version of the game. The visual direction comes
from the learn-arduino reference site: an isometric scene in the middle, glowing hotspots,
dashed leader lines and small callout cards. The tasks that turn these wireframes into code are
in [`/wireframe_tasks.md`](../../wireframe_tasks.md).

## What is in `source/`

`source/` holds the canvas's own files: `canvas.json` (board layout and annotation notes) and
one `.dc.html` file per board. They are design references, not app code.

- They need the Design canvas runtime (`support.js`), so they do not open on their own in a
  browser. Use the live canvas link to view them.
- Do not import them into `src/`. Use them to read the copy, layout, sizes and states.

## Boards

| # | Screen | Desktop 1280×800 | Phone 390×844 |
| --- | --- | --- | --- |
| 1 | Title and mission select | `Title.dc.html` | `TitlePhone.dc.html` (SAMPLE DATA state) |
| 2 | Plan a sol | `Main.dc.html` | `PhonePlan.dc.html` |
| – | Isometric stage component | `Scene.dc.html` | (same file, `layout="phone"`) |
| 3 | Job help drawer | `Drawer.dc.html` (1024×572 short window) | `DrawerPhone.dc.html` |
| 4 | Storm alert and rescue | `Storm.dc.html` (live countdown), `StormTimesUp.dc.html` | `StormPhone.dc.html` (Cadet), `StormPhoneTimesUp.dc.html` |
| 5 | Sol result | `SolResult.dc.html` | `SolResultPhone.dc.html` |
| 6 | Mission report, 3 endings | `Report.dc.html` (win), `ReportHome.dc.html`, `ReportTime.dc.html` | `ReportPhoneWin/Home/Time.dc.html` |
| 7 | Credits and data sources | `Credits.dc.html` | `CreditsPhone.dc.html` |
| 8 | States and edge cases | `States.dc.html` | `StatesPhone.dc.html` |
| – | Component sheet and design language | `Components.dc.html` | – |

## Design tokens

| Token | Value | Use |
| --- | --- | --- |
| Paper | `#F6EDDD` | Page background, with a 32 px grid in `#EDE2CE` and faint circuit traces |
| Card | `#F9F2E5` | Cards, panels; border `#CEC0AD`, 10–14 px corners, soft shadow |
| Navy ink | `#18213D` | Text, outlines, dark buttons |
| Teal | `#1AA3A1` | Active and selected: hotspots, focus ring, selected tab. Teal *text* uses `#0E5F5E` (4.5:1 on cream) |
| Burnt orange | `#C0652D` | Storms and warnings only |
| Power line | `#E2B23F` | Power pipes and the power gauge |
| Water line | `#6E9FD0` | Water pipes |
| Lamp OK | `#3E9B6A` | Lamp "OK" state |

Type: Barlow Semi Condensed 700 uppercase for headings and buttons, Barlow 400 for body text
(16 px, 13 px minimum), JetBrains Mono 500 for numbers and gauges.

Isometric drawing: 30° projection, 1.4 px navy outlines, three flat tones per object (light
top, mid left face, dark right face), no gradients.

## Key design decisions

- **Build the stage as isometric SVG (2.5D), not WebGL.** The reference is flat isometric
  illustration, not a real 3D engine. SVG gives the same look, runs on school Chromebooks,
  adds no dependency, and every hotspot stays a real `<button>` for keyboard and screen-reader
  users. "Rotate" means 4 pre-drawn 90° views, not free rotation.
- **One word for radiation everywhere.** Never "sunburn" in one place and "radiation" in
  another.
- **Every control is at least 44 px**, colour is never the only signal (lamps and gauges always
  carry a word), and Reduced motion stops the idle spin, the flow dots, the sun flash and the
  breathing hotspots.
