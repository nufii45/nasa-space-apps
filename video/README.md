# Outpost Dial: 30-second concept video

`outpost-dial.mp4` is a 30-second, 1920×1080, 30 fps video made with Remotion from the wireframes
in `docs/wireframes/`. It shows the next-version UI concept, not the current game. Scenes 2 to 5 are
labelled "UI CONCEPT · NEXT VERSION".

Scenes: Title (0–3 s), Build the base (3–9 s), Plan a sol (9–15 s), Sept 2017 storm rescue
(15–22 s), Mission report (22–27 s), End card (27–30 s).

This folder is a separate project. Its dependencies (Remotion, React) are not part of the game's
`package.json`, and nothing here is imported by `src/` or deployed.

## Re-render

```sh
cd video
npm install
npx remotion studio src/index.jsx          # preview and edit
npm run render                              # writes out/outpost-dial.mp4
```

Fonts in `public/fonts/` are Barlow, Barlow Semi Condensed and JetBrains Mono (SIL Open Font License).
