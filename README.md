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
