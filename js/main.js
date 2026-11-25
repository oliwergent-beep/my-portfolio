/* Page behaviour: which section is active, keyboard travel, photo viewer */
(function () {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const root = document.documentElement;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const smallScreen = () => window.innerWidth < 861;

  /* ---------- particle field ---------- */
  const canvas = $('#field');
  let field = false;
  try { field = !!(window.Field && window.Field.init(canvas, { reducedMotion: reduced })); }
  catch (err) { console.warn('Particle field disabled:', err); field = false; }

  if (!field) {
    root.classList.add('no-gl');
    canvas.remove();
  } else {
    $$('.js-count').forEach(el => { el.textContent = Field.count.toLocaleString('en-US'); });
    // Where each sculpture sits on screen, in world units at the camera's focus plane
    Field.setLayout((name, aspect) => {
      const halfH = 4.4 * Math.tan((35 * Math.PI) / 360), halfW = halfH * aspect;
      if (smallScreen()) {
        const k = Math.min(halfW * 0.8, halfH * 0.42);
        if (name === 'galaxy') return { x: 0, y: halfH * 0.38, k: k * 1.05, gain: 0.95 };
        return { x: 0, y: halfH * 0.5, k, gain: 0.85 };
      }
      if (name === 'galaxy') return { x: halfW * 0.3, y: 0.32, k: Math.min(1.05, halfW * 0.42) };
      return { x: halfW * 0.34, y: 0.34, k: Math.min(halfH * 0.62, halfW * 0.3) };
    });
    Field.setShape('galaxy');
  }

  /* ---------- intro sequence ---------- */
  const reveal = () => root.classList.remove('is-loading');
  Promise.race([document.fonts ? document.fonts.ready : Promise.resolve(), new Promise(r => setTimeout(r, 1200))])
    .then(() => requestAnimationFrame(() => setTimeout(reveal, 60)));

  /* ---------- sections, rail and menu ---------- */
  const sections = $$('main > [data-shape]');
  const rail = $('.rail');
  const railButtons = sections.map(sec => {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('aria-label', sec.dataset.label);
    b.innerHTML = `<span>${sec.dataset.label}</span>`;
    b.addEventListener('click', () => go(sections.indexOf(sec)));
    rail.appendChild(b);
    return b;
  });
  const menuLinks = $$('.menu a');
  const menuFor = id => (id === 'top' ? '' : ['about', 'journey', 'contact'].includes(id) ? '#' + id : '#work');

  let active = null;
  function activate(sec) {
    active = sec;
    if (field) Field.setShape(sec.dataset.shape);
    sections.forEach((s, i) => {
      s.classList.toggle('is-active', s === sec);
      railButtons[i].setAttribute('aria-current', s === sec ? 'true' : 'false');
    });
    const m = menuFor(sec.id);
    menuLinks.forEach(a => a.setAttribute('aria-current', a.getAttribute('href') === m ? 'true' : 'false'));
  }
  function current() {
    const mid = window.innerHeight * 0.5;
    for (const s of sections) { const r = s.getBoundingClientRect(); if (r.top <= mid && r.bottom > mid) return s; }
    return window.scrollY < 10 ? sections[0] : sections[sections.length - 1];
  }

  let lastY = window.scrollY, ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      const s = current();
      if (s !== active) activate(s);
      const dy = window.scrollY - lastY;
      lastY = window.scrollY;
      if (field) Field.spin(Math.max(-40, Math.min(40, dy)) * 0.0012);
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  activate(current());

  /* ---------- keyboard travel, like a talk ---------- */
  function go(i) {
    i = Math.max(0, Math.min(sections.length - 1, i));
    sections[i].scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  }
  function step(dir) {
    const i = sections.indexOf(active), r = active.getBoundingClientRect(), vh = window.innerHeight;
    // Tall sections: read through them before jumping on
    if (dir > 0 && r.bottom > vh + 40) return window.scrollBy({ top: Math.min(vh * 0.8, r.bottom - vh), behavior: reduced ? 'auto' : 'smooth' });
    if (dir < 0 && r.top < -40) return window.scrollBy({ top: -Math.min(vh * 0.8, -r.top), behavior: reduced ? 'auto' : 'smooth' });
    go(i + dir);
  }
  window.addEventListener('keydown', e => {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
    if ($('#viewer').open) return;
    const el = document.activeElement, tag = el ? el.tagName : '';
    if (/INPUT|TEXTAREA|SELECT/.test(tag)) return;
    const k = e.key;
    let dir = 0;
    if (k === 'ArrowDown' || k === 'ArrowRight' || k === 'PageDown' || k === 'j') dir = 1;
    else if (k === 'ArrowUp' || k === 'ArrowLeft' || k === 'PageUp' || k === 'k') dir = -1;
    else if (k === ' ' && !/BUTTON|A/.test(tag)) dir = e.shiftKey ? -1 : 1;
    else if (k === 'Home') { e.preventDefault(); return go(0); }
    else if (k === 'End') { e.preventDefault(); return go(sections.length - 1); }
    if (!dir) return;
    e.preventDefault();
    step(dir);
  });

  /* ---------- work index lights up its star cluster ---------- */
  $$('.index-list a').forEach(a => {
    const on = () => field && Field.setHighlight(+a.dataset.i);
    const off = () => field && Field.setHighlight(-1);
    a.addEventListener('pointerenter', on); a.addEventListener('focus', on);
    a.addEventListener('pointerleave', off); a.addEventListener('blur', off);
  });

  /* ---------- click anywhere empty: ripple ---------- */
  window.addEventListener('pointerdown', e => {
    if (!field || e.button !== 0) return;
    if (e.target.closest('a, button, dialog, input, textarea, .photo-btn, kbd')) return;
    Field.shock(e.clientX, e.clientY);
  });

  /* ---------- photo viewer ---------- */
  const PROJECTS = {
    macropad: { title: 'Custom Macropad', images: [
      { src: 'assets/img/macropad.webp', alt: 'The finished macropad: three black keys and a silver knob on a clear acrylic case', caption: 'The finished pad on its layered acrylic case.' },
      { src: 'assets/img/macropad-2.webp', alt: 'Macropad parts laid out: soldering iron, circuit board, acrylic frame, switches, screws and solder', caption: 'Every part before assembly: board, switches, acrylic frame, screws and solder.' },
    ] },
    mirror: { title: 'Memory Mirror', images: [
      { src: 'assets/img/mirror.webp', alt: 'A hand turning a knob on a breadboard while a laptop shows the pixelated camera image', caption: 'Turning a knob on the breadboard pixelates the live image on screen.' },
    ] },
    smartbin: { title: 'Kallax Smart Bin', images: [
      { src: 'assets/img/smartbin.webp', alt: 'A white bin with a round walnut lid and a blue USB cable on a studio table', caption: 'The working prototype: sensors under the walnut lid, powered over USB.' },
    ] },
    tank: { title: 'Da Vinci Tank', images: [
      { src: 'assets/img/tank.webp', alt: 'Render of a cone-shaped wooden tank with cannons around its edge and wheels underneath', caption: 'Blender render. Drive it yourself on itch.io.' },
    ] },
    tatami: { title: 'Tatami Room', images: [
      { src: 'assets/img/tatami.webp', alt: 'Render of a small Japanese building with grid paper walls and a curved roof', caption: 'Blender render: paper-grid walls, curved roof, tatami floor through the door.' },
    ] },
    creature: { title: 'Creature Program', images: [
      { src: 'assets/img/creature.webp', alt: 'Three blue cartoon creatures on a beach with palm trees, one holding a red ball', caption: 'The running sketch: click a creature, pass the ball.' },
    ] },
    roadmap: { title: 'My learning roadmap', wide: true, images: [
      { src: 'assets/img/roadmap.webp', alt: 'A five-stage roadmap diagram from first-year projects to a Master’s programme in electrical and embedded engineering', caption: 'Five stages from my first-year projects to a Master’s. Drag or scroll sideways to read it.' },
    ] },
  };

  const viewer = $('#viewer'), vImg = $('#viewer-img'), vStage = $('.viewer-stage');
  let vProject = null, vIndex = 0;
  function renderViewer() {
    const p = PROJECTS[vProject], img = p.images[vIndex];
    vImg.src = img.src; vImg.alt = img.alt;
    $('#viewer-title').textContent = p.title;
    $('#viewer-caption').textContent = img.caption;
    const many = p.images.length > 1;
    $('#viewer-count').textContent = many ? `${vIndex + 1} / ${p.images.length}` : '';
    $('#viewer-prev').hidden = !many; $('#viewer-next').hidden = !many;
    viewer.classList.toggle('is-wide', !!p.wide);
    vStage.scrollLeft = 0;
  }
  function openViewer(id) {
    if (!PROJECTS[id]) return;
    vProject = id; vIndex = 0;
    renderViewer();
    if (typeof viewer.showModal === 'function') viewer.showModal(); else viewer.setAttribute('open', '');
    document.body.style.overflow = 'hidden';
  }
  function closeViewer() { if (viewer.open) viewer.close(); }
  function shift(d) { const n = PROJECTS[vProject].images.length; vIndex = (vIndex + d + n) % n; renderViewer(); }

  $$('.js-open').forEach(b => b.addEventListener('click', () => openViewer(b.dataset.project)));
  $('#viewer-close').addEventListener('click', closeViewer);
  $('#viewer-prev').addEventListener('click', () => shift(-1));
  $('#viewer-next').addEventListener('click', () => shift(1));
  viewer.addEventListener('close', () => { document.body.style.overflow = ''; });
  viewer.addEventListener('click', e => { if (e.target === vStage && !viewer.classList.contains('is-wide')) closeViewer(); });
  viewer.addEventListener('keydown', e => {
    if (e.key === 'ArrowRight') { e.preventDefault(); if (PROJECTS[vProject].wide) vStage.scrollBy({ left: 300, behavior: 'smooth' }); else shift(1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); if (PROJECTS[vProject].wide) vStage.scrollBy({ left: -300, behavior: 'smooth' }); else shift(-1); }
  });
  // drag to pan the wide roadmap
  let drag = null;
  vStage.addEventListener('pointerdown', e => { if (viewer.classList.contains('is-wide')) { drag = { x: e.clientX, s: vStage.scrollLeft }; vStage.setPointerCapture(e.pointerId); } });
  vStage.addEventListener('pointermove', e => { if (drag) vStage.scrollLeft = drag.s - (e.clientX - drag.x); });
  vStage.addEventListener('pointerup', () => { drag = null; });
  vStage.addEventListener('pointercancel', () => { drag = null; });
  vImg.addEventListener('dragstart', e => e.preventDefault());

  /* ---------- copy email ---------- */
  $$('.js-copy').forEach(b => b.addEventListener('click', async () => {
    const status = $('.copy-status');
    try {
      await navigator.clipboard.writeText(b.dataset.copy);
      status.textContent = 'Copied to your clipboard';
    } catch (_) {
      status.textContent = 'Copy failed. The address is ' + b.dataset.copy;
    }
    clearTimeout(b._t);
    b._t = setTimeout(() => { status.textContent = ''; }, 3000);
  }));
})();
