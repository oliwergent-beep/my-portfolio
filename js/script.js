// ==========================================
// Part 1: Cyberpunk / Rave Wave Animation
// ==========================================
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

// Track scroll and mouse for interactive distortion
let scrollY = window.scrollY;
let targetScrollY = window.scrollY;
let mouseX = width / 2;
let mouseY = height / 2;
let targetMouseX = width / 2;
let targetMouseY = height / 2;

window.addEventListener('scroll', () => { targetScrollY = window.scrollY; });
window.addEventListener('mousemove', (e) => {
    targetMouseX = e.clientX;
    targetMouseY = e.clientY;
});

const lines = 45; // Density of the grid
const pointsPerLine = 70; // Smoothness of the wave

function animateWaves() {
    // Smooth interpolation
    scrollY += (targetScrollY - scrollY) * 0.1;
    mouseX += (targetMouseX - mouseX) * 0.1;
    mouseY += (targetMouseY - mouseY) * 0.1;
    let time = performance.now() * 0.0001; // Tiny base drift so it feels alive

    // Deep dark background with slight trail fade
    ctx.fillStyle = 'rgba(5, 5, 8, 0.4)';
    ctx.fillRect(0, 0, width, height);

    const spacingY = height / lines;
    const spacingX = width / pointsPerLine;

    for (let i = 0; i < lines + 5; i++) {
        ctx.beginPath();
        let yBase = i * spacingY - 50;

        for (let j = 0; j <= pointsPerLine; j++) {
            let x = j * spacingX;

            // Math: Wave moves primarily when SCROLLING (scrollY * 0.004)
            let wave1 = Math.sin((x * 0.003) + (scrollY * 0.004) + time + i * 0.1) * 35;
            let wave2 = Math.cos((x * 0.005) - (scrollY * 0.002) - time * 0.5 + i * 0.05) * 20;
            
            // Interaction: Mouse warps and repels the grid
            let dist = Math.hypot(x - mouseX, yBase - mouseY);
            let mouseWarp = 0;
            const influenceRadius = 300;
            if (dist < influenceRadius) {
                let normalized = dist / influenceRadius;
                mouseWarp = Math.cos(normalized * Math.PI) * 50 * (1 - normalized);
            }

            let y = yBase + wave1 + wave2 - mouseWarp;

            if (j === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }

        // Acid/Tech Color shift: sweeps between Cyan and Magenta based on scroll depth
        let hue = 220 + Math.sin(scrollY * 0.001 + i * 0.05 + time) * 80;
        ctx.strokeStyle = `hsla(${hue}, 100%, 55%, ${0.3 + (i/lines)*0.7})`;
        ctx.lineWidth = 2;
        ctx.stroke();
    }
    requestAnimationFrame(animateWaves);
}
animateWaves();

// ==========================================
// Part 2: Scroll Reveal Animations
// ==========================================
function reveal() {
    const reveals = document.querySelectorAll(".reveal");
    for (let i = 0; i < reveals.length; i++) {
        const windowHeight = window.innerHeight;
        const elementTop = reveals[i].getBoundingClientRect().top;
        const elementVisible = 100; 

        if (elementTop < windowHeight - elementVisible) {
            reveals[i].classList.add("active");
        }
    }
}
window.addEventListener("scroll", reveal);
reveal(); 

// ==========================================
// Part 3: ScrollSpy (Dynamic Nav Highlighting)
// ==========================================
const sections = document.querySelectorAll("header, main, footer");
const navLinks = document.querySelectorAll(".nav-link");

window.addEventListener("scroll", () => {
    let current = "";
    sections.forEach((section) => {
        const sectionTop = section.offsetTop;
        const sectionHeight = section.clientHeight;
        if (pageYOffset >= sectionTop - 150) {
            current = section.getAttribute("id");
        }
    });

    navLinks.forEach((link) => {
        link.classList.remove("active-link");
        if (link.getAttribute("href").includes(current)) {
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

// ==========================================
// Part 4: Project Modal Interaction
// ==========================================
const modal = document.getElementById('project-modal');
const modalImg = document.getElementById('modal-img');
const modalTitle = document.getElementById('modal-title');
const modalDesc = document.getElementById('modal-desc');
const closeBtn = document.querySelector('.close-btn');

document.querySelectorAll('.project').forEach(project => {
    project.addEventListener('click', function(e) {
        if(e.target.classList.contains('project-btn')) return;

        const imgSrc = this.querySelector('img').src;
        const title = this.querySelector('h3').innerText;
        const desc = this.querySelector('p').innerHTML;

        modalImg.src = imgSrc;
        modalTitle.innerText = title;
        modalDesc.innerHTML = desc;

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