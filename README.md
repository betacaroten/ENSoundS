# ENSoundS

**Every ENS name has its melody.**

ENSoundS gives voice to blockchain identity. Every `.eth` name turns into a short, deterministic, recognisably "ENS-like" tune — like an alien telling you their name in their native language. Same name, same melody, every time. Different names sound clearly different. The melody can't be spoofed because it's a pure function of the name's bytes.

Built at **ETHPrague 2026** — Future Society / Most Creative Use of ENS tracks.

- **Live:** https://ensounds.mrq.cz
- **ENS:** `ensounds.alzbeta.eth` (resolves via [eth.limo](https://eth.limo))
- **Devfolio:** https://devfolio.co/projects/ensounds-edf2

---

## What's in here

Three small static apps, all powered by the same generator in `lib/`.

### `profile/` — the per-name page
Type any ENS name (or share a `profile/#vitalik.eth` link) and hear its melody. The page reverse-resolves the name to an Ethereum address and shows a banner: either "Owned by 0x… → Etherscan" or "Not registered yet → Register on ENS". Char-viz lights up letter-by-letter in time with the audio; an oscilloscope draws the lead voice's waveform.

### `chain/` — the live block stream
Polls Ethereum mainnet every block. For each new block it pulls every unique `from` address, batches reverse-resolution through ENS' Universal Resolver, and plays the melody for every named address it finds — over a steady C2 drone. The chain singing the names of who's transacting right now.

### `tuner/` — the algorithm tuner
Where the sound came from. A list of test names, every algorithm dial as a slider (CPM, scale, sub-rhythm, nibble offsets, ADSR per voice, LPF/HPF/BP, drive, FM, vibrato, detune…), live re-eval while playing, MIDI Learn so a Roland S-1 (or any controller) can drive the dials by hand. Tunings export to a copy-pasteable `defaults` block.

---

## How a name becomes music

Sketch:

1. **Normalize** the input via [ENSIP-15](https://docs.ens.domains/ensip/15) (`@adraffy/ens-normalize`), then strip a trailing `.eth`. So `Vitalik.eth`, `vitalik.eth`, and `vitalik` all sound identical.
2. **Hash** the UTF-8 bytes with FNV-1a (32-bit). Slice the seed into independent channels for scale selection, cpm, and other per-name parameters that don't drive the melody itself.
3. **Bytes → nibbles → notes.** Each byte splits into two 4-bit nibbles. Each nibble maps to a scale degree (`nibble - 8`, range -8..+7). The melody is the full nibble sequence wrapped in Strudel's `<…>` mini-notation so each event plays one cycle.
4. **Render** to a Strudel pattern with a lead, a pad, and a fixed C2 drone. Each voice has its own ADSR and filter chain; the tuner's defaults flow through `lib/defaults.js`. Strudel's `tscope` draws the live waveform onto a canvas.

Properties this gives us:

- **Deterministic.** Pure function of the normalized input; identical across browsers and sessions.
- **Length-faithful.** Longer name → longer melody (one event per nibble; UTF-8 multi-byte chars naturally make the melody longer).
- **Distinguishable at equal length.** Same-length names share number of events but rarely the same notes — `mrq` and `abi` are obviously different.
- **No spoofing.** The bytes are the input; there's no shortcut.

---

## Run it locally

```
npm install
npm run dev
```

Vite serves on http://localhost:5173 with HMR. Multi-page entries: `/`, `/tuner/`, `/profile/`, `/chain/`.

```
npm run build      # static dist/
npm run preview    # serve the built dist/
```

The chain page hits public Ethereum RPCs (publicnode → 1rpc → llamarpc fallback). Set your own URL in chain settings if the public ones rate-limit.

Web MIDI works in Chrome/Edge/Safari 16.4+ on `localhost` and on HTTPS. Plug a controller in, click **MIDI** on the tuner, then **Learn**, then click a slider, then twist a knob.

---

## Deploy

### Pinata (IPFS) → ENS contenthash
Get a Pinata JWT (admin scope: `pinFileToIPFS`), then:

```
PINATA_JWT=<jwt> npm run deploy
```

`scripts/deploy.js` builds, walks `dist/`, uploads via the official `pinata` SDK, and prints the CID + the next steps (set `Content` record on `ensounds.alzbeta.eth` to `ipfs://<CID>`). Vite's `base: "./"` keeps every asset path relative, which IPFS gateways need.

### Docker Swarm / Swarmpit → ENS `url` text record
`Dockerfile` is a multi-stage `node:24-alpine` build that runs `serve@14` on port 3000. `stack.yml` is the Swarmpit-shaped compose file with Traefik labels for `ensounds.mrq.cz`, mirroring the same pattern that hosts `ensounds.mrq.cz` today.

```
docker build -t lumir/ensounds:latest .
docker push lumir/ensounds:latest
# then deploy stack.yml in Swarmpit
```

ENS pointer: on `ensounds.alzbeta.eth`, set a **text** record with key `url` and value `https://ensounds.mrq.cz`. The eth.limo gateway will 301-redirect `ensounds.alzbeta.limo` to the deployed site.

---

## Repo layout

```
lib/                 — shared generator: hash, mapping, generator,
                       defaults, charviz, midi, state
tuner/               — algorithm tuner (sliders, MIDI Learn, scope)
profile/             — per-name page (ENS lookup + register CTA)
chain/               — live mainnet block stream
scripts/deploy.js    — Pinata/IPFS deploy
Dockerfile           — multi-stage node:24-alpine + serve
stack.yml            — Swarmpit/Traefik stack
sound.cc             — original Strudel sketch the project grew from
names.txt            — initial test names with their UTF-8 bytes
```

---

## Tech

- [**Strudel**](https://strudel.cc) — the live-coding language we render to and play through `@strudel/web`.
- **viem** — Ethereum reads, ENS reverse resolution.
- **@adraffy/ens-normalize** — ENSIP-15 normalisation so `Vitalik.eth` ≡ `vitalik`.
- **Vite** — multi-page static build, HMR.
- **Web MIDI** — knob-driven tuning.
- **Web Audio analyser** — the oscilloscope canvas via Strudel's `tscope`.

No backend. No database. No accounts. Open the page, hear the name.

---

## Authors

- **lumir** — [github.com/mrq1911](https://github.com/mrq1911)
- **Alžběta Mrkvová** — [github.com/betacaroten](https://github.com/betacaroten)

ETHPrague 2026.
