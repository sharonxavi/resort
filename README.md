# Neythal — resort landing page

Static site. No build step, no dependencies. Open `index.html` or drop the
whole `site/` folder on any host (Netlify, Vercel, Hostinger, cPanel).

```
site/
  index.html      all markup, one page
  css/style.css   design tokens at the top, sections in page order
  js/main.js      CONFIG block at the top, then one IIFE per feature
  assets/         19 images + hero.mp4 (renamed copies; originals untouched)
```

---

## The three things to change before launch

### 1. Resort name

`js/main.js` → `CONFIG.name`. It fills every `[data-resort-name]` slot
(header, footer, copyright).

Then update by hand in `index.html`: the `<title>`, the `<meta name="description">`,
the two `og:` tags, and the `aria-label` on the brand link.

### 2. Booking engine

`js/main.js` → `CONFIG.engineUrl`. While it reads `PLACEHOLDER`, submitting the
search bar prints the query it *would* send instead of navigating — so you can
confirm the parameters before pointing it anywhere.

```js
engineUrl: 'https://hotels.cloudbeds.com/reservation/AbCdEf',
```

Then match `CONFIG.params` to whatever your engine calls its parameters. Keys on
the left stay as they are; change only the values on the right.

```js
params: { checkin:'checkin', checkout:'checkout', adults:'adults', … }
```

The "Reserve" button on each room card also passes that room's code through as
`roomtype` — the codes are the `data-book` attributes in `index.html`.

### 3. Let search engines in

While this is a staging site, `index.html` carries
`<meta name="robots" content="noindex, nofollow">`. Delete that line when the real
content goes live, and replace `robots.txt` with a normal allow + sitemap.

`robots.txt` deliberately **allows** crawling. A crawler has to fetch the page to
see the `noindex`; `Disallow: /` would block the fetch and let the bare URL get
indexed anyway.

### 4. Contact details

Search `index.html` for `PLACEHOLDER` — there are two blocks in the footer
(address, phone/email). Also the two `tel:` links in the header and drawer.

---

## Every time you change style.css or main.js

Bump the `?v=` number on **both** tags in `index.html` — the stylesheet `<link>` in
the head and the `<script>` at the bottom. They must match.

GitHub Pages serves assets with roughly a ten-minute max-age. Without the bump, a
returning visitor gets the new HTML with the old cached CSS and JS, which renders a
half-broken page until their cache expires. Verified, not theoretical: it happened on
the accordion deploy.

## Notes for whoever edits this next

- **Palette** lives in `:root` at the top of `style.css`. Changing `--teal-800`
  re-skins the buttons, footer, quotes band and booking bar together.
- **`--ink-45`** is set to the lightest value that still clears WCAG AA 4.5:1 on
  both sand backgrounds. It carries every 10–11px uppercase label, so re-check
  contrast if you lighten it.
- **`[hidden]{display:none!important}`** near the top of the reset is load-bearing.
  `.drawer` and `.lb` set `display:flex`/`grid`, which would otherwise outrank the
  browser's own `[hidden]` rule and leave a closed overlay on top of the page as an
  invisible click-blocker.
- **`:not(.eyebrow)`** on `.welcome__text p` and `.dine__body p` is deliberate. A
  bare descendant `p` outranks `.eyebrow` and greys out the section labels.
- **The Experiences accordion** is a dependency-free port of the React Bits
  `<AccordionGallery />`. Same layout maths as the original — flex-grow solved so the
  open panel takes `expandRatio` of the row — but CSS transitions replace GSAP, so
  there is no React and no build step. Tuning lives in the `OPT` object in `main.js`
  (`defaultIndex`, `expandRatio`, `tilt`, `parallax`, `gap`); everything else is CSS.
  Corner radius is deliberately 0 to match the rest of the site, not the original's 16px.
- **The gallery** is a port of the React Bits `<CircularGallery />` (WebGL, via `ogl`).
  `js/vendor/ogl.js` is vendored deliberately — no CDN at runtime. React is gone; the
  rendering classes never needed it. Tuning lives in `OPTS` at the top of `js/gallery.js`.
  - `idleWobble: 0` keeps the photos still. The original hardcodes `0.1`, which makes
    them ripple non-stop; at 0 they only move while being dragged or scrolled.
  - Wheel and pointer listeners are bound to the container, not `window` as the
    original does — otherwise the gallery spins whenever you scroll anywhere on the page.
  - Textures are shared per URL and downscaled to 1280px before upload. The original
    would have made eighteen full-size textures from your nine photos.
  - The mosaic grid is still in the page underneath as a fallback and only hides once
    WebGL has actually started. Don't hide it in CSS — if the script fails the section
    would be empty. The lightbox still works in that fallback path.
  - Canvas images are invisible to screen readers and Google, so `#galleryAltList`
    carries the same captions as text. Keep it in sync if you change the images.
- **Copy is placeholder** — written to fit the layout's rhythm and line lengths.
  Replacing it with real copy of roughly the same length will not disturb anything.

## Images

Filenames describe their subject (`infinity-pool.jpg`, `spa-terrace-ocean.jpg`).
Two originals contained a literal `…` character, which breaks URLs — those copies
are renamed `villa-balcony-view.jpg` and `hero.mp4`.

Before launch, compress the JPEGs (they are 0.4–1.4 MB each, ~17 MB total) and
consider WebP with a JPEG fallback. The hero video should get a shorter,
lower-bitrate encode for mobile.

## Running it locally

```bash
py -m http.server 5500 --directory "C:\Users\akash\OneDrive\Desktop\Resort\site"
```
