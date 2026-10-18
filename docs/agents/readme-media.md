# Public README media

The public premise is **secret of mana. with goku**. Show combat techniques and the title screen; do not disclose story entrances, bosses, training encounters, transformations forced by the story, endings, late-game locations or debug links. The existing public screenshots under `assets/social/` remain available for web previews.

The README leads with the 512×448 title screen, followed by the overview, teaser link and six looping gameplay GIFs. The GIFs use native 256×224 pixels at 20 FPS, with a different area for each technique:

| GIF | Technique and scenery | Native map | Length |
| --- | --- | --- | --- |
| `instant-transmission.gif` | Teleport between enemies in desert dunes | 67 | 3.10 s |
| `ki-blasts.gif` | Fire in several directions in a castle hall | 302 | 2.70 s |
| `kamehameha.gif` | Charge and fire across a broad cavern | 286 | 3.65 s |
| `flight.gif` | Cross wooded cliffs and ledges | 25 | 2.50 s |
| `punch.gif` | Punch vegetation and advance along a forest trail | 28 | 2.35 s |
| `power-up.gif` | Gather ki at a waterfall pool | 109 | 3.00 s |

These are intentionally published promotional assets; raw frames and research checkpoints remain private under `.local/`. The clips show no dialogue, bosses or story events. The older `kamehameha.png` remains available as a still, but is no longer repeated in the README.

The first capture used game revision `b2f22da`; the six-area refresh uses the committed `1d6f2ba` runtime while concurrent gameplay work continues. The current capture uses the original SNES renderer and the private `rabite-field-solo` fixture with base-form Goku. The native door loader selects each area; ordinary game controls perform every technique. First-use tutorials are marked as already seen. No generated stand-in artwork or simulated gameplay is used.

## Recreate

With the local ROM imported, `.local/animation-audit/native/rabite-field-solo.json` available, Google Chrome and `ffmpeg` installed:

```sh
npm run dev
# In another terminal:
node scripts/capture-readme.mjs
```

Use `--url http://127.0.0.1:PORT/` for another local server or `--fixture /path/to/solo-state.json` for an equivalent native checkpoint. `--scene kamehameha --skip-title` recaptures one clip without replacing the title screenshot; scene names match the GIF filenames without `.gif`.

`scripts/capture-readme.mjs` defines each map, starting position and input sequence. It restores the seed before every clip, temporarily uses the native door event to load the map, and restores the cartridge bytes afterward. It verifies that the expected action occurs, that the clip stays in its selected area and that the game reports no JavaScript errors. It writes raw frames and action proof only to `.local/readme-capture/`, and curated GIFs/PNG to `assets/readme/`. Review each loop's framing, action poses, dialogue absence and GIF metadata before committing. Do not commit the source fixture, frames or proof output.

## 2026-10-16 refresh

- Moved the title screen ahead of the overview and GIF gallery.
- Replaced the three clips from one forest with six techniques in six distinct areas, with short public captions.
- Kept Goku in base form, removed leveling interruptions from the teleport clip and kept the flight path within the frame.
- Extended the capture script with per-scene regeneration and checks for technique playback and unexpected area transitions.

## Teaser

The published teaser supplied by the maintainer is [Secret of Goku on YouTube](https://www.youtube.com/watch?v=5lp2piNqMsg). Both README teaser links point to this video.

## 0.2.5 social teaser

`scripts/capture-teaser.mjs` records a 24.65-second, spoiler-free social cut:
punches on the forest trail, cliff flight, ki blasts, Instant Transmission,
waterfall focus and a full Kamehameha, followed by a 3.4-second play card.
It uses the six ordinary areas from the README capture, real controls and
base-form Goku. The captured browser runtime and assets match `v0.2.5`;
this video promotes the browser/desktop release, whose version is separate
from the standalone SNES preview.

```sh
PORT=5187 node scripts/serve.mjs
# In another terminal:
node scripts/capture-teaser.mjs
# Re-edit the captured frames without playing the scenes again:
node scripts/capture-teaser.mjs --render-only
```

The default private output is `.local/teaser-0.2.5/`. `--out`, `--url`,
`--fixture` and `--version` override the corresponding inputs; capture
rejects a version label that differs from `package.json`. `--capture-only`
records without composing. Chrome, ffmpeg and the same private solo fixture
as the README capture are required. Captions use local system fonts.

Every emulated frame is captured and played once at 60 fps, without speed-up
or interpolated frames. Native DSP samples, effects and speech share that
frame clock through an offline audio context; this is promotional footage,
not a real-time performance benchmark. The chant finishes before release,
and the final scene's music continues under the end card. The export uses
H.264/yuv420p and stereo AAC in a fast-start 1080×1080 MP4, following
[X's media encoding guidance](https://help.x.com/en/using-x/media-studio-faqs).

The first export has 1,479 video frames, 24.65 seconds of video and 24.647
seconds of audio, and is about 5.4 MB. Verification covered all six expected
techniques, stable map IDs, loaded sampled effects, no JavaScript errors,
decoded frame count, audio peaks and visual review of action frames and the
end card. The decoded audio's true peak is −2.93 dBTP.

The prepared MP4, thumbnail and `twitter-post.txt` are copied to ignored
`release/social/0.2.5/` for the maintainer. The draft includes the public play
URL and `v0.2.5` release URL. Preparing these files does not publish a post,
upload a video or replace the README's existing YouTube link. Raw frames,
audio, contact sheets and capture proof stay private and out of Git.
