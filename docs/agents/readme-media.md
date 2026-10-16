# Public README media

The public premise is **secret of mana. with goku**. Show combat techniques and the title screen; do not disclose story entrances, bosses, training encounters, transformations forced by the story, endings, late-game locations or debug links. The existing public screenshots under `assets/social/` remain available for web previews.

`assets/readme/` contains three looping GIFs captured from the actual game in an early forest clearing: Instant Transmission, ordinary ki blasts and Kamehameha. They use native 256×224 pixels at 20 FPS. The title and Kamehameha screenshots are 512×448. They show no dialogue or story events. These are intentionally published promotional assets; raw frames and research checkpoints remain private under `.local/`.

The first capture used the known-good game revision `b2f22da` while concurrent gameplay edits were in progress. The capture uses the original SNES renderer and the local `rabite-field-a` research fixture, with base-form Goku. No generated stand-in artwork or simulated gameplay is used.

## Recreate

With the local ROM imported, the private fixture available, Google Chrome and `ffmpeg` installed:

```sh
npm run dev
# In another terminal:
node scripts/capture-readme.mjs
```

Use `--url http://127.0.0.1:PORT/` for another local server, or `--fixture /path/to/early-forest-state.json` for an equivalent early-game combat checkpoint. The script writes raw frames only to `.local/readme-capture/` and curated final GIFs/PNG to `assets/readme/`. Review the action poses and full loop visually before committing replacements. Do not commit the source fixture or raw frames.

## Teaser

The published teaser supplied by the maintainer is [Secret of Goku on YouTube](https://www.youtube.com/watch?v=5lp2piNqMsg). Both README teaser links point to this video.
