// Global JavaScript Controller for SMPS Tech Lab

document.addEventListener('DOMContentLoaded', () => {
    // 1. THEME MANAGER
    const htmlElement = document.documentElement;
    const themeToggleNav = document.getElementById('themeToggleNav');

    function getThemeIconSvg(theme) {
        if (theme === 'light') {
            // Moon icon for switching back to Dark Mode
            return `<svg viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>`;
        } else {
            // Sun icon for switching back to Light Mode
            return `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`;
        }
    }

    function updateThemeUI(theme) {
        htmlElement.setAttribute('data-theme', theme);
        if (themeToggleNav) {
            themeToggleNav.innerHTML = getThemeIconSvg(theme);
        }
    }

    // Initialize theme from storage or system preferences
    const savedTheme = localStorage.getItem('theme') || 'dark';
    updateThemeUI(savedTheme);

    // Toggle button event listener
    if (themeToggleNav) {
        themeToggleNav.addEventListener('click', () => {
            const currentTheme = htmlElement.getAttribute('data-theme');
            const newTheme = currentTheme === 'light' ? 'dark' : 'light';
            localStorage.setItem('theme', newTheme);
            updateThemeUI(newTheme);
        });
    }

    // 2. LOADER HIDE
    const loader = document.getElementById('loader');
    if (loader) {
        window.addEventListener('load', () => {
            setTimeout(() => {
                loader.classList.add('hidden');
            }, 1000);
        });
        // Fallback safety if window load takes too long
        setTimeout(() => {
            loader.classList.add('hidden');
        }, 3000);
    }

    // 3. NAVBAR SCROLL
    const navbar = document.getElementById('navbar');
    if (navbar) {
        window.addEventListener('scroll', () => {
            navbar.classList.toggle('scrolled', window.scrollY > 50);
        });
        // Initial state check
        navbar.classList.toggle('scrolled', window.scrollY > 50);
    }

    // 4. SCROLL REVEAL OBSERVER
    const revealEls = document.querySelectorAll('.reveal');
    if (revealEls.length > 0) {
        const revealObserver = new IntersectionObserver((entries) => {
            entries.forEach(e => {
                if (e.isIntersecting) {
                    e.target.classList.add('visible');
                }
            });
        }, { threshold: 0.12 });
        revealEls.forEach(el => revealObserver.observe(el));
    }

    // 5. COUNTER COUNT-UP ANIMATION
    const counterEls = document.querySelectorAll('[data-target]');
    if (counterEls.length > 0) {
        function animateCounter(el, target) {
            let start = 0;
            const duration = 2000;
            const stepTime = Math.max(Math.floor(duration / target), 15);
            const increment = Math.ceil(target / (duration / stepTime));
            
            const timer = setInterval(() => {
                start += increment;
                if (start >= target) {
                    start = target;
                    clearInterval(timer);
                }
                el.textContent = start + (target >= 100 ? '+' : '');
            }, stepTime);
        }

        const counterObserver = new IntersectionObserver((entries) => {
            entries.forEach(e => {
                if (e.isIntersecting) {
                    const target = parseInt(e.target.dataset.target, 10);
                    animateCounter(e.target, target);
                    counterObserver.unobserve(e.target);
                }
            });
        }, { threshold: 0.3 });
        counterEls.forEach(el => counterObserver.observe(el));
    }

    // 6. MOBILE MENU DYNAMIC BINDINGS
    const hamburger = document.querySelector('.hamburger');
    const mobileMenu = document.getElementById('mob');
    if (hamburger && mobileMenu) {
        hamburger.addEventListener('click', (e) => {
            e.stopPropagation();
            mobileMenu.classList.toggle('open');
            hamburger.classList.toggle('active');
        });

        // Close menu when clicking outside
        document.addEventListener('click', (e) => {
            if (!mobileMenu.contains(e.target) && !hamburger.contains(e.target)) {
                mobileMenu.classList.remove('open');
                hamburger.classList.remove('active');
            }
        });

        // Close menu when clicking on a link
        mobileMenu.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                mobileMenu.classList.remove('open');
                hamburger.classList.remove('active');
            });
        });
    }

    // Initialize Lucide icons if available
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
});

// MOBILE MENU TOGGLE FALLBACK
function toggleMenu() {
    const hamburger = document.querySelector('.hamburger');
    if (hamburger) {
        hamburger.click();
    }
}

// 7. TOAST NOTIFICATION HELPERS
function showToast(msg) {
    let toast = document.getElementById('toast');
    if (!toast) {
        // Create toast dynamically if not present in the HTML template
        toast = document.createElement('div');
        toast.id = 'toast';
        toast.className = 'toast';
        document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// 8. NEWSLETTER SUBSCRIBE ACTION
async function subscribeNewsletter() {
    const emailInput = document.getElementById('nlEmail');
    if (!emailInput) return;
    const email = emailInput.value.trim();
    if (!email || !email.includes('@')) {
        showToast('Please enter a valid email.');
        return;
    }
    const subs = await DataStore.getList('subscribers', []);
    if (!subs.includes(email)) {
        subs.push(email);
        await DataStore.saveList('subscribers', subs);
    }
    emailInput.value = '';
    showToast('Subscribed successfully!');
}

async function initializeAwardsPopup() {
    const overlay = document.getElementById('awardsPopupOverlay');
    const modal = document.getElementById('awardsPopupModal');
    const closeButton = document.getElementById('awardsPopupClose');
    const grid = document.getElementById('awardsLogoGrid');
    if (!overlay || !modal || !closeButton || !grid) return;

    const manifestUrl = new URL('assets/awards/awards.json', window.location.href).href;

    const fallbackNames = ['aw 1.png', 'aw 2.png', 'aw 3.png'];

    const loadNames = async () => {
        try {
            const response = await fetch(manifestUrl, { cache: 'no-cache' });
            if (!response.ok) throw new Error('Manifest not available');
            const entries = await response.json();
            return Array.isArray(entries) ? entries : [];
        } catch (error) {
            return fallbackNames;
        }
    };

    let logoNames = (await loadNames()).filter(Boolean).map(n => String(n).trim());
    // Only show the single AW image the user requested (aw 3.png). If missing, fallback to aw 3.
    logoNames = logoNames.filter(n => n.toLowerCase() === 'aw 3.png');
    if (logoNames.length === 0) {
        logoNames = ['aw 3.png'];
    }

    const imageBasePath = 'assets/logos/aw/';
    const imageFallbackPath = 'assets/LOGOS/aw/';
    const imageSourceMap = {
        'aw 1.png': 'assets/logos/aw/aw 1.png',
        'aw 2.png': 'assets/logos/aw/aw 2.png',
        'aw 3.png': 'assets/popup/aw 3.png'
    };

    const createImageUrl = (source) => {
        return new URL(source, window.location.href).href;
    };

    const createLogoCard = (name) => {
        const card = document.createElement('div');
        card.className = 'awards-logo-card';

        const img = document.createElement('img');
        img.loading = 'lazy';
        img.alt = 'Award logo';
        img.dataset.triedFallback = 'false';
        img.src = createImageUrl(imageSourceMap[name] || `${imageBasePath}${name}`);

        img.onerror = () => {
            if (img.dataset.triedFallback === 'false') {
                img.dataset.triedFallback = 'true';
                img.src = createImageUrl(imageFallbackPath, name);
            } else {
                card.style.display = 'none';
            }
        };

        card.appendChild(img);
        return card;
    };

    grid.innerHTML = '';

    // ── Populate the premium logo pills strip (aw 1 & aw 2) ──
    const logoStrip = document.getElementById('awardsLogoStrip');
    if (logoStrip) {
        logoStrip.innerHTML = '';
        ['aw 1.png', 'aw 2.png'].forEach((n, i) => {
            const pill = document.createElement('div');
            pill.className = 'awards-popup-logo-pill';
            pill.style.animationDelay = `${0.3 + i * 0.1}s`;

            const img = document.createElement('img');
            img.alt = `Partner logo ${i + 1}`;
            img.loading = 'lazy';
            img.src = createImageUrl(imageSourceMap[n] || (imageBasePath + n));
            img.onerror = () => { pill.style.display = 'none'; };

            pill.appendChild(img);
            logoStrip.appendChild(pill);
        });
    }

    logoNames.forEach(name => {
        grid.appendChild(createLogoCard(name));
    });

    const body = document.body;
    const focusableSelector = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    let focusableElements = [];

    const updateFocusableElements = () => {
        focusableElements = Array.from(modal.querySelectorAll(focusableSelector));
    };

    const openPopup = () => {
        body.classList.add('awards-popup-open');
        overlay.classList.add('open');
        modal.classList.add('open');
        updateFocusableElements();
        closeButton.focus();
        window.addEventListener('keydown', onKeyDown);
    };

    const closePopup = () => {
        // Smooth close: scale card down first, then remove classes
        const card = modal.querySelector('.awards-popup-card');
        if (card) {
            card.style.transition = 'transform 0.4s cubic-bezier(0.4, 0, 1, 1), opacity 0.35s ease';
            card.style.transform = 'translateY(24px) scale(0.94)';
            card.style.opacity = '0';
        }
        overlay.style.transition = 'opacity 0.4s ease';
        overlay.style.opacity = '0';
        setTimeout(() => {
            body.classList.remove('awards-popup-open');
            overlay.classList.remove('open');
            modal.classList.remove('open');
            // Reset card styles for next open
            if (card) {
                card.style.transition = '';
                card.style.transform = '';
                card.style.opacity = '';
            }
            overlay.style.transition = '';
            overlay.style.opacity = '';
        }, 400);
        window.removeEventListener('keydown', onKeyDown);
    };

    const onKeyDown = (event) => {
        if (event.key === 'Escape') {
            closePopup();
            return;
        }

        if (event.key !== 'Tab' || focusableElements.length === 0) return;

        const firstFocusable = focusableElements[0];
        const lastFocusable = focusableElements[focusableElements.length - 1];

        if (event.shiftKey && document.activeElement === firstFocusable) {
            event.preventDefault();
            lastFocusable.focus();
        } else if (!event.shiftKey && document.activeElement === lastFocusable) {
            event.preventDefault();
            firstFocusable.focus();
        }
    };

    closeButton.addEventListener('click', closePopup);
    overlay.addEventListener('click', (event) => {
        if (event.target === overlay) {
            closePopup();
        }
    });

    const handleResize = () => {
        if (window.matchMedia('(max-width: 720px)').matches && logoNames.length > 8) {
            modal.classList.add('carousel-active');
        } else {
            modal.classList.remove('carousel-active');
        }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    setTimeout(openPopup, 600);
}

initializeAwardsPopup();
