// Mobile Menu Toggle
// Add this script to the head section, before any other scripts
// This should go right after the line

// 1. First, add the Tailwind dark mode configuration
const tailwindScript = document.createElement('script');
tailwindScript.textContent = `
  tailwind.config = {
    darkMode: 'class',
    theme: {
      extend: {
        backgroundColor: {
          'dark-bg': '#121212',
          'dark-card': '#1e1e1e'
        }
      }
    }
  }
`;
document.head.appendChild(tailwindScript);

const menuToggle = document.getElementById('menuToggle');
const mobileMenu = document.getElementById('mobileMenu');

menuToggle.addEventListener('click', () => {
    mobileMenu.classList.toggle('hidden');
});

// Close mobile menu when clicking on a link
document.querySelectorAll('#mobileMenu a').forEach(link => {
    link.addEventListener('click', () => {
        mobileMenu.classList.add('hidden');
    });
});

// Back to Top Button
const backToTopButton = document.getElementById('backToTop');

window.addEventListener('scroll', () => {
    if (window.scrollY > 300) {
        backToTopButton.classList.remove('hidden');
    } else {
        backToTopButton.classList.add('hidden');
    }
});

backToTopButton.addEventListener('click', () => {
    window.scrollTo({
        top: 0,
        behavior: 'smooth'
    });
});

// Animate elements when they come into view
const animateElements = elements => {
    elements.forEach(element => {
        const elementTop = element.getBoundingClientRect().top;
        const elementVisible = 150;

        if (elementTop < window.innerHeight - elementVisible) {
            element.classList.add('visible');

            // Animate progress bars if they are in view
            const progressBars = element.querySelectorAll('.progress-fill');
            progressBars.forEach(bar => {
                const width = bar.getAttribute('data-width');
                bar.style.transform = `scaleX(${width / 100})`;
            });
        }
    });
};

// Run on load
document.addEventListener('DOMContentLoaded', () => {
    const scrollElements = document.querySelectorAll('.animate-on-scroll, .animate-from-left, .animate-from-right');
    animateElements(scrollElements);

    // Form submission event
    const contactForm = document.getElementById('contactForm');
    if (contactForm) {
        contactForm.addEventListener('submit', (e) => {
            e.preventDefault();
            // In a real implementation, you would send the form data to a server
            alert('Thank you for your message! I will get back to you soon.');
            contactForm.reset();
        });
    }

    // Custom cursor effect
    const customCursor = document.querySelector('.custom-cursor');
    const cursorDot = document.querySelector('.cursor-dot');

    if (window.innerWidth > 768) { // Only on desktop
        document.addEventListener('mousemove', (e) => {
            customCursor.style.display = 'block';
            cursorDot.style.display = 'block';

            customCursor.style.left = `${e.clientX}px`;
            customCursor.style.top = `${e.clientY}px`;

            cursorDot.style.left = `${e.clientX}px`;
            cursorDot.style.top = `${e.clientY}px`;
        });

        // Cursor effects on links and buttons
        const interactiveElements = document.querySelectorAll('a, button, input, textarea');
        interactiveElements.forEach(element => {
            element.addEventListener('mouseenter', () => {
                customCursor.style.width = '40px';
                customCursor.style.height = '40px';
                customCursor.style.borderColor = '#000';
            });

            element.addEventListener('mouseleave', () => {
                customCursor.style.width = '20px';
                customCursor.style.height = '20px';
                customCursor.style.borderColor = '#000';
            });
        });
    }
});

// Run on scroll
window.addEventListener('scroll', () => {
    const scrollElements = document.querySelectorAll('.animate-on-scroll:not(.visible), .animate-from-left:not(.visible), .animate-from-right:not(.visible)');
    animateElements(scrollElements);
});
// 2. Replace the existing dark mode toggle script with this updated one
document.addEventListener('DOMContentLoaded', function () {
    const darkModeToggle = document.getElementById('darkModeToggle');
    const darkModeToggleMobile = document.getElementById('darkModeToggleMobile');

    // Function to toggle dark mode
    function toggleDarkMode() {
        document.documentElement.classList.toggle('dark');

        // Update UI elements that need specific dark mode changes
        if (document.documentElement.classList.contains('dark')) {
            localStorage.setItem('darkMode', 'enabled');
            document.body.classList.add('bg-gray-900', 'text-white');
            document.body.classList.remove('bg-white', 'text-gray-900');
        } else {
            localStorage.setItem('darkMode', 'disabled');
            document.body.classList.add('bg-white', 'text-gray-900');
            document.body.classList.remove('bg-gray-900', 'text-white');
        }
    }

    // Add event listeners to both toggle buttons
    if (darkModeToggle) darkModeToggle.addEventListener('click', toggleDarkMode);
    if (darkModeToggleMobile) darkModeToggleMobile.addEventListener('click', toggleDarkMode);

    // Check for saved dark mode preference
    if (localStorage.getItem('darkMode') === 'enabled') {
        document.documentElement.classList.add('dark');
        document.body.classList.add('bg-gray-900', 'text-white');
        document.body.classList.remove('bg-white', 'text-gray-900');
    }

    // Also apply initial dark mode class if needed
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches &&
        localStorage.getItem('darkMode') !== 'disabled') {
        document.documentElement.classList.add('dark');
        document.body.classList.add('bg-gray-900', 'text-white');
        document.body.classList.remove('bg-white', 'text-gray-900');
    }
});