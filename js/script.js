const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

// ---- Highlight the current section in the menu ----
const spy = $$('header[id], main[id], section[id], footer[id]');
const links = $$('.nav-link');
window.addEventListener('scroll', () => {
    let current = '';
    spy.forEach(s => { if (window.scrollY >= s.offsetTop - 160) current = s.id; });
    links.forEach(l => l.classList.toggle('active-link', l.getAttribute('href') === '#' + current));
});

// ---- Project filters ----
$$('.filter').forEach(btn => btn.addEventListener('click', () => {
    $$('.filter').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const f = btn.dataset.filter;
    $$('.project').forEach(p => p.classList.toggle('is-hidden', f !== 'all' && !p.dataset.cat.split(' ').includes(f)));
}));

// ---- Project pop-up with photo gallery and previous/next ----
// The pop-up is built here, so it works whatever the HTML contains
const oldModal = $('#project-modal');
if (oldModal) oldModal.remove();
const modal = document.createElement('div');
modal.id = 'project-modal';
modal.className = 'modal';
modal.setAttribute('role', 'dialog');
modal.setAttribute('aria-modal', 'true');
modal.innerHTML = `<div class="modal-content">
    <button class="close-btn" aria-label="Close">&times;</button>
    <div class="modal-media"><img id="modal-img" alt=""><div id="modal-thumbnails" class="modal-thumbnails"></div></div>
    <div class="modal-text">
        <p id="modal-count" class="modal-count"></p>
        <h3 id="modal-title"></h3>
        <p id="modal-desc"></p>
        <div id="modal-tags" class="project-tags"></div>
        <div id="modal-link"></div>
        <div class="modal-nav">
            <button id="modal-prev" class="nav-btn" aria-label="Previous project">←</button>
            <button id="modal-next" class="nav-btn" aria-label="Next project">→</button>
        </div>
    </div>
</div>`;
document.body.appendChild(modal);
const modalImg = $('#modal-img'), thumbs = $('#modal-thumbnails');
let current = null;
const shown = () => $$('.project').filter(p => !p.classList.contains('is-hidden'));

function openModal(p) {
    current = p;
    const list = shown();
    modalImg.src = $('img', p).src;
    modalImg.alt = $('img', p).alt;
    $('#modal-count').textContent = String(list.indexOf(p) + 1).padStart(2, '0') + ' / ' + String(list.length).padStart(2, '0');
    $('#modal-title').textContent = $('h3', p).textContent;
    $('#modal-desc').textContent = $('p', p).textContent;
    $('#modal-tags').innerHTML = $('.project-tags', p).innerHTML;
    const btn = $('.project-btn', p);
    $('#modal-link').innerHTML = btn ? btn.outerHTML : '';
    $('.modal-text').scrollTop = 0;
    thumbs.innerHTML = '';
    if (p.dataset.gallery) {
        p.dataset.gallery.split(',').forEach((src, i) => {
            const t = document.createElement('img');
            t.src = src.trim();
            t.alt = 'Photo ' + (i + 1);
            t.className = 'modal-thumb' + (i === 0 ? ' active-thumb' : '');
            t.addEventListener('click', () => {
                modalImg.src = t.src;
                $$('.modal-thumb').forEach(x => x.classList.remove('active-thumb'));
                t.classList.add('active-thumb');
            });
            thumbs.appendChild(t);
        });
    }
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}
function closeModal() {
    modal.classList.remove('active');
    document.body.style.overflow = '';
}
function step(dir) {
    const list = shown();
    openModal(list[(list.indexOf(current) + dir + list.length) % list.length]);
}

$$('.project').forEach(p => {
    p.tabIndex = 0;
    p.setAttribute('role', 'button');
    p.addEventListener('click', e => { if (!e.target.closest('.project-btn')) openModal(p); });
    p.addEventListener('keydown', e => {
        if (e.target === p && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openModal(p); }
    });
});
$('.close-btn').addEventListener('click', closeModal);
$('#modal-prev').addEventListener('click', () => step(-1));
$('#modal-next').addEventListener('click', () => step(1));
modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
window.addEventListener('keydown', e => {
    if (!modal.classList.contains('active')) return;
    if (e.key === 'Escape') closeModal();
    if (e.key === 'ArrowLeft') step(-1);
    if (e.key === 'ArrowRight') step(1);
});

// ---- Contact form (FormSubmit, with email fallback) ----
const form = $('#contact-form'), status = $('#form-status'), sendBtn = $('#submit-btn');
form.addEventListener('submit', async e => {
    e.preventDefault();
    sendBtn.disabled = true;
    sendBtn.textContent = 'Sending...';
    status.textContent = '';
    const data = new FormData(form);
    try {
        const res = await fetch(form.action, { method: 'POST', body: data, headers: { Accept: 'application/json' } });
        if (!res.ok) throw new Error('send failed');
        status.style.color = 'var(--ink)';
        status.textContent = 'Thanks! Your message has been sent.';
        form.reset();
    } catch (err) {
        const subject = encodeURIComponent('Portfolio message from ' + data.get('name'));
        const body = encodeURIComponent(`Name: ${data.get('name')}\nEmail: ${data.get('email')}\n\n${data.get('message')}`);
        window.location.href = `mailto:oliwer.gent@gmail.com?subject=${subject}&body=${body}`;
        status.textContent = 'Opening your email app so you can send it directly.';
    } finally {
        sendBtn.disabled = false;
        sendBtn.textContent = 'Send message';
    }
});

// ---- Subtle network background in the hero ----
(() => {
    const c = $('#hero-canvas'), hero = $('#home'), g = c.getContext('2d');
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let w, h, pts = [], mouse = null, visible = true;

    function size() {
        const d = window.devicePixelRatio || 1;
        w = hero.clientWidth; h = hero.clientHeight;
        c.width = w * d; c.height = h * d;
        g.setTransform(d, 0, 0, d, 0, 0);
        const n = Math.min(70, Math.round(w * h / 15000));
        pts = Array.from({ length: n }, () => ({
            x: Math.random() * w, y: Math.random() * h,
            vx: (Math.random() - 0.5) * 0.25, vy: (Math.random() - 0.5) * 0.25
        }));
        if (still) draw();
    }

    function draw() {
        g.clearRect(0, 0, w, h);
        for (let i = 0; i < pts.length; i++) {
            const a = pts[i];
            for (let j = i + 1; j < pts.length; j++) {
                const b = pts[j], d = Math.hypot(a.x - b.x, a.y - b.y);
                if (d < 140) {
                    g.strokeStyle = `rgba(17,19,24,${(1 - d / 140) * 0.12})`;
                    g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
                }
            }
            const m = mouse ? Math.hypot(a.x - mouse.x, a.y - mouse.y) : 999;
            if (m < 170) {
                g.strokeStyle = `rgba(47,75,255,${(1 - m / 170) * 0.45})`;
                g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(mouse.x, mouse.y); g.stroke();
            }
            g.fillStyle = m < 170 ? 'rgba(47,75,255,0.55)' : 'rgba(17,19,24,0.22)';
            g.beginPath(); g.arc(a.x, a.y, 2, 0, Math.PI * 2); g.fill();
        }
    }

    function frame() {
        if (visible) {
            pts.forEach(p => {
                p.x += p.vx; p.y += p.vy;
                if (p.x < 0 || p.x > w) p.vx *= -1;
                if (p.y < 0 || p.y > h) p.vy *= -1;
            });
            draw();
        }
        requestAnimationFrame(frame);
    }

    hero.addEventListener('mousemove', e => {
        const r = hero.getBoundingClientRect();
        mouse = { x: e.clientX - r.left, y: e.clientY - r.top };
    });
    hero.addEventListener('mouseleave', () => { mouse = null; });
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(hero);
    window.addEventListener('resize', size);
    size();
    if (!still) frame();
})();

// ---- Polish: reveal on scroll, card spotlight, hero tilt ----
document.documentElement.classList.add('js');
const reveal = new IntersectionObserver(entries => entries.forEach(en => {
    if (en.isIntersecting) { en.target.classList.add('in'); reveal.unobserve(en.target); }
}), { threshold: 0.1 });
$$('.project, .timeline li, .section-head, .contact-form, .footer-grid > div:first-child').forEach(el => {
    el.classList.add('rv');
    reveal.observe(el);
});

$$('.project').forEach(p => p.addEventListener('mousemove', e => {
    const r = p.getBoundingClientRect();
    p.style.setProperty('--mx', e.clientX - r.left + 'px');
    p.style.setProperty('--my', e.clientY - r.top + 'px');
}));

const stack = $('.hero-stack');
if (stack) {
    $('#home').addEventListener('mousemove', e => {
        if (window.innerWidth < 860) return;
        stack.style.setProperty('--px', (e.clientX / window.innerWidth - 0.5) * 2);
        stack.style.setProperty('--py', (e.clientY / window.innerHeight - 0.5) * 2);
    });
    $('#home').addEventListener('mouseleave', () => {
        stack.style.setProperty('--px', 0);
        stack.style.setProperty('--py', 0);
    });
}