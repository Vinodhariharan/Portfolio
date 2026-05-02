// Tailwind dark mode config
const tailwindScript = document.createElement('script');
tailwindScript.textContent = `tailwind.config = { darkMode: 'class' };`;
document.head.appendChild(tailwindScript);

// ── Mobile Menu ──
const menuToggle = document.getElementById('menuToggle');
const mobileMenu = document.getElementById('mobileMenu');

if (menuToggle && mobileMenu) {
    menuToggle.addEventListener('click', () => {
        mobileMenu.classList.toggle('hidden');
    });
    document.querySelectorAll('#mobileMenu a').forEach(link => {
        link.addEventListener('click', () => mobileMenu.classList.add('hidden'));
    });
}

// ── Back to Top ──
const backToTop = document.getElementById('backToTop');
if (backToTop) {
    window.addEventListener('scroll', () => {
        backToTop.classList.toggle('hidden', window.scrollY <= 300);
    });
    backToTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
}

// ── Scroll Animations ──
const animateElements = elements => {
    elements.forEach(el => {
        if (el.getBoundingClientRect().top < window.innerHeight - 150) {
            el.classList.add('visible');
            el.querySelectorAll('.progress-fill').forEach(bar => {
                const w = bar.getAttribute('data-width');
                bar.style.transform = `scaleX(${w / 100})`;
            });
        }
    });
};

// ── DOMContentLoaded ──
document.addEventListener('DOMContentLoaded', () => {
    lucide.createIcons();

    const scrollEls = document.querySelectorAll('.animate-on-scroll, .animate-from-left, .animate-from-right');
    animateElements(scrollEls);

    // Dark mode toggle
    const toggleDark = () => {
        const isDark = document.documentElement.classList.toggle('dark');
        localStorage.setItem('darkMode', isDark ? 'enabled' : 'disabled');
    };

    const dmToggle = document.getElementById('darkModeToggle');
    const dmToggleMobile = document.getElementById('darkModeToggleMobile');
    if (dmToggle) dmToggle.addEventListener('click', toggleDark);
    if (dmToggleMobile) dmToggleMobile.addEventListener('click', toggleDark);

    // Apply saved preference or system preference
    const saved = localStorage.getItem('darkMode');
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (saved === 'enabled' || (saved === null && prefersDark)) {
        document.documentElement.classList.add('dark');
    } else {
        document.documentElement.classList.remove('dark');
    }
});

// ── Scroll handler ──
window.addEventListener('scroll', () => {
    const unvisited = document.querySelectorAll('.animate-on-scroll:not(.visible), .animate-from-left:not(.visible), .animate-from-right:not(.visible)');
    animateElements(unvisited);
});
