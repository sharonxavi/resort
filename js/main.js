/* ═══════════════════════════════════════════════════════════════
   NEYTHAL — site behaviour
   ═══════════════════════════════════════════════════════════════ */
'use strict';

/* ───────────────────────────────────────────────────────────────
   ①  CONFIG — the only block you need to edit
   ─────────────────────────────────────────────────────────────── */
const CONFIG = {

  /* Resort name. Changing this updates the header, footer and copyright.
     Also update <title> and the meta tags in index.html. */
  name: 'Neythal',

  /* Your booking engine's base URL (Cloudbeds / eZee / STAAH / Djubo …).
     While this is left as PLACEHOLDER the form shows the query it would
     send instead of navigating — so you can test it before you go live. */
  engineUrl: 'PLACEHOLDER',
  // e.g. 'https://hotels.cloudbeds.com/reservation/AbCdEf'
  // e.g. 'https://live.ipms247.com/booking/book-rooms-neythal'

  /* Query-parameter names your engine expects. Rename the values on the
     right to match its documentation — the keys on the left stay put. */
  params: {
    checkin:  'checkin',
    checkout: 'checkout',
    adults:   'adults',
    children: 'children',
    rooms:    'rooms',
    promo:    'promo',
    room:     'roomtype',
    stay:     'staytype'
  },

  /* Open the engine in a new tab (true) or the same tab (false). */
  newTab: true
};

/* ───────────────────────────────────────────────────────────────
   ②  Helpers
   ─────────────────────────────────────────────────────────────── */
const $  = (s, c = document) => c.querySelector(s);
const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
const iso = d => d.toISOString().slice(0, 10);
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

/* Resort name → every [data-resort-name] slot */
$$('[data-resort-name]').forEach(el => { el.textContent = CONFIG.name; });
const yearEl = $('#year');
if (yearEl) yearEl.textContent = new Date().getFullYear();

/* ───────────────────────────────────────────────────────────────
   ③  Header + mobile drawer
   ─────────────────────────────────────────────────────────────── */
(() => {
  const hdr = $('#hdr');
  const onScroll = () => hdr.classList.toggle('is-stuck', window.scrollY > 60);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  const burger = $('#burger');
  const drawer = $('#drawer');
  if (!burger || !drawer) return;

  const setDrawer = open => {
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    document.body.style.overflow = open ? 'hidden' : '';
    if (open) {
      drawer.hidden = false;
      void drawer.offsetWidth;            // flush layout so the fade has a start value
      drawer.classList.add('is-open');
    } else {
      drawer.classList.remove('is-open');
      setTimeout(() => { drawer.hidden = true; }, 400);
    }
  };

  burger.addEventListener('click', () =>
    setDrawer(burger.getAttribute('aria-expanded') !== 'true'));
  $$('a', drawer).forEach(a => a.addEventListener('click', () => setDrawer(false)));
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && burger.getAttribute('aria-expanded') === 'true') setDrawer(false);
  });
})();

/* ───────────────────────────────────────────────────────────────
   ④  Hero video sound toggle
   ─────────────────────────────────────────────────────────────── */
(() => {
  const btn = $('#soundBtn'), vid = $('#heroVideo');
  if (!btn || !vid) return;
  btn.addEventListener('click', () => {
    vid.muted = !vid.muted;
    btn.setAttribute('aria-pressed', String(!vid.muted));
    btn.setAttribute('aria-label', vid.muted ? 'Unmute video' : 'Mute video');
    if (!vid.muted) vid.play().catch(() => {});
  });
})();

/* ───────────────────────────────────────────────────────────────
   ⑤  Booking bar
   ─────────────────────────────────────────────────────────────── */
(() => {
  const section  = $('#booking');
  const form     = $('#bookingForm');
  if (!section || !form) return;

  const checkin  = $('#checkin');
  const checkout = $('#checkout');
  const inLabel  = $('label[for="checkin"]');
  const guestsBtn   = $('#guestsBtn');
  const guestsPop   = $('#guestsPop');
  const guestsLabel = $('#guestsLabel');

  let stayType = 'overnight';
  let roomCode = '';

  /* — dates ————————————————————————————————— */
  const today = new Date();
  checkin.min  = iso(today);
  checkin.value  = iso(addDays(today, 1));
  checkout.min = iso(addDays(today, 2));
  checkout.value = iso(addDays(today, 3));

  checkin.addEventListener('change', () => {
    if (!checkin.value) return;
    const nextDay = iso(addDays(new Date(checkin.value), 1));
    checkout.min = nextDay;
    if (!checkout.value || checkout.value <= checkin.value) checkout.value = nextDay;
  });

  /* — stay-type tabs ———————————————————————— */
  $$('.booking__tab').forEach(tab => {
    tab.addEventListener('click', () => {
      $$('.booking__tab').forEach(t => {
        const on = t === tab;
        t.classList.toggle('is-active', on);
        t.setAttribute('aria-selected', String(on));
      });
      stayType = tab.dataset.stay;
      const dayUse = stayType === 'dayuse';
      section.classList.toggle('is-dayuse', dayUse);
      checkout.required = !dayUse;
      inLabel.textContent = dayUse ? 'Date' : 'Check in';
    });
  });

  /* — guests popover ——————————————————————— */
  const counts = { rooms: 1, adults: 2, children: 0 };

  const renderGuests = () => {
    const bits = [
      `${counts.rooms} room${counts.rooms > 1 ? 's' : ''}`,
      `${counts.adults} adult${counts.adults > 1 ? 's' : ''}`
    ];
    if (counts.children) bits.push(`${counts.children} child${counts.children > 1 ? 'ren' : ''}`);
    guestsLabel.textContent = bits.join(' · ');

    $$('.stepper', guestsPop).forEach(st => {
      const key = st.dataset.count;
      const min = +st.dataset.min, max = +st.dataset.max;
      $('output', st).value = counts[key];
      $$('button', st).forEach(b => {
        const next = counts[key] + Number(b.dataset.step);
        b.disabled = next < min || next > max;
      });
    });
  };

  const openGuests = open => {
    guestsBtn.setAttribute('aria-expanded', String(open));
    guestsPop.hidden = !open;
  };

  guestsBtn.addEventListener('click', () =>
    openGuests(guestsBtn.getAttribute('aria-expanded') !== 'true'));

  guestsPop.addEventListener('click', e => {
    const step = e.target.closest('button[data-step]');
    if (step) {
      const st  = step.closest('.stepper');
      const key = st.dataset.count;
      const val = counts[key] + Number(step.dataset.step);
      if (val >= +st.dataset.min && val <= +st.dataset.max) { counts[key] = val; renderGuests(); }
      return;
    }
    if (e.target.closest('[data-close-guests]')) { openGuests(false); guestsBtn.focus(); }
  });

  document.addEventListener('click', e => {
    if (!guestsPop.hidden && !e.target.closest('.field--guests')) openGuests(false);
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !guestsPop.hidden) { openGuests(false); guestsBtn.focus(); }
  });

  renderGuests();

  /* — "Reserve" on a room card prefills the room type ——— */
  $$('[data-book]').forEach(a => {
    a.addEventListener('click', () => {
      roomCode = a.dataset.book;
      setTimeout(() => checkin.focus({ preventScroll: true }), 700);
    });
  });

  /* — submit → hand off to the engine ————————— */
  const notice = document.createElement('p');
  notice.className = 'booking__note';
  notice.hidden = true;

  form.addEventListener('submit', e => {
    e.preventDefault();

    if (!checkin.value) { checkin.focus(); return; }
    if (stayType === 'overnight' && !checkout.value) { checkout.focus(); return; }

    const p = CONFIG.params;
    const q = new URLSearchParams();
    q.set(p.checkin, checkin.value);
    if (stayType === 'overnight') q.set(p.checkout, checkout.value);
    q.set(p.rooms, counts.rooms);
    q.set(p.adults, counts.adults);
    q.set(p.children, counts.children);
    q.set(p.stay, stayType);
    const promo = $('#promo').value.trim();
    if (promo) q.set(p.promo, promo);
    if (roomCode) q.set(p.room, roomCode);

    /* Engine not configured yet — show what would be sent. */
    if (!CONFIG.engineUrl || CONFIG.engineUrl === 'PLACEHOLDER') {
      notice.hidden = false;
      notice.innerHTML =
        '<svg viewBox="0 0 24 24" class="ico" aria-hidden="true">' +
        '<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5v.01"/></svg>' +
        '<span>Booking engine not connected yet. This search would open: ' +
        '<strong>?' + q.toString() + '</strong></span>';
      section.querySelector('.booking__shell').appendChild(notice);
      return;
    }

    const url = CONFIG.engineUrl + (CONFIG.engineUrl.includes('?') ? '&' : '?') + q.toString();
    if (CONFIG.newTab) window.open(url, '_blank', 'noopener');
    else window.location.href = url;
  });
})();

/* ───────────────────────────────────────────────────────────────
   ⑥  Reveal on scroll
   ─────────────────────────────────────────────────────────────── */
(() => {
  const items = $$('.reveal');
  if (!items.length) return;

  if (!('IntersectionObserver' in window)) {
    items.forEach(el => el.classList.add('is-in'));
    return;
  }
  const io = new IntersectionObserver((entries, obs) => {
    entries.forEach((entry, i) => {
      if (!entry.isIntersecting) return;
      setTimeout(() => entry.target.classList.add('is-in'), i * 90);
      obs.unobserve(entry.target);
    });
  }, { rootMargin: '0px 0px -12% 0px', threshold: .12 });

  items.forEach(el => io.observe(el));
})();

/* ───────────────────────────────────────────────────────────────
   ⑦  Stat counters
   ─────────────────────────────────────────────────────────────── */
(() => {
  const nums = $$('[data-count-to]');
  if (!nums.length || !('IntersectionObserver' in window)) {
    nums.forEach(n => { n.textContent = n.dataset.countTo + (n.dataset.suffix || ''); });
    return;
  }
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const io = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const el = entry.target;
      const to = +el.dataset.countTo, sfx = el.dataset.suffix || '';
      obs.unobserve(el);

      if (reduce) { el.textContent = to + sfx; return; }

      const dur = 1400, t0 = performance.now();
      const tick = now => {
        const p = Math.min((now - t0) / dur, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        el.textContent = Math.round(to * eased) + sfx;
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }, { threshold: .5 });

  nums.forEach(n => io.observe(n));
})();

/* ───────────────────────────────────────────────────────────────
   ⑧  Experiences accordion gallery

   Vanilla port of the React Bits <AccordionGallery />. Same layout maths as
   the original; CSS transitions replace GSAP, so there is no dependency.
   This sets only the per-index values inline (flex-grow, tilt, parallax);
   grayscale, dimming and the caption reveal are driven by .ag-panel--active
   in the stylesheet.
   ─────────────────────────────────────────────────────────────── */
(() => {
  const root = $('#expGallery');
  if (!root) return;
  const panels = $$('.ag-panel', root);
  if (!panels.length) return;

  /* Equivalent to the component's props. */
  const OPT = { defaultIndex: 2, expandRatio: 0.52, tilt: 6, parallax: 0.5, gap: 8 };

  const count = panels.length;
  const ratio = Math.min(Math.max(OPT.expandRatio, 0.2), 0.9);
  /* Solve flex-grow so the open panel takes exactly `ratio` of the row:
     grow / (grow + count - 1) === ratio */
  const grow = count > 1 ? (ratio * (count - 1)) / (1 - ratio) : 1;

  let active = Math.min(Math.max(OPT.defaultIndex, 0), count - 1);
  let mediaSize = 420;
  let stacked = false;

  const layout = () => {
    panels.forEach((panel, i) => {
      const isActive = i === active;
      panel.classList.toggle('ag-panel--active', isActive);
      panel.setAttribute('aria-current', isActive ? 'true' : 'false');
      panel.style.flexGrow = String(isActive ? grow : 1);

      /* Collapsed panels tilt away from the open one; stacked view stays flat. */
      const rot = isActive ? 0 : i < active ? OPT.tilt : -OPT.tilt;
      panel.style.transform = stacked ? '' : `rotateY(${rot}deg)`;

      /* The image is wider than its panel, so it can drift as widths change. */
      const media = $('.ag-panel__media', panel);
      if (media && !stacked) {
        const drift = Math.max(-1.5, Math.min(1.5, active - i));
        const shift = isActive ? 0 : drift * OPT.parallax * mediaSize * 0.06;
        media.style.transform = `translate(calc(-50% + ${shift.toFixed(1)}px), -50%)`;
      }
    });
  };

  const measure = () => {
    stacked = window.matchMedia('(max-width: 640px)').matches;
    const rect = root.getBoundingClientRect();
    const total = stacked ? rect.height : rect.width;
    const usable = Math.max(total - OPT.gap * (count - 1), 120);
    mediaSize = Math.max(140, usable * ratio * 1.22);
    root.style.setProperty('--ag-media-size', `${Math.round(mediaSize)}px`);
    layout();
  };

  const setActive = i => { if (i !== active) { active = i; layout(); } };

  const canHover = () => window.matchMedia('(hover: hover)').matches;

  panels.forEach((panel, i) => {
    panel.addEventListener('mouseenter', () => { if (canHover()) setActive(i); });
    panel.addEventListener('click', () => setActive(i));
    panel.addEventListener('focus', () => setActive(i));
    panel.addEventListener('keydown', e => {
      /* Set state explicitly rather than leaning on the focus handler to do it —
         .focus() does not reliably fire a focus event in an unfocused document. */
      const go = n => { e.preventDefault(); setActive(n); panels[n].focus(); };

      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') go((i + 1) % count);
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') go((i - 1 + count) % count);
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setActive(i); }
    });
  });

  measure();
  if ('ResizeObserver' in window) new ResizeObserver(measure).observe(root);
  else window.addEventListener('resize', measure);
  window.addEventListener('load', measure);
  if (document.fonts) document.fonts.ready.then(measure);
})();

/* ───────────────────────────────────────────────────────────────
   ⑨  Testimonials
   ─────────────────────────────────────────────────────────────── */
(() => {
  const stage = $('#quotes'), dots = $('#quotesDots');
  if (!stage || !dots) return;

  const slides = $$('.quote', stage);
  if (slides.length < 2) return;
  let i = 0, timer;

  slides.forEach((_, n) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-label', `Review ${n + 1}`);
    b.addEventListener('click', () => { show(n); restart(); });
    dots.appendChild(b);
  });
  const dotEls = $$('button', dots);

  function show(n) {
    i = (n + slides.length) % slides.length;
    slides.forEach((s, k) => s.classList.toggle('is-active', k === i));
    dotEls.forEach((d, k) => {
      d.classList.toggle('is-active', k === i);
      d.setAttribute('aria-selected', String(k === i));
    });
  }
  const restart = () => { clearInterval(timer); timer = setInterval(() => show(i + 1), 7000); };

  show(0);
  restart();
  stage.addEventListener('mouseenter', () => clearInterval(timer));
  stage.addEventListener('mouseleave', restart);
})();

/* ───────────────────────────────────────────────────────────────
   ⑩  Gallery lightbox
   ─────────────────────────────────────────────────────────────── */
(() => {
  const lb = $('#lightbox');
  const grid = $('#galleryGrid');
  if (!lb || !grid) return;

  const items = $$('.grid__i', grid);
  const img = $('#lbImg'), cap = $('#lbCap');
  let idx = 0, lastFocus = null;

  const render = () => {
    const el = items[idx];
    img.src = el.dataset.src;
    img.alt = $('img', el)?.alt || '';
    cap.textContent = el.dataset.cap || '';
  };

  const open = n => {
    idx = n; lastFocus = document.activeElement;
    render();
    lb.hidden = false;
    document.body.style.overflow = 'hidden';
    void lb.offsetWidth;                  // flush layout so the fade has a start value
    lb.classList.add('is-open');
    $('.lb__close', lb).focus();
  };
  const close = () => {
    lb.classList.remove('is-open');
    document.body.style.overflow = '';
    setTimeout(() => { lb.hidden = true; img.src = ''; }, 350);
    lastFocus?.focus();
  };
  const move = d => { idx = (idx + d + items.length) % items.length; render(); };

  items.forEach((el, n) => el.addEventListener('click', () => open(n)));

  lb.addEventListener('click', e => {
    const act = e.target.closest('[data-lb]')?.dataset.lb;
    if (act === 'close') return close();
    if (act === 'prev')  return move(-1);
    if (act === 'next')  return move(1);
    if (!e.target.closest('.lb__figure')) close();   // click the backdrop
  });

  document.addEventListener('keydown', e => {
    if (lb.hidden) return;
    if (e.key === 'Escape')     close();
    if (e.key === 'ArrowLeft')  move(-1);
    if (e.key === 'ArrowRight') move(1);
  });
})();
