// ==========================================
// Part 1: Particle Network Animation
// ==========================================
const canvas = document.getElementById('particle-canvas');
const ctx = canvas.getContext('2d');

function setCanvasSize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
setCanvasSize();

let particles = [];
const PARTICLE_COUNT = 90;
const CONNECTION_DISTANCE = 120;
const PARTICLE_COLOR = 'rgba(88, 166, 255, 0.8)';

window.addEventListener('resize', () => { 
    setCanvasSize(); 
});

class Particle {
    constructor() {
        this.x = Math.random() * canvas.width;
        this.y = Math.random() * canvas.height;
        this.size = Math.random() * 2 + 1;
        this.speedX = Math.random() * 1 - 0.5;
        this.speedY = Math.random() * 1 - 0.5;
    }
    update() {
        this.x += this.speedX;
        this.y += this.speedY;
        
        if (this.x < 0 || this.x > canvas.width) this.speedX *= -1;
        if (this.y < 0 || this.y > canvas.height) this.speedY *= -1;
    }
    draw() {
        ctx.fillStyle = PARTICLE_COLOR;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
    }
}

for (let i = 0; i < PARTICLE_COUNT; i++) {
    particles.push(new Particle());
}

function animateParticles() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    for (let i = 0; i < particles.length; i++) {
        particles[i].update();
        particles[i].draw();
        
        for (let j = i; j < particles.length; j++) {
            const dx = particles[i].x - particles[j].x;
            const dy = particles[i].y - particles[j].y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance < CONNECTION_DISTANCE) {
                ctx.beginPath();
                ctx.strokeStyle = `rgba(88, 166, 255, ${1 - distance / CONNECTION_DISTANCE})`;
                ctx.lineWidth = 0.5;
                ctx.moveTo(particles[i].x, particles[i].y);
                ctx.lineTo(particles[j].x, particles[j].y);
                ctx.stroke();
            }
        }
    }
    requestAnimationFrame(animateParticles);
}
animateParticles();

// ==========================================
// Part 2: Scroll Reveal Animations
// ==========================================
function reveal() {
    const reveals = document.querySelectorAll(".reveal");
    for (let i = 0; i < reveals.length; i++) {
        const windowHeight = window.innerHeight;
        const elementTop = reveals[i].getBoundingClientRect().top;
        const elementVisible = 100; // Shows when element is 100px from the bottom

        if (elementTop < windowHeight - elementVisible) {
            reveals[i].classList.add("active");
        }
    }
}
window.addEventListener("scroll", reveal);
reveal(); // Trigger once on load

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

// Smooth Scroll for Nav Links
document.querySelectorAll('.nav-link').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
        e.preventDefault();
        const targetId = this.getAttribute('href');
        document.querySelector(targetId).scrollIntoView({ 
            behavior: 'smooth' 
        });
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
        // Prevent modal from opening if the user clicks the Itch.io button directly
        if(e.target.classList.contains('project-btn')) return;

        // Get content from the clicked card
        const imgSrc = this.querySelector('img').src;
        const title = this.querySelector('h3').innerText;
        const desc = this.querySelector('p').innerHTML;

        // Put content into modal
        modalImg.src = imgSrc;
        modalTitle.innerText = title;
        modalDesc.innerHTML = desc;

        // Show modal and stop background from scrolling
        modal.classList.add('active');
        document.body.style.overflow = 'hidden'; 
    });
});

function closeModal() {
    modal.classList.remove('active');
    document.body.style.overflow = 'auto'; // Re-enable scrolling
}

closeBtn.addEventListener('click', closeModal);

// Close if clicking outside the modal content (on the dark background)
window.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
});

// Close on 'Escape' key press
window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('active')) closeModal();
});