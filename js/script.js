// =========================================================
// Part 1: Architectural Topological & Vector Crosshair Field
// =========================================================
const canvas = document.getElementById('particle-canvas');
const ctx = canvas.getContext('2d');
let width, height;

function setCanvasSize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    width = canvas.width;
    height = canvas.height;
}
setCanvasSize();
window.addEventListener('resize', setCanvasSize);

let scrollY = window.scrollY;
let targetScrollY = window.scrollY;
let mouseX = width * 0.65;
let mouseY = height * 0.4;
let targetMouseX = mouseX;
let targetMouseY = mouseY;

window.addEventListener('scroll', () => { targetScrollY = window.scrollY; });
window.addEventListener('mousemove', (e) => {
    targetMouseX = e.clientX;
    targetMouseY = e.clientY;
});

function animateField() {
    scrollY += (targetScrollY - scrollY) * 0.08;
    mouseX += (targetMouseX - mouseX) * 0.08;
    mouseY += (targetMouseY - mouseY) * 0.08;
    const time = performance.now() * 0.00025;

    ctx.fillStyle = '#0a0b0d';
    ctx.fillRect(0, 0, width, height);

    // 1. Monochrome Blueprint Isolines
    const numLines = 26;
    const segments = 60;
    const spacingY = (height + 120) / numLines;
    const spacingX = width / segments;

    for (let i = 0; i < numLines; i++) {
        ctx.beginPath();
        const baseY = i * spacingY - 60;

        for (let j = 0; j <= segments; j++) {
            const x = j * spacingX;

            const n1 = Math.sin(x * 0.0022 + time + i * 0.18 + scrollY * 0.0015) * 26;
            const n2 = Math.cos(x * 0.0045 - time * 0.7 + i * 0.09 - scrollY * 0.0008) * 12;

            const dx = x - mouseX;
            const dy = baseY - mouseY;
            const dist = Math.hypot(dx, dy);
            const radius = 300;
            let pull = 0;
            if (dist < radius) {
                const factor = 1 - dist / radius;
                pull = Math.sin(factor * Math.PI) * 32;
            }

            const y = baseY + n1 + n2 - pull;

            if (j === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }

        const isIndexContour = i % 5 === 0;
        ctx.strokeStyle = isIndexContour
            ? 'rgba(236, 234, 228, 0.11)'
            : 'rgba(236, 234, 228, 0.038)';
        ctx.lineWidth = isIndexContour ? 1.1 : 0.7;
        ctx.stroke();
    }

    // 2. Precision Vector Grid Crosshairs
    const gridStep = 95;
    for (let gx = gridStep / 2; gx < width; gx += gridStep) {
        for (let gy = gridStep / 2; gy < height; gy += gridStep) {
            const dx = mouseX - gx;
            const dy = mouseY - gy;
            const dist = Math.hypot(dx, dy);
            const angle = Math.atan2(dy, dx) + scrollY * 0.001;

            const isNear = dist < 230;
            const len = isNear ? 5.5 : 3;

            ctx.save();
            ctx.translate(gx, gy);
            ctx.rotate(isNear ? angle : 0);

            ctx.beginPath();
            ctx.moveTo(-len, 0);
            ctx.lineTo(len, 0);
            ctx.moveTo(0, -len);
            ctx.lineTo(0, len);

            ctx.strokeStyle = isNear
                ? 'rgba(255, 79, 31, 0.42)'
                : 'rgba(236, 234, 228, 0.065)';
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.restore();
        }
    }

    requestAnimationFrame(animateField);
}
animateField();

// =========================================================
// Part 2: Automatic Image Extension & Filename Fallback
// =========================================================
function attachFallback(imgElement, fallbackPath) {
    if (!fallbackPath) return;
    imgElement.addEventListener('error', function handleErr() {
        if (this.src.indexOf(fallbackPath) === -1) {
            this.src = fallbackPath;
        }
        this.removeEventListener('error', handleErr);
    });
}

document.querySelectorAll('img[data-fallback]').forEach(img => {
    attachFallback(img, img.getAttribute('data-fallback'));
});

// =========================================================
// Part 3: Scroll Reveal Animations
// =========================================================
function reveal() {
    const reveals = document.querySelectorAll(".reveal");
    const windowHeight = window.innerHeight;
    for (let i = 0; i < reveals.length; i++) {
        const elementTop = reveals[i].getBoundingClientRect().top;
        if (elementTop < windowHeight - 80) {
            reveals[i].classList.add("active");
        }
    }
}
window.addEventListener("scroll", reveal);
reveal();

// =========================================================
// Part 4: ScrollSpy Navigation
// =========================================================
const sections = document.querySelectorAll("header, main, footer");
const navLinks = document.querySelectorAll(".nav-link");

window.addEventListener("scroll", () => {
    let current = "";
    sections.forEach((section) => {
        const sectionTop = section.offsetTop;
        if (window.pageYOffset >= sectionTop - 200) {
            current = section.getAttribute("id");
        }
    });

    navLinks.forEach((link) => {
        link.classList.remove("active-link");
        if (current && link.getAttribute("href").includes(current)) {
            link.classList.add("active-link");
        }
    });
});

document.querySelectorAll('.nav-link').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
        e.preventDefault();
        const targetId = this.getAttribute('href');
        document.querySelector(targetId).scrollIntoView({ behavior: 'smooth' });
    });
});

// =========================================================
// Part 5: Project Modal with 2-Photo Gallery Support
// =========================================================
const modal = document.getElementById('project-modal');
const modalImg = document.getElementById('modal-img');
const modalThumbnails = document.getElementById('modal-thumbnails');
const modalTitle = document.getElementById('modal-title');
const modalDesc = document.getElementById('modal-desc');
const closeBtn = document.querySelector('.close-btn');

document.querySelectorAll('.project').forEach(project => {
    project.addEventListener('click', function(e) {
        if (e.target.classList.contains('project-btn')) return;

        const mainImg = this.querySelector('img').src;
        const title = this.querySelector('h3').innerText;
        const desc = this.querySelector('p').innerHTML;
        const galleryAttr = this.getAttribute('data-gallery');

        modalImg.src = mainImg;
        modalTitle.innerText = title;
        modalDesc.innerHTML = desc;
        modalThumbnails.innerHTML = '';

        if (galleryAttr) {
            const items = galleryAttr.split(',').map(s => s.trim());
            items.forEach((itemStr, idx) => {
                const [primaryPath, fallbackPath] = itemStr.split('|');
                const thumb = document.createElement('img');
                thumb.src = primaryPath;
                attachFallback(thumb, fallbackPath);
                thumb.className = 'modal-thumb' + (idx === 0 ? ' active-thumb' : '');
                thumb.addEventListener('click', (ev) => {
                    ev.stopPropagation();
                    modalImg.src = thumb.src;
                    document.querySelectorAll('.modal-thumb').forEach(t => t.classList.remove('active-thumb'));
                    thumb.classList.add('active-thumb');
                });
                modalThumbnails.appendChild(thumb);
            });
        }

        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    });
});

function closeModal() {
    modal.classList.remove('active');
    document.body.style.overflow = 'auto';
}

closeBtn.addEventListener('click', closeModal);
window.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
});
window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('active')) closeModal();
});

// =========================================================
// Part 6: Working Contact Form Handler (FormSubmit + Fallback)
// =========================================================
const contactForm = document.getElementById('contact-form');
const formStatus = document.getElementById('form-status');
const submitBtn = document.getElementById('submit-btn');

if (contactForm) {
    contactForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        submitBtn.disabled = true;
        submitBtn.innerText = 'SENDING...';
        formStatus.style.color = '#9da3ae';
        formStatus.innerText = 'Transmitting message...';

        const formData = new FormData(contactForm);

        try {
            const response = await fetch(contactForm.action, {
                method: 'POST',
                body: formData,
                headers: { 'Accept': 'application/json' }
            });

            if (response.ok) {
                formStatus.style.color = '#eceae4';
                formStatus.innerText = '✓ Message sent successfully. Thank you for reaching out!';
                contactForm.reset();
            } else {
                throw new Error('Form service requires activation or mailto fallback.');
            }
        } catch (err) {
            // Instant mailto fallback so the message never fails during a live demo
            const name = formData.get('name');
            const email = formData.get('email');
            const message = formData.get('message');
            const subject = encodeURIComponent(`Portfolio Inquiry from ${name}`);
            const body = encodeURIComponent(`Name: ${name}\nEmail: ${email}\n\nMessage:\n${message}`);
            window.location.href = `mailto:oliwer.gent@gmail.com?subject=${subject}&body=${body}`;

            formStatus.style.color = '#eceae4';
            formStatus.innerText = '✓ Opening your email client to send directly.';
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerText = 'SEND MESSAGE ↗';
        }
    });
}