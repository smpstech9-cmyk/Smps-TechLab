/**
 * SMPS Tech Lab — Admin Panel
 * Production-ready JavaScript
 * Architecture: Module-pattern with event delegation
 */

'use strict';

// Clean up any stale sandbox cached lists from localStorage to prevent dummy data leakages
['eventsData', 'events', 'execomMembers', 'advisors', 'galleryData', 'gallery'].forEach(key => {
  localStorage.removeItem('smps_sandbox_' + key);
  localStorage.removeItem(key);
});

/* ════════════════════════════════════════
   UTILITIES
   ════════════════════════════════════════ */

const Utils = {
  /** Safe localStorage get with JSON parse */
  lsGet(key, fallback = null) {
    try {
      const v = localStorage.getItem('smps_sandbox_' + key);
      return v ? JSON.parse(v) : fallback;
    } catch (e) {
      return fallback;
    }
  },

  /** Safe localStorage set with JSON stringify */
  lsSet(key, value) {
    try {
      localStorage.setItem('smps_sandbox_' + key, JSON.stringify(value));
      return true;
    } catch (e) {
      return false;
    }
  },

  /** Sanitize HTML to prevent XSS when rendering user content as text */
  sanitize(str) {
    if (typeof str !== 'string') return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  },

  /** Get element by ID safely */
  el(id) { return document.getElementById(id); },

  /** Get value of an input/textarea/select */
  getVal(id) {
    const el = document.getElementById(id);
    return el ? el.value.trim() : '';
  },

  /** Set value of an input/textarea/select */
  setVal(id, value) {
    const el = document.getElementById(id);
    if (el) el.value = value ?? '';
  },

  /** Format ISO date to readable string */
  fmtDate(iso) {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    } catch {
      return iso;
    }
  },

  /** Generate a unique ID */
  uid(prefix = 'id') {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  },

  /** Debounce a function */
  debounce(fn, delay = 250) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  }
};

/* ════════════════════════════════════════
   FIRESTORE DATASTORE
   ════════════════════════════════════════ */

const DataStore = (() => {
  // Capture the Firebase DataStore from firebase-init.js BEFORE this module
  // overwrites any global reference. _FS is a frozen snapshot taken at parse time.
  const _FS = window.DataStore || null;

  // ── localStorage helpers (always available, no Firebase needed) ────────────
  function _lsKey(key) { return 'smps_sandbox_' + key; }

  function _lsGet(key, fallback = null) {
    try {
      const v = localStorage.getItem(_lsKey(key));
      if (v === null) return fallback;
      return JSON.parse(v);
    } catch (e) { return fallback; }
  }

  function _lsSet(key, value) {
    try {
      localStorage.setItem(_lsKey(key), JSON.stringify(value));
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) { /* quota exceeded – silently ignore */ }
  }

  // ── Document operations ────────────────────────────────────────────────────

  async function getDoc(key, fallback = null) {
    // 1. Try Firebase first
    if (_FS && typeof _FS.getDocument === 'function') {
      try {
        const doc = await _FS.getDocument(key, null);
        if (doc !== null) { _lsSet(key, doc); return doc; }
      } catch (e) {
        console.warn('[DataStore] getDoc cloud failed, using localStorage:', e);
      }
    }
    // 2. Fall back to localStorage
    const cached = _lsGet(key, null);
    return cached !== null ? cached : fallback;
  }

  async function saveDoc(key, value) {
    // Always save to localStorage immediately (offline-first)
    _lsSet(key, value);
    // Then try Firebase asynchronously (don't block UI on failure)
    if (_FS && typeof _FS.saveDocument === 'function') {
      try { await _FS.saveDocument(key, value); } catch (e) {
        console.warn('[DataStore] saveDoc cloud failed, kept in localStorage:', e);
      }
    }
  }

  async function getList(key, fallback = []) {
    if (_FS && typeof _FS.getList === 'function') {
      try {
        const list = await _FS.getList(key, null);
        if (Array.isArray(list)) { _lsSet(key, list); return list; }
      } catch (e) {
        console.warn('[DataStore] getList cloud failed, using localStorage:', e);
      }
    }
    const cached = _lsGet(key, null);
    return Array.isArray(cached) ? cached : fallback;
  }

  async function saveList(key, items) {
    if (!Array.isArray(items)) return;
    // Save to localStorage immediately
    _lsSet(key, items);
    // Then sync to Firebase
    if (_FS && typeof _FS.saveList === 'function') {
      try { await _FS.saveList(key, items); } catch (e) {
        console.warn('[DataStore] saveList cloud failed, kept in localStorage:', e);
      }
    }
  }

  async function addToList(key, item) {
    const list = await getList(key, []);
    const updated = [...list, item];
    await saveList(key, updated);
    return updated;
  }

  function subscribe(key, callback, fallback = null) {
    // Immediately serve from localStorage cache
    const cached = _lsGet(key, null);
    if (cached !== null) { try { callback(cached); } catch(e) {} }
    else if (fallback !== null) { try { callback(fallback); } catch(e) {} }
    // Wire up Firebase realtime listener if available
    if (_FS && typeof _FS.subscribe === 'function') {
      try { return _FS.subscribe(key, callback, fallback); } catch(e) {}
    }
    return () => {};
  }

  return {
    getDoc,    saveDoc,
    getList,   saveList,
    addToList, subscribe,
    // Aliases for code that uses the longer form
    getDocument:  getDoc,
    saveDocument: saveDoc
  };
})();

/* ════════════════════════════════════════
   TOAST
   ════════════════════════════════════════ */

const Toast = (() => {
  let timer = null;

  function show(msg, type = '') {
    const t = Utils.el('toast');
    if (!t) return;
    clearTimeout(timer);
    t.textContent = msg;
    t.className = 'toast show' + (type ? ' ' + type : '');
    timer = setTimeout(() => t.classList.remove('show'), 3500);
  }

  return { show };
})();

/* ════════════════════════════════════════
   CONFIRM DIALOG
   ════════════════════════════════════════ */

const Confirm = (() => {
  let resolveCallback = null;

  function ask(message, title = 'Confirm Action') {
    return new Promise((resolve) => {
      resolveCallback = resolve;
      Utils.setVal('confirmTitle', title);
      const msgEl = Utils.el('confirmMsg');
      if (msgEl) msgEl.textContent = message;
      Modal.open('confirmModal');
    });
  }

  function init() {
    const okBtn = Utils.el('confirmOkBtn');
    if (okBtn) {
      okBtn.addEventListener('click', () => {
        Modal.close('confirmModal');
        if (resolveCallback) resolveCallback(true);
        resolveCallback = null;
      });
    }
  }

  return { ask, init };
})();

/* ════════════════════════════════════════
   MODAL MANAGER
   ════════════════════════════════════════ */

const Modal = (() => {
  function open(id) {
    const overlay = Utils.el(id);
    if (!overlay) return;
    // Reset scroll position BEFORE opening so the modal shows top content
    const modalEl = overlay.querySelector('.modal');
    const bodyEl  = overlay.querySelector('.modal-body');
    if (modalEl) modalEl.scrollTop = 0;
    if (bodyEl)  bodyEl.scrollTop  = 0;
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
    // After animation frame, reset scroll again (browser may reposition on focus)
    // then focus the first visible input
    requestAnimationFrame(() => {
      if (modalEl) modalEl.scrollTop = 0;
      if (bodyEl)  bodyEl.scrollTop  = 0;
      setTimeout(() => {
        if (modalEl) modalEl.scrollTop = 0;
        if (bodyEl)  bodyEl.scrollTop  = 0;
        const first = overlay.querySelector('input:not([type="hidden"]), textarea, select');
        if (first) { first.focus({ preventScroll: true }); }
      }, 100);
    });
  }

  function close(id) {
    const overlay = Utils.el(id);
    if (!overlay) return;
    overlay.classList.remove('open');
    document.body.style.overflow = '';
  }

  function init() {
    // Close on overlay click
    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('modal-overlay')) {
        close(e.target.id);
        if (e.target.id === 'confirmModal' && window._confirmResolve) {
          window._confirmResolve(false);
          window._confirmResolve = null;
        }
      }
      // Close buttons
      const closeBtn = e.target.closest('[data-close]');
      if (closeBtn) {
        close(closeBtn.dataset.close);
      }
    });

    // ESC key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const open = document.querySelector('.modal-overlay.open');
        if (open) close(open.id);
      }
    });
  }

  return { open, close, init };
})();

/* ════════════════════════════════════════
   AUTH MODULE
   ════════════════════════════════════════ */

const Auth = (() => {
  const DEFAULT_PASS = 'smps2026';
  const DEFAULT_USER = 'admin';

  function isLoggedIn() {
    return firebase.auth().currentUser !== null;
  }

  async function login(username, password) {
    const email = username.includes('@') ? username : `${username}@smpstechlab.com`;
    try {
      await firebase.auth().signInWithEmailAndPassword(email, password);
      localStorage.setItem('smps_admin_logged_in', 'true');
      
      // Also login to Flask backend
      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
        });
        if (res.ok) {
          const data = await res.json();
          if (data.token) {
            localStorage.setItem('smps_token', data.token);
            sessionStorage.setItem('smps_api_token', data.token);
          }
        }
      } catch (err) {
        console.warn("Failed to get local JWT token on login:", err);
      }
      
      return true;
    } catch (e) {
      if (e.code === 'auth/user-not-found' && username === DEFAULT_USER && password === DEFAULT_PASS) {
        // Auto-seed admin user if they don't exist yet in Auth
        try {
          await firebase.auth().createUserWithEmailAndPassword(email, password);
          localStorage.setItem('smps_admin_logged_in', 'true');
          
          // Also login to Flask backend
          try {
            const res = await fetch('/api/auth/login', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ username, password })
            });
            if (res.ok) {
              const data = await res.json();
              if (data.token) {
                localStorage.setItem('smps_token', data.token);
                sessionStorage.setItem('smps_api_token', data.token);
              }
            }
          } catch (err) {
            console.warn("Failed to get local JWT token on auto-seed login:", err);
          }
          
          return true;
        } catch (regErr) {
          console.error("Auto-registration of default admin failed:", regErr);
        }
      }
      console.error("Login failed:", e);
      return false;
    }
  }

  async function logout() {
    try {
      await firebase.auth().signOut();
      localStorage.removeItem('smps_admin_logged_in');
      localStorage.removeItem('smps_token');
      sessionStorage.removeItem('smps_api_token');
    } catch (e) {
      console.error("Logout failed:", e);
    }
  }

  async function changePassword(current, newPass) {
    const user = firebase.auth().currentUser;
    if (!user) return { ok: false, msg: 'No authenticated user found.' };
    try {
      const credential = firebase.auth.EmailAuthProvider.credential(user.email, current);
      await user.reauthenticateWithCredential(credential);
      await user.updatePassword(newPass);
      return { ok: true };
    } catch (e) {
      console.error("Password change failed:", e);
      return { ok: false, msg: e.message };
    }
  }

  function init() {
    // Login button
    const loginBtn = Utils.el('loginBtn');
    if (loginBtn) loginBtn.addEventListener('click', handleLogin);

    // Enter key on password field
    const passField = Utils.el('loginPass');
    if (passField) passField.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleLogin();
    });

    // Logout
    const logoutBtn = Utils.el('logoutBtn');
    if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);

    // Change password
    const changePwBtn = Utils.el('changePwBtn');
    if (changePwBtn) changePwBtn.addEventListener('click', handleChangePassword);

    window.DataStore.ready.then(() => {
      firebase.auth().onAuthStateChanged(async (user) => {
        if (user) {
          localStorage.setItem('smps_admin_logged_in', 'true');
          let token = localStorage.getItem('smps_token');
          let tokenValid = false;
          if (token) {
            try {
              const parts = token.split('.');
              if (parts.length === 3) {
                const payload = JSON.parse(atob(parts[1]));
                if (payload.exp && (payload.exp * 1000) > Date.now()) {
                  tokenValid = true;
                  sessionStorage.setItem('smps_api_token', token);
                }
              }
            } catch (e) {}
          }
          if (!tokenValid) {
            try {
              const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: 'admin', password: 'smps2026' })
              });
              if (res.ok) {
                const data = await res.json();
                if (data.token) {
                  localStorage.setItem('smps_token', data.token);
                  sessionStorage.setItem('smps_api_token', data.token);
                }
              }
            } catch (err) {
              console.warn('[Flask Auth] Auto-login failed:', err);
            }
          }
          showApp();
        } else {
          localStorage.removeItem('smps_admin_logged_in');
          Utils.el('adminApp').classList.remove('visible');
          Utils.el('loginScreen').classList.remove('hidden');
        }
      });
    });
  }

  function handleLogin() {
    const u = Utils.getVal('loginUser');
    const p = Utils.el('loginPass')?.value || '';
    const errEl = Utils.el('loginError');

    if (!u || !p) {
      if (errEl) { errEl.textContent = 'Please enter username and password.'; errEl.classList.add('show'); }
      return;
    }

    login(u, p).then(ok => {
      if (ok) {
        if (errEl) errEl.classList.remove('show');
      } else {
        if (errEl) { errEl.textContent = 'Invalid credentials. Please try again.'; errEl.classList.add('show'); }
        const passField = Utils.el('loginPass');
        if (passField) { passField.value = ''; passField.focus(); }
      }
    });
  }

  function handleLogout() {
    logout();
  }

  async function handleChangePassword() {
    const cur = Utils.el('pw-current')?.value || '';
    const nw  = Utils.el('pw-new')?.value || '';
    const cf  = Utils.el('pw-confirm')?.value || '';

    if (nw !== cf) { Toast.show('⚠️ Passwords do not match.', 'error'); return; }

    const result = await changePassword(cur, nw);
    if (result.ok) {
      ['pw-current', 'pw-new', 'pw-confirm'].forEach(id => Utils.setVal(id, ''));
      Toast.show('✅ Password updated successfully!', 'success');
    } else {
      Toast.show('⚠️ ' + result.msg, 'error');
    }
  }

  function showApp() {
    Utils.el('loginScreen').classList.add('hidden');
    Utils.el('adminApp').classList.add('visible');
    App.init();
  }

  return { init, isLoggedIn };
})();

/* ════════════════════════════════════════
   NAVIGATION MODULE
   ════════════════════════════════════════ */

const Nav = (() => {
  const PAGE_META = {
    dashboard:   ['Dashboard',           'Overview & quick stats'],
    home:        ['Home Page',           'Edit homepage content'],
    about:       ['About Page',          'Company story, team & values'],
    products:    ['Products',            'Manage product catalog'],
    execom:      ['Execom',              'Manage committee & advisors'],
    events:      ['Events',              'Manage upcoming events'],
    gallery:     ['Gallery',             'Manage gallery items'],
    ip:          ['IP Portfolio',        'Patents & research assets'],
    collaborate: ['Collaborate Page',    'Partnership content'],
    careers:     ['Careers',             'Job openings & internships'],
    ecosystem:   ['Ecosystem',           'Partners & events'],
    insights:    ['Insights & Blog',     'Posts & articles'],
    messages:    ['Messages',            'Contact form submissions'],
    subscribers: ['Newsletter',          'Email subscribers'],
    settings:    ['Site Settings',       'Global configuration'],
    users:       ['Admin Users',         'Access management'],
  };

  function showPage(id) {
    // Hide all pages
    document.querySelectorAll('.tab-page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));

    // Show target page
    const page = Utils.el(`page-${id}`);
    if (!page) return;
    page.classList.add('active');

    // Activate nav button
    const btn = document.querySelector(`.nav-item[data-page="${id}"]`);
    if (btn) btn.classList.add('active');

    // Update topbar
    const [title, sub] = PAGE_META[id] || [id, ''];
    Utils.el('topbarTitle').textContent = title;
    Utils.el('topbarSub').textContent = sub;

    // Save active page in sessionStorage so reloads stay on the same tab
    sessionStorage.setItem('smps_active_tab', id);

    // Close sidebar on mobile
    if (window.innerWidth <= 900) {
      Utils.el('sidebar').classList.remove('open');
      Utils.el('sidebarOverlay').classList.remove('active');
      document.body.style.overflow = '';
    }

    // Page-specific initializers
    const handlers = {
      dashboard:   () => Dashboard.refresh(),
      messages:    () => Messages.render(),
      subscribers: () => Subscribers.render(),
      products:    () => { Products.render(); ProdSettings.loadFields(); },
      execom:      () => { Execom.render(); ExecomSettings.loadFields(); },
      events:      () => { Events.render(); EventsSettings.loadFields(); },
      gallery:     () => { Gallery.render(); GallerySettings.loadFields(); },
      ip:          () => { IP.render(); Research.render(); Licensing.render(); IPSettings.loadFields(); },
      careers:     () => Jobs.render(),
      insights:    () => Blogs.render(),
      about:       () => About.loadFields(),
      home:        () => Home.loadFields(),
      ecosystem:   () => Ecosystem.loadFields(),
      collaborate: () => Collab.loadFields(),
      proposals:   () => Proposals.render(),
      settings:    () => Settings.loadFields(),
    };

    if (handlers[id]) handlers[id]();
  }

  function init() {
    // Nav item clicks
    const nav = Utils.el('sidebarNav');
    if (nav) {
      nav.addEventListener('click', (e) => {
        const btn = e.target.closest('.nav-item[data-page]');
        if (btn) showPage(btn.dataset.page);
      });
    }

    // Quick links in dashboard
    const qlContainer = Utils.el('quickLinks');
    if (qlContainer) {
      qlContainer.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-page]');
        if (btn) showPage(btn.dataset.page);
      });
    }

    // Hamburger
    const ham = Utils.el('hamburger');
    const sidebar = Utils.el('sidebar');
    const overlay = Utils.el('sidebarOverlay');

    if (ham && sidebar && overlay) {
      ham.addEventListener('click', () => {
        sidebar.classList.toggle('open');
        overlay.classList.toggle('active');
        document.body.style.overflow = sidebar.classList.contains('open') ? 'hidden' : '';
      });

      overlay.addEventListener('click', () => {
        sidebar.classList.remove('open');
        overlay.classList.remove('active');
        document.body.style.overflow = '';
      });
    }

    // Load active page from storage
    const activeTab = sessionStorage.getItem('smps_active_tab') || 'dashboard';
    showPage(activeTab);
  }

  return { init, showPage };
})();

/* ════════════════════════════════════════
   DEFAULT DATA
   ════════════════════════════════════════ */

const Defaults = {
  gallerySettings() {
    return {
      heroTitle: 'Visualizing <span>Innovation</span>',
      heroDesc: 'A visual journey through our cutting-edge research, transformative events, and the people behind the deep-tech revolution.',
      catAll: 'All Moments',
      catSummit: 'Summits',
      catWorkshop: 'Workshops',
      catLab: 'Innovation Lab'
    };
  },

  eventsSettings() {
    return {
      heroTitle: 'Where Career Potential<br><span>Meets Opportunity</span>',
      heroDesc: 'Join our flagship masterclasses, workshops, and placement drives — designed to bridge the gap between your degree and your dream job.',
      catAll: 'All Events',
      catConference: 'Conferences',
      catWorkshop: 'Workshops',
      catNetworking: 'Networking',
      catWebinar: 'Webinars'
    };
  },

  execomSettings() {
    return {
      heroTitle: 'Leadership That <span>Inspires</span>',
      heroDesc: "Meet the visionaries driving SMPS Tech Lab's mission — a diverse team of industry experts, researchers, and strategic leaders committed to building India's innovation ecosystem.",
      execBadge: 'Executive Committee',
      execTitle: 'The Minds Behind <span>The Mission</span>',
      msgBadge: "Chairman's Message",
      msgTitle: 'A Word from <span>Our Leadership</span>',
      msgHead: "Driving India's Deep Tech Revolution",
      msgText: "At SMPS Tech Lab, we believe that the future of technology leadership lies in collaboration. Our executive committee brings together decades of experience across industry, academia, and government to create an ecosystem where innovation thrives. We are committed to nurturing talent, protecting intellectual property, and building partnerships that transform ideas into impact.",
      msgAuthor: '— Suresh Kumar, Founder & CEO',
      advBadge: 'Strategic Advisors',
      advTitle: 'Our <span>Board of Advisors</span>',
      ctaTitle: 'Connect With Our Leadership',
      ctaText: 'Interested in strategic discussions or partnership opportunities at the executive level?',
      ctaBtn: 'Schedule an Executive Meeting →'
    };
  },

  collabSettings() {
    return {
      heroTitle: "Build Partnerships That<br>Bridge the <span>Experience Gap</span>",
      heroDesc: "We believe the greatest breakthroughs happen when academic theory meets industry practice. Join our ecosystem to help the next generation of engineers become job-ready through real-world collaboration.",
      
      ac_smpsTag: "SMPS Perspective",
      ac_smpsTitle: "Perspective of SMPS",
      ac_smpsDesc: "SMPS collaborates with universities to create industry-oriented learning opportunities, strengthen academic partnerships for research and innovation in Deep Tech, and connect students with real-world programs that bridge classroom learning and practical experience.",
      ac_acadTag: "Academia Perspective",
      ac_acadTitle: "Perspective of Academia",
      ac_acadDesc: "Academia can engage with industry through R&D initiatives, consultancy projects, workshops, and collaborative skill development programs that align curriculum and training with real-world technical requirements, expanding student exposure to practical, industry-relevant experiences.",
      ac_studTag: "Student Perspective",
      ac_studTitle: "Perspective of Students",
      ac_studDesc: "Students gain access to industry-ready internships and immersive practical experiences, gaining exposure to AI, ML, IoT, Telecom, Embedded Systems, and Power Electronics while building the confidence and skills needed for Deep Tech career pathways.",
      
      in_smpsTag: "SMPS Perspective",
      in_smpsTitle: "Perspective of SMPS",
      in_smpsDesc: "SMPS works closely with industry partners to promote innovation, provide technical consultancy, and enable collaborative programs that translate academic learning into practical product development, building bridges between research and market-ready skills.",
      in_indTag: "Industry Perspective",
      in_indTitle: "Perspective of Industry",
      in_indDesc: "Industry benefits from access to skilled talent and collaborative research partnerships, engaging through workshops, hackathons, and targeted training initiatives to shape future-ready solutions with academic and technical expertise.",
      in_empTag: "Employment Perspective",
      in_empTitle: "Perspective of Employment",
      in_empDesc: "Employment opportunities are enhanced through industry-aligned training and exposure, strengthening practical skills in emerging technologies and Industry 5.0 domains and creating clearer pathways from learning into meaningful technical careers.",
      
      st_smpsTag: "SMPS Perspective",
      st_smpsTitle: "Perspective of SMPS",
      st_smpsDesc: "SMPS supports startup ecosystems by encouraging innovation and prototype development, fostering collaboration among academia, research teams, and industry experts, and providing a launchpad for Deep Tech ideas to become market-ready solutions.",
      st_startTag: "Startup Perspective",
      st_startTitle: "Perspective of Startup",
      st_startDesc: "Startups can leverage technical expertise and infrastructure to accelerate product development, tap into skilled talent and research support for innovative solutions, and move from concept to practical venture with focused mentorship.",
      st_innTag: "Innovator Perspective",
      st_innTitle: "Perspective of Innovators",
      st_innDesc: "Innovators and aspiring entrepreneurs gain opportunities to transform ideas into practical ventures with mentorship and R&D support, access startup-oriented programs and collaborative resources, and find pathways to scale innovation within Deep Tech domains.",
      
      gv_smpsTag: "SMPS Perspective",
      gv_smpsTitle: "Perspective of SMPS",
      gv_smpsDesc: "SMPS partners with government initiatives to advance technology and skills, support collaborative research programs in emerging sectors, and enable public-private-academic engagement for sustainable impact.",
      gv_govTag: "Government Perspective",
      gv_govTitle: "Perspective of Government",
      gv_govDesc: "Government organizations promote innovation and workforce development through Centers of Excellence, drive industry-academia collaboration with technology-led initiatives, and use partnerships to strengthen national research and skill ecosystems.",
      gv_pubTag: "Public & Student Perspective",
      gv_pubTitle: "Public & Student Perspective",
      gv_pubDesc: "Students and the public benefit from advanced technical training, innovation programs, and research exposure; they also access opportunities that boost employability and entrepreneurship and experience programs that connect education with real-world impact.",
      
      procBadge: "How It Works",
      procTitle: "Our Collaboration <span>Process</span>",
      procSub: "A premium partnership journey built for Academia, Startups, Government Agencies, and Industry.",
      step1Title: "Send Your Interest",
      step1Desc: "Share your collaboration interest, project idea, institution requirement, or partnership objective with the SMPS TECH team.",
      step2Title: "Discussion & Requirement Analysis",
      step2Desc: "Our team connects with you to understand goals, expectations, technical needs, timelines, and collaboration opportunities.",
      step3Title: "Mutual Agreement & NDA",
      step3Desc: "Both parties finalize confidentiality, collaboration terms, responsibilities, and partnership understanding through NDA/Mutual Agreement.",
      step4Title: "Proposal & Action Plan",
      step4Desc: "We prepare a customized collaboration roadmap including scope, deliverables, milestones, execution strategy, and action items.",
      
      storyBadge: "Success Stories",
      storyTitle: "Partnerships That <span>Delivered Results</span>",
      
      formBadge: "Start a Partnership",
      formTitle: "Let's Discuss How We Can Work Together",
      formDesc: "Fill out the proposal form and our partnership team will get back to you within 48 hours to schedule an initial discovery call.",
      formEmail: "smpstechlab@gmail.com",
      formPhone: "9035874229 / 8792779543"
    };
  },

  prodSettings() {
    return {
      heroTitle: 'Master Industry <span>Standard</span><br>Workflows',
      catAll: 'All Tracks',
      catHardware: 'Hardware & Power',
      catAiSoftware: 'AI & Software',
      catIot: 'IoT & Robotics'
    };
  },

  products() {
    return [];
  },

  research() {
    return [];
  },

  licensing() {
    return [];
  },

  ipSettings() {
    return {
      heroTitle: "Innovations Built by <span>Job-Ready Talent</span>",
      heroDesc: "A robust showcase of live projects, research papers, and industrial prototypes developed by our mentored students. Explore the real-world solutions built by the next generation of industry leaders.",
      stat1Num: "100",
      stat1Lbl: "Live Projects",
      stat2Num: "25",
      stat2Lbl: "Industry Partners",
      stat3Num: "50",
      stat3Lbl: "Research Papers",
      stat4Num: "500",
      stat4Lbl: "Students Mentored",
      stat5Num: "90",
      stat5Lbl: "Placement Rate %",
      stat6Num: "12",
      stat6Lbl: "Core Tech Tracks",
      projBadge: 'Student Showcase',
      projTitle: 'Industry-Ready <span>Projects</span>',
      resBadge: 'Research Output',
      resTitle: 'Published <span>Research</span>',
      licBadge: 'Engagement',
      licTitle: 'Collaborative <span>Models</span>',
      ctaTitle: 'Interested in Our IP?',
      ctaDesc: "Let's explore how our technology portfolio can accelerate your innovation roadmap.",
      ctaBtn: 'Schedule a Meeting →'
    };
  },

  patents() {
    return [];
  },

  jobs() {
    return [];
  },

  blogs() {
    return [];
  },

  team() {
    return [];
  },

  coreOps() {
    return [
      { icon: 'microscope', title: 'Deeptech R&D & Manufacturing', desc: 'Research, prototyping, system integration, and manufacturing of next-generation deeptech hardware and software solutions suitable for critical sectors including power, railway, defense, space, nuclear, and oil & gas.' },
      { icon: 'cpu', title: 'Advanced Engineering Systems', desc: 'Providing specialized engineering, design, testing, validation, and consulting across embedded systems, power electronics, industrial automation, IoT, AI, data acquisition, telecom, and quantum technologies.' },
      { icon: 'rocket', title: 'Incubation & Innovation Hubs', desc: 'Establishing and managing innovation-driven platforms, incubation-support systems, proof-of-concept (POC) sandboxes, and applied research environments in physical, digital, and hybrid modes.' },
      { icon: 'lightbulb', title: 'IP Development & Licensing', desc: 'Developing, licensing, and distributing proprietary intellectual property (IP), simulation models, hardware reference designs, software suites, and technical documentation to facilitate tech transfer.' },
      { icon: 'handshake', title: 'Tri-Sector Collaborations', desc: 'Partnering with academia, private industry, and government bodies (incubation programs, sponsored research, and pilot deployments) to bridge the commercialization gap for indigenous technologies.' },
      { icon: 'graduation-cap', title: 'ESDM Technical Skilling', desc: 'Providing high-impact technical education, training, and ESDM (Electronics System Design & Manufacturing) skilling for new-age engineering students, faculties, and researchers.' }
    ];
  },

  values() {
    return [
      { icon: 'microscope', title: 'Deeptech R&D', desc: 'Executing industrial research, prototype development, and advanced system integration suitable for power, railway, defense, space, nuclear, and oil & gas sectors.' },
      { icon: 'handshake', title: 'Academia Collaborations', desc: 'Partnering with academic institutions, accelerators, OEMs, and government bodies on sponsored research projects, pilot deployments, and commercialization of indigenous technologies.' },
      { icon: 'lightbulb', title: 'Technical Entrepreneurship', desc: 'Fostering problem-solving, technology commercialization, and product innovation through ideation programs, innovation labs, and technology-driven engagements.' },
      { icon: 'rocket', title: 'Start-up Ecosystem', desc: 'Operating innovation-driven incubation-support systems, startup creation initiatives, conclaves, demo days, and proof-of-concept environments in physical, digital, and hybrid modes.' },
      { icon: 'cpu', title: 'Deeptech Core Platforms', desc: 'Designing, developing, testing, and validating advanced systems in embedded electronics, power electronics, industrial automation, control networks, IoT, and AI.' },
      { icon: 'atom', title: 'Quantum Technology', desc: 'Driving design research and prototype manufacturing of innovative deeptech hardware and software in quantum engineering, AI systems, and consumer electronics.' },
      { icon: 'wifi', title: '5G + 6G Technology', desc: 'Pioneering the adoption of next-generation networks, high-frequency transceivers, antenna layouts, and low-latency communication architectures.' },
      { icon: 'network', title: 'Telecom Innovation', desc: 'Developing, licensing, and distributing proprietary hardware reference designs, simulation models, technical documentation, and software tools for telecom subassemblies.' },
      { icon: 'graduation-cap', title: 'ESDM Professional Advancement', desc: 'Empowering new-age engineering students, faculties, and researchers with advanced capabilities and competency for manufacturing roles in ESDM sectors.' }
    ];
  },

  achievements() {
    return [
      { num: '100+', label: 'Live Industry Projects', icon: '' },
      { num: '500+', label: 'Job-Ready Students', icon: '' },
      { num: '25+', label: 'Industry Partners', icon: '' },
      { num: '90%', label: 'Placement Success', icon: '' }
    ];
  },

  alliances() {
    return [
      { icon: '🏛️', name: 'SMPS Electric', desc: 'Parent Subsidiary' },
      { icon: '🎓', name: 'VTU', desc: 'Academic Excellence' },
      { icon: '✅', name: 'Approved Vendor', desc: 'Telecom Innovation' },
      { icon: '🌐', name: 'Core Member', desc: '6G Development' },
      { icon: '🔬', name: 'Research Partner', desc: 'Defense Tech' },
    ];
  },

  events() {
    return [];
  },

  gallery() {
    return [];
  },

  execom() {
    return [];
  }
};

/* ════════════════════════════════════════
   TABLE FILTER
   ════════════════════════════════════════ */

function initTableSearch(inputId, tableBodyId) {
  const input = Utils.el(inputId);
  if (!input) return;

  const handler = Utils.debounce((q) => {
    const tbody = Utils.el(tableBodyId);
    if (!tbody) return;
    const lower = q.toLowerCase();
    tbody.querySelectorAll('tr').forEach(tr => {
      tr.style.display = tr.textContent.toLowerCase().includes(lower) ? '' : 'none';
    });
  }, 200);

  input.addEventListener('input', (e) => handler(e.target.value));
}

/* ════════════════════════════════════════
   DASHBOARD MODULE
   ════════════════════════════════════════ */

const Dashboard = (() => {
  async function refresh() {
    const msgs  = window._cachedContactMessages || [];
    const subs  = window._cachedSubscribers || [];
    const prods = window._cachedProducts || Defaults.products();
    const pats  = window._cachedPatents || Defaults.patents();
    const execom = window._cachedExecomMembers || Defaults.team();
    const events = window._cachedEventsData || Defaults.events();
    const gallery = window._cachedGalleryData || Defaults.gallery();
    const unread = msgs.filter(m => !m.read).length;

    Utils.el('ds-msgs').textContent    = msgs.length;
    Utils.el('ds-subs').textContent    = subs.length;
    Utils.el('ds-prods').textContent   = prods.length;
    Utils.el('ds-patents').textContent = pats.length;
    if (Utils.el('ds-execom')) Utils.el('ds-execom').textContent = execom.length;
    if (Utils.el('ds-events')) Utils.el('ds-events').textContent = events.length;
    if (Utils.el('ds-gallery')) Utils.el('ds-gallery').textContent = gallery.length;

    const unreadEl = Utils.el('ds-unread');
    if (unreadEl) {
      unreadEl.textContent = unread > 0 ? `⬆ ${unread} unread` : 'All read';
      unreadEl.className = 'stat-trend ' + (unread > 0 ? 'trend-up' : 'trend-neutral');
    }

    const pill = Utils.el('unread-count-pill');
    if (pill) pill.textContent = `${unread} unread`;

    // Recent messages
    const recent = [...msgs].reverse().slice(0, 5);
    const rEl = Utils.el('recentMsgs');
    if (rEl) {
      if (recent.length === 0) {
        rEl.innerHTML = `<div class="empty-state"><div class="es-icon">📭</div><h3>No messages yet</h3><p>Contact form submissions will appear here.</p></div>`;
      } else {
        rEl.innerHTML = recent.map(m => `
          <div class="activity-item">
            <div class="act-dot ${m.read ? 'act-blue' : 'act-gold'}"></div>
            <div class="act-text">
              <strong>${Utils.sanitize(m.fname)} ${Utils.sanitize(m.lname)}</strong> — ${Utils.sanitize(m.subject)}
              <br><small style="color:var(--muted)">${Utils.sanitize(m.inquiryType || '')} · ${Utils.sanitize(m.email)}</small>
            </div>
            <div class="act-time">${Utils.fmtDate(m.date)}</div>
          </div>
        `).join('');
      }
    }

    updateMsgBadge(unread);
  }

  async function updateMsgBadge(count) {
    const badge = Utils.el('msgBadge');
    if (!badge) return;
    if (count === undefined) {
      const msgs = window._cachedContactMessages || [];
      count = msgs.filter(m => !m.read).length;
    }
    badge.textContent = count;
    badge.style.display = count > 0 ? '' : 'none';
  }

  function renderQuickLinks() {
    const ql = Utils.el('quickLinks');
    if (!ql) return;
    const links = [
      { page: 'products',  icon: '⚡', label: 'Manage Products' },
      { page: 'ip',        icon: '🔬', label: 'Manage IP Portfolio' },
      { page: 'insights',  icon: '💡', label: 'Write Blog Post' },
      { page: 'careers',   icon: '🎓', label: 'Post Job Opening' },
      { page: 'messages',  icon: '✉️', label: 'View All Messages' },
    ];
    ql.innerHTML = links.map(l => `
      <button class="quick-link" data-page="${l.page}">
        <span class="ql-icon">${l.icon}</span>
        <span class="ql-label">${l.label}</span>
        <span class="ql-arrow">→</span>
      </button>
    `).join('') + `
      <a href="index.html" target="_blank" rel="noopener noreferrer" class="quick-link">
        <span class="ql-icon">🔗</span>
        <span class="ql-label">Preview Live Site</span>
        <span class="ql-arrow">↗</span>
      </a>`;
  }

  function init() {
    renderQuickLinks();
    refresh();
  }

  return { init, refresh, updateMsgBadge };
})();

/* ════════════════════════════════════════
   HOME PAGE MODULE
   ════════════════════════════════════════ */

const Home = (() => {
  function applyFields(d) {
    Utils.setVal('hp-heroTitle', d.heroTitle || '');
    Utils.setVal('hp-heroSub',   d.heroSub   || '');
    Utils.setVal('hp-btn1',      d.btn1      || '');
    Utils.setVal('hp-btn2',      d.btn2      || '');
    Utils.setVal('hp-stat1',  d.stat1  || '16+');  Utils.setVal('hp-stat1l', d.stat1l || 'Intellectual Properties');
    Utils.setVal('hp-stat2',  d.stat2  || '10+'); Utils.setVal('hp-stat2l', d.stat2l || 'Quantum Innovation Force');
    Utils.setVal('hp-stat3',  d.stat3  || '500+');  Utils.setVal('hp-stat3l', d.stat3l || 'R&D Contributor');
    Utils.setVal('hp-stat4',  d.stat4  || '100+');   Utils.setVal('hp-stat4l', d.stat4l || 'Research Ecosystem');
    Utils.setVal('hp-aboutHead', d.aboutHead || '');
    Utils.setVal('hp-aboutDesc', d.aboutDesc || '');
    // New section fields
    Utils.setVal('hp-clients-badge', d.clientsBadge || 'The SMPS Ecosystem');
    Utils.setVal('hp-clients-head',  d.clientsHead  || 'This is the <span>SMPS Ecosystem</span>');
    Utils.setVal('hp-clients-sub',   d.clientsSub   || 'An interconnected engineering ecosystem uniting academic researchers, startup innovators, and industrial experts under one collaborative roof. By providing hands-on project ownership and advanced corporate-scale resources, we translate emerging technologies into high-performance industrial solutions.');
    Utils.setVal('hp-awards-badge',  d.awardsBadge  || 'Recognition');
    Utils.setVal('hp-awards-head',   d.awardsHead   || 'Awards & Achievements');
    Utils.setVal('hp-awards-sub',    d.awardsSub    || '');
    Utils.setVal('hp-partners-badge', d.partnersBadge || 'Strategic Partners');
    Utils.setVal('hp-partners-head',  d.partnersHead  || 'Collaborating for Future Excellence');
    Utils.setVal('hp-partners-sub',   d.partnersSub   || '');
    Utils.setVal('hp-alliances-badge', d.alliancesBadge || 'Strategic Alliances');
    Utils.setVal('hp-alliances-head',  d.alliancesHead  || 'Trusted by Leading Organizations');
    Utils.setVal('hp-alliances-sub',   d.alliancesSub   || '');
    Utils.setVal('hp-cta-head', d.ctaHead || 'Your Career Starts Before <span>Your First Job</span>');
    Utils.setVal('hp-cta-sub',  d.ctaSub  || "Don't wait for a placement. Build the experience that makes you un-ignorable.");
    Utils.setVal('hp-cta-btn',  d.ctaBtn  || 'Build Your Future Today →');
    // Ticker items: array -> one-per-line textarea
    if (Array.isArray(d.tickerItems) && d.tickerItems.length > 0) {
      Utils.setVal('hp-ticker-items', d.tickerItems.join('\n'));
    }
  }

  async function loadFields() {
    try {
      const res = await fetch('/api/settings/homeData');
      if (res.ok) {
        const data = await res.json();
        if (data && Object.keys(data).length) {
          applyFields(data);
          return;
        }
      }
    } catch (e) {
      console.warn('Failed to load home settings from local backend:', e);
    }
    const local = Utils.lsGet('homeData', {});
    applyFields(local);
    const remote = await DataStore.getDocument('homeData', local);
    if (remote) applyFields(remote);
  }

  async function save() {
    // Parse ticker items from textarea (one per line, filter blanks)
    const tickerRaw = Utils.getVal('hp-ticker-items');
    const tickerItems = tickerRaw
      ? tickerRaw.split('\n').map(s => s.trim()).filter(Boolean)
      : [];

    const d = {
      heroTitle: Utils.getVal('hp-heroTitle'), heroSub: Utils.getVal('hp-heroSub'),
      btn1: Utils.getVal('hp-btn1'), btn2: Utils.getVal('hp-btn2'),
      stat1: Utils.getVal('hp-stat1'), stat1l: Utils.getVal('hp-stat1l'),
      stat2: Utils.getVal('hp-stat2'), stat2l: Utils.getVal('hp-stat2l'),
      stat3: Utils.getVal('hp-stat3'), stat3l: Utils.getVal('hp-stat3l'),
      stat4: Utils.getVal('hp-stat4'), stat4l: Utils.getVal('hp-stat4l'),
      aboutHead: Utils.getVal('hp-aboutHead'), aboutDesc: Utils.getVal('hp-aboutDesc'),
      // New section fields
      clientsBadge: Utils.getVal('hp-clients-badge'),
      clientsHead:  Utils.getVal('hp-clients-head'),
      clientsSub:   Utils.getVal('hp-clients-sub'),
      awardsBadge:  Utils.getVal('hp-awards-badge'),
      awardsHead:   Utils.getVal('hp-awards-head'),
      awardsSub:    Utils.getVal('hp-awards-sub'),
      partnersBadge: Utils.getVal('hp-partners-badge'),
      partnersHead:  Utils.getVal('hp-partners-head'),
      partnersSub:   Utils.getVal('hp-partners-sub'),
      alliancesBadge: Utils.getVal('hp-alliances-badge'),
      alliancesHead:  Utils.getVal('hp-alliances-head'),
      alliancesSub:   Utils.getVal('hp-alliances-sub'),
      ctaHead: Utils.getVal('hp-cta-head'),
      ctaSub:  Utils.getVal('hp-cta-sub'),
      ctaBtn:  Utils.getVal('hp-cta-btn'),
      tickerItems,
    };
    const token = localStorage.getItem('smps_token');
    if (token) {
      try {
        await fetch('/api/settings/homeData', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(d)
        });
      } catch (e) {
        console.warn('Failed to save home settings to local backend:', e);
      }
    }
    await DataStore.saveDocument('homeData', d);
    Toast.show('✅ Home page saved!', 'success');
  }

  async function reset() {
    const token = localStorage.getItem('smps_token');
    if (token) {
      try {
        await fetch('/api/settings/homeData', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({})
        });
      } catch (e) {}
    }
    if (window.DataStore) {
      await DataStore.saveDocument('homeData', {});
    } else {
      Utils.lsSet('homeData', {});
    }
    await loadFields();
    Toast.show('↺ Reset to defaults');
  }

  function init() {
    Utils.el('saveHomeBtn')?.addEventListener('click', save);
    Utils.el('resetHomeBtn')?.addEventListener('click', reset);
  }

  return { init, loadFields };
})();

/* ════════════════════════════════════════
   ABOUT PAGE MODULE
   ════════════════════════════════════════ */

const About = (() => {
  function applyFields(d) {
    Utils.setVal('ab-heroTitle', d.heroTitle || 'Pioneering Deeptech R&D & Power Electronics Innovation');
    Utils.setVal('ab-heroSub', d.heroSub || 'SMPS Tech Lab is a center of excellence driving next-generation engineering research, prototype development, and system integration.');
    Utils.setVal('ab-vision', d.vision || 'To position India as a global leader in deep technology innovation by creating a self-sustaining ecosystem.');
    Utils.setVal('ab-mission', d.mission || 'To foster innovation, enable technology transfer, and build capacity for next-generation engineering leadership.');
    Utils.setVal('ab-story1', d.story1 || "SMPS Tech Lab was founded with a singular vision: to bridge the gap between theoretical research and real-world application in India's technology landscape.");
    Utils.setVal('ab-story2', d.story2 || 'Established as a subsidiary of SMPS Electric, we leveraged decades of industrial expertise to build a platform where innovators, researchers, and industry leaders could converge.');
    
    Utils.setVal('ab-teamTitle', d.teamTitle || 'The Minds Behind The Mission');

    Utils.setVal('ab-coreTitle', d.coreTitle || 'Our Operational Mandate & Business Scope');
    Utils.setVal('ab-coreSub', d.coreSub || 'As a legally chartered entity, SMPS Tech Lab is built to drive technological innovation, product engineering, and deeptech commercialization.');
    
    Utils.setVal('ab-valTitle', d.valTitle || 'The Principles That Guide Us');
    Utils.setVal('ab-achTitle', d.achTitle || 'Our Track Record');

    renderTeamList((Array.isArray(d.team) && d.team.length > 0) ? d.team : Defaults.team());
    renderCoreList((Array.isArray(d.coreOps) && d.coreOps.length > 0) ? d.coreOps : Defaults.coreOps());
    renderValList((Array.isArray(d.values) && d.values.length > 0) ? d.values : Defaults.values());
    renderAchList((Array.isArray(d.achievements) && d.achievements.length > 0) ? d.achievements : Defaults.achievements());
  }

  async function loadFields() {
    try {
      const res = await fetch('/api/settings/aboutData');
      if (res.ok) {
        const data = await res.json();
        if (data && Object.keys(data).length) {
          applyFields(data);
          return;
        }
      }
    } catch (e) {
      console.warn('Failed to load about settings from local backend:', e);
    }
    const local = Utils.lsGet('aboutData', {});
    applyFields(local);
    const remote = await DataStore.getDocument('aboutData', local);
    if (remote) applyFields(remote);
  }

  async function save() {
    const d = {
      heroTitle: Utils.getVal('ab-heroTitle'), heroSub: Utils.getVal('ab-heroSub'),
      vision: Utils.getVal('ab-vision'), mission: Utils.getVal('ab-mission'),
      story1: Utils.getVal('ab-story1'), story2: Utils.getVal('ab-story2'),
      teamTitle: Utils.getVal('ab-teamTitle'),
      coreTitle: Utils.getVal('ab-coreTitle'), coreSub: Utils.getVal('ab-coreSub'),
      valTitle: Utils.getVal('ab-valTitle'), achTitle: Utils.getVal('ab-achTitle'),
      team: collectTeam(),
      coreOps: collectCore(),
      values: collectVal(),
      achievements: collectAch()
    };
    const token = localStorage.getItem('smps_token');
    if (token) {
      try {
        await fetch('/api/settings/aboutData', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(d)
        });
      } catch (e) {
        console.warn('Failed to save about settings to local backend:', e);
      }
    }
    await DataStore.saveDocument('aboutData', d);
    Toast.show('✅ About page saved!', 'success');
  }

  async function reset() {
    const token = localStorage.getItem('smps_token');
    if (token) {
      try {
        await fetch('/api/settings/aboutData', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({})
        });
      } catch (e) {}
    }
    if (window.DataStore) {
      await DataStore.saveDocument('aboutData', {});
    }
    await loadFields();
    Toast.show('↺ Reset to defaults');
  }

  function renderTeamList(team) {
    const container = Utils.el('teamList');
    if (!container) return;
    container.innerHTML = team.map((m, i) => `
      <div class="dynamic-row team-row" data-idx="${i}">
        <input type="text" class="dyn-input" data-f="initials" value="${Utils.sanitize(m.initials)}" placeholder="SK" style="text-align:center;font-weight:700">
        <input type="text" class="dyn-input" data-f="name" value="${Utils.sanitize(m.name)}" placeholder="Full Name">
        <input type="text" class="dyn-input" data-f="role" value="${Utils.sanitize(m.role)}" placeholder="Role/Title">
        <input type="text" class="dyn-input" data-f="bio"  value="${Utils.sanitize(m.bio)}"  placeholder="Short bio">
        <button class="btn btn-danger btn-sm remove-item" data-list="team" data-idx="${i}">✕</button>
      </div>
    `).join('');
  }

  function renderCoreList(list) {
    const container = Utils.el('coreList');
    if (!container) return;
    container.innerHTML = list.map((m, i) => `
      <div class="dynamic-row" data-idx="${i}">
        <input type="text" class="dyn-input" data-f="icon" value="${Utils.sanitize(m.icon)}" placeholder="Icon (Lucide)" style="text-align:center;width:120px;">
        <input type="text" class="dyn-input" data-f="title" value="${Utils.sanitize(m.title)}" placeholder="Title">
        <input type="text" class="dyn-input" data-f="desc"  value="${Utils.sanitize(m.desc)}"  placeholder="Description">
        <button class="btn btn-danger btn-sm remove-item" data-list="core" data-idx="${i}">✕</button>
      </div>
    `).join('');
  }

  function renderValList(list) {
    const container = Utils.el('valList');
    if (!container) return;
    container.innerHTML = list.map((m, i) => `
      <div class="dynamic-row" data-idx="${i}">
        <input type="text" class="dyn-input" data-f="icon" value="${Utils.sanitize(m.icon)}" placeholder="Icon (Lucide)" style="text-align:center;width:120px;">
        <input type="text" class="dyn-input" data-f="title" value="${Utils.sanitize(m.title)}" placeholder="Title">
        <input type="text" class="dyn-input" data-f="desc"  value="${Utils.sanitize(m.desc)}"  placeholder="Description">
        <button class="btn btn-danger btn-sm remove-item" data-list="val" data-idx="${i}">✕</button>
      </div>
    `).join('');
  }

  function renderAchList(list) {
    const container = Utils.el('achList');
    if (!container) return;
    container.innerHTML = list.map((m, i) => `
      <div class="dynamic-row" data-idx="${i}">
        <input type="text" class="dyn-input" data-f="num" value="${Utils.sanitize(m.num)}" placeholder="Number (e.g. 100+)" style="text-align:center;width:120px;">
        <input type="text" class="dyn-input" data-f="label" value="${Utils.sanitize(m.label)}" placeholder="Label">
        <button class="btn btn-danger btn-sm remove-item" data-list="ach" data-idx="${i}">✕</button>
      </div>
    `).join('');
  }

  function collectTeam() {
    return [...document.querySelectorAll('#teamList .dynamic-row')].map(row => ({
      initials: row.querySelector('[data-f="initials"]')?.value || '',
      name:     row.querySelector('[data-f="name"]')?.value     || '',
      role:     row.querySelector('[data-f="role"]')?.value     || '',
      bio:      row.querySelector('[data-f="bio"]')?.value      || '',
    }));
  }

  function collectCore() {
    return [...document.querySelectorAll('#coreList .dynamic-row')].map(row => ({
      icon:  row.querySelector('[data-f="icon"]')?.value  || '',
      title: row.querySelector('[data-f="title"]')?.value || '',
      desc:  row.querySelector('[data-f="desc"]')?.value  || '',
    }));
  }

  function collectVal() {
    return [...document.querySelectorAll('#valList .dynamic-row')].map(row => ({
      icon:  row.querySelector('[data-f="icon"]')?.value  || '',
      title: row.querySelector('[data-f="title"]')?.value || '',
      desc:  row.querySelector('[data-f="desc"]')?.value  || '',
    }));
  }

  function collectAch() {
    return [...document.querySelectorAll('#achList .dynamic-row')].map(row => ({
      num:   row.querySelector('[data-f="num"]')?.value   || '',
      label: row.querySelector('[data-f="label"]')?.value || '',
    }));
  }

  function init() {
    Utils.el('saveAboutBtn')?.addEventListener('click', save);
    Utils.el('resetAboutBtn')?.addEventListener('click', reset);

    Utils.el('addTeamBtn')?.addEventListener('click', () => {
      const t = collectTeam();
      t.push({ initials: '', name: '', role: '', bio: '' });
      renderTeamList(t);
    });
    Utils.el('addCoreBtn')?.addEventListener('click', () => {
      const t = collectCore();
      t.push({ icon: '', title: '', desc: '' });
      renderCoreList(t);
    });
    Utils.el('addValBtn')?.addEventListener('click', () => {
      const t = collectVal();
      t.push({ icon: '', title: '', desc: '' });
      renderValList(t);
    });
    Utils.el('addAchBtn')?.addEventListener('click', () => {
      const t = collectAch();
      t.push({ num: '', label: '' });
      renderAchList(t);
    });

    // Event delegation for remove buttons across all lists
    document.querySelectorAll('#page-about').forEach(page => {
      page.addEventListener('click', (e) => {
        if (e.target.classList.contains('remove-item')) {
          const idx = parseInt(e.target.dataset.idx);
          const listType = e.target.dataset.list;
          if (listType === 'team') {
            const t = collectTeam(); t.splice(idx, 1); renderTeamList(t);
          } else if (listType === 'core') {
            const t = collectCore(); t.splice(idx, 1); renderCoreList(t);
          } else if (listType === 'val') {
            const t = collectVal(); t.splice(idx, 1); renderValList(t);
          } else if (listType === 'ach') {
            const t = collectAch(); t.splice(idx, 1); renderAchList(t);
          }
        }
      });
    });
  }

  return { init, loadFields };
})();

/* ════════════════════════════════════════
   PRODUCTS MODULE
   ════════════════════════════════════════ */

const Products = (() => {
  const STATUS_COLORS = { Live: 'pill-green', Development: 'pill-gold', Beta: 'pill-cyan', Deprecated: 'pill-red' };

  async function getAll() {
    // SQLite is the single source of truth — always fetch fresh from the API
    try {
      const res = await fetch('/api/products?_=' + Date.now());
      if (res.ok) {
        const list = await res.json();
        if (Array.isArray(list)) {
          window._cachedProducts = list;
          return list;
        }
      }
    } catch (e) {
      console.warn('Backend products fetch failed, using memory cache', e);
    }
    // Fallback: in-memory cache only (never use dummy Defaults)
    return window._cachedProducts !== undefined ? window._cachedProducts : [];
  }

  async function saveAll(list) {
    // In-memory cache update (actual save is done via API calls in save/remove)
    window._cachedProducts = list;
  }

  async function render() {
    const prods = await getAll();
    const tbody = Utils.el('prodTableBody');
    if (!tbody) return;

    if (!Array.isArray(prods) || prods.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4"><div class="empty-state" style="padding:40px"><div class="es-icon">⚡</div><h3>No products yet</h3><p>Add your first product.</p></div></td></tr>`;
      return;
    }

    tbody.innerHTML = prods.map(p => `
      <tr>
        <td>
          <div style="display:flex;align-items:center;gap:10px">
            <span style="display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;font-size:20px">${p.icon && p.icon.trim().startsWith('<') ? p.icon : Utils.sanitize(p.icon || '⚡')}</span>
            <div>
              <div class="td-title">${Utils.sanitize(p.name)}</div>
              <div class="td-muted">${Utils.sanitize(p.desc?.substring(0, 50) || '')}...</div>
            </div>
          </div>
        </td>
        <td><span class="pill pill-blue">${Utils.sanitize(p.tag)}</span></td>
        <td><span class="pill ${STATUS_COLORS[p.status] || 'pill-blue'}">${Utils.sanitize(p.status)}</span></td>
        <td class="td-actions">
          <button class="btn btn-secondary btn-sm" data-edit="${p.id}">✏️ Edit</button>
          <button class="btn btn-danger btn-sm"    data-delete="${p.id}">🗑</button>
        </td>
      </tr>
    `).join('');
  }

  async function openModal(editId) {
    Utils.setVal('pm-editId', '');
    ['pm-name', 'pm-img', 'pm-icon', 'pm-tagLabel', 'pm-desc', 'pm-fullDesc', 'pm-features'].forEach(id => Utils.setVal(id, ''));
    Utils.el('pm-tag').value = 'hardware';
    Utils.el('pm-status').value = 'Live';
    Utils.el('prodModalTitle').textContent = 'Add Product';

    if (editId !== undefined) {
      const p = (await getAll()).find(x => String(x.id) === String(editId));
      if (p) {
        Utils.el('prodModalTitle').textContent = 'Edit Product';
        Utils.setVal('pm-name',     p.name);
        Utils.setVal('pm-img',      p.img || '');
        Utils.setVal('pm-icon',     p.icon);
        Utils.setVal('pm-tagLabel', p.tagLabel);
        Utils.setVal('pm-desc',     p.desc);
        Utils.setVal('pm-fullDesc', p.fullDesc || '');
        Utils.setVal('pm-features', (p.features || []).join('\n'));
        Utils.el('pm-tag').value    = p.tag || 'hardware';
        Utils.el('pm-status').value = p.status;
        Utils.setVal('pm-editId', p.id);
      }
    }
    Modal.open('productModal');
  }

  async function save() {
    const name = Utils.getVal('pm-name');
    if (!name) { Toast.show('⚠️ Product name is required.', 'error'); return; }

    const editId = Utils.getVal('pm-editId');
    const tagVal = Utils.el('pm-tag').value;
    let defTagLabel = 'Hardware & Power';
    let defTagClass = 'tag-blue';
    if (tagVal === 'ai-software') { defTagLabel = 'AI & Software'; defTagClass = 'tag-purple'; }
    else if (tagVal === 'iot') { defTagLabel = 'IoT & Robotics'; defTagClass = 'tag-cyan'; }

    const STATUS_LABELS_MAP = { Live: 'Active Enrollment', Development: 'In Development', Beta: 'Beta Access', Deprecated: 'Deprecated' };
    const statusVal = Utils.el('pm-status').value;
    const obj = {
      name,
      img:         Utils.getVal('pm-img') || '',
      tag:         tagVal,
      tagClass:    defTagClass,
      status:      statusVal,
      statusLabel: STATUS_LABELS_MAP[statusVal] || statusVal,
      icon:        Utils.getVal('pm-icon')     || '⚡',
      tagLabel:    Utils.getVal('pm-tagLabel') || defTagLabel,
      desc:        Utils.getVal('pm-desc'),
      fullDesc:    Utils.getVal('pm-fullDesc'),
      features:    Utils.getVal('pm-features').split('\n').map(f => f.trim()).filter(Boolean),
    };

    const token = sessionStorage.getItem('smps_api_token') || localStorage.getItem('smps_token');
    let savedSuccess = false;

    if (token) {
      try {
        let res;
        const headers = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        };
        if (editId && String(editId).match(/^\d+$/)) {
          res = await fetch(`/api/products/${editId}`, {
            method: 'PUT',
            headers,
            body: JSON.stringify(obj)
          });
        } else {
          res = await fetch('/api/products', {
            method: 'POST',
            headers,
            body: JSON.stringify(obj)
          });
        }
        if (res.ok) {
          savedSuccess = true;
          const listRes = await fetch('/api/products?_=' + Date.now());
          if (listRes.ok) {
            const list = await listRes.json();
            window._cachedProducts = list;
            await saveAll(list);
          }
        } else {
          const errData = await res.json();
          Toast.show(`⚠️ Server error: ${errData.error || 'Failed to save product'}`, 'error');
          return;
        }
      } catch (e) {
        console.warn('Backend save product failed, saving locally only', e);
      }
    }

    if (!savedSuccess) {
      const list = await getAll();
      const newObj = { ...obj, id: editId ? editId : Utils.uid('prod') };
      const updated = editId ? list.map(p => String(p.id) === String(editId) ? newObj : p) : [...list, newObj];
      await saveAll(updated);
      window._cachedProducts = updated;
    }

    Modal.close('productModal');
    render();
    Toast.show('✅ Product saved!', 'success');
  }

  async function remove(id) {
    const yes = await Confirm.ask('Are you sure you want to delete this product? This cannot be undone.');
    if (!yes) return;
    const token = sessionStorage.getItem('smps_api_token') || localStorage.getItem('smps_token');
    if (token && String(id).match(/^\d+$/)) {
      try {
        await fetch(`/api/products/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
      } catch (e) { console.warn('Backend delete failed', e); }
    }
    const list = await getAll();
    const updated = list.filter(p => String(p.id) !== String(id));
    await saveAll(updated);
    window._cachedProducts = updated;
    render();
    Toast.show('🗑 Product deleted.');
  }

  function init() {
    Utils.el('addProductBtn')?.addEventListener('click', () => openModal());
    Utils.el('saveProductBtn')?.addEventListener('click', save);

    Utils.el('prodTableBody')?.addEventListener('click', (e) => {
      const editBtn   = e.target.closest('[data-edit]');
      const deleteBtn = e.target.closest('[data-delete]');
      if (editBtn)   openModal(editBtn.dataset.edit);
      if (deleteBtn) remove(deleteBtn.dataset.delete);
    });

    initTableSearch('prodSearch', 'prodTableBody');
  }

  return { init, render };
})();;

/* ════════════════════════════════════════
   PRODUCT PAGE SETTINGS MODULE
   ════════════════════════════════════════ */

const ProdSettings = (() => {
  function applyFields(d) {
    Utils.setVal('prod-heroTitle', d.heroTitle || 'Master Industry <span>Standard</span><br>Workflows');
    Utils.setVal('prod-catAll', d.catAll || 'All Tracks');
    Utils.setVal('prod-catHardware', d.catHardware || 'Hardware & Power');
    Utils.setVal('prod-catAiSoftware', d.catAiSoftware || 'AI & Software');
    Utils.setVal('prod-catIot', d.catIot || 'IoT & Robotics');
  }

  async function loadFields() {
    try {
      const res = await fetch('/api/settings/productsSettings');
      if (res.ok) {
        const data = await res.json();
        if (data && Object.keys(data).length) {
          applyFields(data);
          return;
        }
      }
    } catch (e) {
      console.warn('Failed to load products settings from backend:', e);
    }
    const local = Utils.lsGet('productsSettings', {});
    applyFields(local);
    const remote = await DataStore.getDocument('productsSettings', local);
    if (remote) applyFields(remote);
  }

  async function save() {
    const d = {
      heroTitle: Utils.getVal('prod-heroTitle'),
      catAll: Utils.getVal('prod-catAll'),
      catHardware: Utils.getVal('prod-catHardware'),
      catAiSoftware: Utils.getVal('prod-catAiSoftware'),
      catIot: Utils.getVal('prod-catIot')
    };

    const token = sessionStorage.getItem('smps_api_token') || localStorage.getItem('smps_token');
    if (token) {
      try {
        await fetch('/api/settings/productsSettings', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(d)
        });
      } catch (e) {
        console.warn('Failed to save products settings to backend:', e);
      }
    }

    await DataStore.saveDocument('productsSettings', d);
    Toast.show('✅ Product page settings saved!', 'success');
  }

  function init() {
    Utils.el('saveProdSettingsBtn')?.addEventListener('click', save);
  }

  return { init, loadFields };
})();

/* ════════════════════════════════════════
   EXECOM PAGE SETTINGS MODULE
   ════════════════════════════════════════ */

const ExecomSettings = (() => {
  function applyFields(d) {
    Utils.setVal('ex-heroTitle', d.heroTitle || 'Leadership That <span>Inspires</span>');
    Utils.setVal('ex-heroDesc', d.heroDesc || "Meet the visionaries driving SMPS Tech Lab's mission — a diverse team of industry experts, researchers, and strategic leaders committed to building India's innovation ecosystem.");
    Utils.setVal('ex-execBadge', d.execBadge || 'Executive Committee');
    Utils.setVal('ex-execTitle', d.execTitle || 'The Minds Behind <span>The Mission</span>');
    Utils.setVal('ex-msgBadge', d.msgBadge || "Chairman's Message");
    Utils.setVal('ex-msgTitle', d.msgTitle || 'A Word from <span>Our Leadership</span>');
    Utils.setVal('ex-msgHead', d.msgHead || "Driving India's Deep Tech Revolution");
    Utils.setVal('ex-msgText', d.msgText || "At SMPS Tech Lab, we believe that the future of technology leadership lies in collaboration. Our executive committee brings together decades of experience across industry, academia, and government to create an ecosystem where innovation thrives. We are committed to nurturing talent, protecting intellectual property, and building partnerships that transform ideas into impact.");
    Utils.setVal('ex-msgAuthor', d.msgAuthor || '— Suresh Kumar, Founder & CEO');
    Utils.setVal('ex-advBadge', d.advBadge || 'Strategic Advisors');
    Utils.setVal('ex-advTitle', d.advTitle || 'Our <span>Board of Advisors</span>');
    Utils.setVal('ex-ctaTitle', d.ctaTitle || 'Connect With Our Leadership');
    Utils.setVal('ex-ctaText', d.ctaText || 'Interested in strategic discussions or partnership opportunities at the executive level?');
    Utils.setVal('ex-ctaBtn', d.ctaBtn || 'Schedule an Executive Meeting →');
  }

  async function loadFields() {
    try {
      const res = await fetch('/api/settings/execomSettings');
      if (res.ok) {
        const data = await res.json();
        if (data && Object.keys(data).length) {
          applyFields(data);
          return;
        }
      }
    } catch (e) {
      console.warn('Failed to load execom settings from backend:', e);
    }
    const local = Utils.lsGet('execomSettings', {});
    applyFields(local);
    const remote = await DataStore.getDocument('execomSettings', local);
    if (remote) applyFields(remote);
  }

  async function save() {
    const d = {
      heroTitle: Utils.getVal('ex-heroTitle'),
      heroDesc: Utils.getVal('ex-heroDesc'),
      execBadge: Utils.getVal('ex-execBadge'),
      execTitle: Utils.getVal('ex-execTitle'),
      msgBadge: Utils.getVal('ex-msgBadge'),
      msgTitle: Utils.getVal('ex-msgTitle'),
      msgHead: Utils.getVal('ex-msgHead'),
      msgText: Utils.getVal('ex-msgText'),
      msgAuthor: Utils.getVal('ex-msgAuthor'),
      advBadge: Utils.getVal('ex-advBadge'),
      advTitle: Utils.getVal('ex-advTitle'),
      ctaTitle: Utils.getVal('ex-ctaTitle'),
      ctaText: Utils.getVal('ex-ctaText'),
      ctaBtn: Utils.getVal('ex-ctaBtn')
    };

    const token = sessionStorage.getItem('smps_api_token') || localStorage.getItem('smps_token');
    if (token) {
      try {
        await fetch('/api/settings/execomSettings', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(d)
        });
      } catch (e) {
        console.warn('Failed to save execom settings to backend:', e);
      }
    }

    await DataStore.saveDocument('execomSettings', d);
    Toast.show('✅ Execom page settings saved!', 'success');
  }

  function init() {
    Utils.el('saveExecomSettingsBtn')?.addEventListener('click', save);
  }

  return { init, loadFields };
})();

/* ════════════════════════════════════════
   EXECOM MODULE
   ════════════════════════════════════════ */

const Execom = (() => {
  async function getAll() {
    try {
      const res = await fetch('/api/execom?_=' + Date.now());
      if (res.ok) {
        const list = await res.json();
        if (Array.isArray(list)) {
          window._cachedExecomData = list;
          return list;
        }
      }
    } catch (e) {
      console.warn('Backend execom fetch failed, using memory cache', e);
    }
    return window._cachedExecomData !== undefined ? window._cachedExecomData : [];
  }

  async function saveAll(list) {
    window._cachedExecomData = list;
  }

  async function render() {
    const members = await getAll();
    const tbody = Utils.el('execomTableBody');
    if (!tbody) return;

    if (!Array.isArray(members) || members.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4"><div class="empty-state" style="padding:40px"><div class="es-icon">👥</div><h3>No members yet</h3><p>Add your first committee member.</p></div></td></tr>`;
      return;
    }

    tbody.innerHTML = members.map(m => `
      <tr>
        <td>
          <div style="display:flex;align-items:center;gap:10px">
            ${m.img ? `<img src="../${m.img}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">` : ''}
            <div class="initials-avatar" style="width:32px;height:32px;border-radius:50%;background:var(--accent-dim);display:${m.img ? 'none' : 'flex'};align-items:center;justify-content:center;font-size:12px;font-weight:bold;color:var(--accent);">${Utils.sanitize(m.initials || '??')}</div>
            <div>
              <div class="td-title">${Utils.sanitize(m.name)}</div>
              <div class="td-muted">${Utils.sanitize(m.email || 'No email')}</div>
            </div>
          </div>
        </td>
        <td class="td-muted">${Utils.sanitize(m.role)}</td>
        <td><span class="pill ${m.type === 'execom' ? 'pill-purple' : 'pill-gold'}">${m.type === 'execom' ? 'Execom' : 'Advisor'}</span></td>
        <td class="td-actions">
          <button class="btn btn-secondary btn-sm" data-edit="${m.id}">✏️ Edit</button>
          <button class="btn btn-danger btn-sm"    data-delete="${m.id}">🗑</button>
        </td>
      </tr>
    `).join('');
  }

  async function openModal(editId) {
    Utils.setVal('em-editId', '');
    // Hard-reset all fields — use both .value = '' and setAttribute to clear
    // browser autofill, Grammarly suggestions, and any cached DOM state
    ['em-name', 'em-role', 'em-initials', 'em-img', 'em-expertise', 'em-bio', 'em-quote', 'em-achievements', 'em-linkedin', 'em-email'].forEach(id => {
      const el = Utils.el(id);
      if (!el) return;
      el.value = '';
      el.setAttribute('value', '');
      el.style.borderColor = '';
      el.style.boxShadow = '';
      // Trigger input event so any reactive listeners/extensions clear their state
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    // Remove any inline error banner
    const errBanner = Utils.el('execomFormError');
    if (errBanner) errBanner.remove();

    Utils.el('em-type').value = 'execom';
    Utils.el('execomModalTitle').textContent = 'Add Excom Member';

    if (editId !== undefined) {
      const m = (await getAll()).find(x => String(x.id) === String(editId));
      if (m) {
        Utils.el('execomModalTitle').textContent = 'Edit Excom Member';
        Utils.setVal('em-name', m.name);
        Utils.setVal('em-role', m.role);
        Utils.setVal('em-initials', m.initials);
        Utils.el('em-type').value = m.type || 'execom';
        Utils.setVal('em-img', m.img || '');
        Utils.setVal('em-expertise', m.expertise || '');
        Utils.setVal('em-bio', m.bio || '');
        Utils.setVal('em-quote', m.quote || '');
        Utils.setVal('em-achievements', Array.isArray(m.achievements) ? m.achievements.join('\n') : (m.achievements || ''));
        Utils.setVal('em-linkedin', m.linkedin || '');
        Utils.setVal('em-email', m.email || '');
        Utils.setVal('em-editId', m.id);
      }
    }
    Modal.open('execomModal');
  }

  async function save() {
    const name = Utils.getVal('em-name');
    const role = Utils.getVal('em-role');
    const initials = Utils.getVal('em-initials');
    const bio = Utils.getVal('em-bio');

    // Clear previous error highlights
    ['em-name', 'em-role', 'em-initials', 'em-bio'].forEach(id => {
      const el = Utils.el(id);
      if (el) { el.style.borderColor = ''; el.style.boxShadow = ''; }
    });
    let existingBanner = Utils.el('execomFormError');
    if (existingBanner) existingBanner.remove();

    if (!name || !role || !initials || !bio) {
      // Highlight missing required fields in red
      const missing = [];
      if (!name)     { const el = Utils.el('em-name');     if (el) { el.style.borderColor = '#ef4444'; el.style.boxShadow = '0 0 0 3px rgba(239,68,68,0.25)'; } missing.push('Full Name'); }
      if (!role)     { const el = Utils.el('em-role');     if (el) { el.style.borderColor = '#ef4444'; el.style.boxShadow = '0 0 0 3px rgba(239,68,68,0.25)'; } missing.push('Role'); }
      if (!initials) { const el = Utils.el('em-initials'); if (el) { el.style.borderColor = '#ef4444'; el.style.boxShadow = '0 0 0 3px rgba(239,68,68,0.25)'; } missing.push('Initials'); }
      if (!bio)      { const el = Utils.el('em-bio');      if (el) { el.style.borderColor = '#ef4444'; el.style.boxShadow = '0 0 0 3px rgba(239,68,68,0.25)'; } missing.push('Biography'); }

      // Show an error banner at the top of the modal body
      const modalBody = Utils.el('execomModal')?.querySelector('.modal-body');
      if (modalBody) {
        const banner = document.createElement('div');
        banner.id = 'execomFormError';
        banner.style.cssText = 'background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.4);border-radius:10px;padding:12px 16px;margin-bottom:16px;font-size:13px;color:#fca5a5;display:flex;align-items:center;gap:8px;';
        banner.innerHTML = `<span style="font-size:16px">⚠️</span> <strong>Required fields missing:</strong>&nbsp;${missing.join(', ')}`;
        modalBody.insertBefore(banner, modalBody.firstChild);
        // Scroll to top of modal body to show the error
        modalBody.scrollTop = 0;
      }
      return;
    }

    const editId = Utils.getVal('em-editId');
    const obj = {
      name,
      role,
      initials,
      type: Utils.el('em-type').value,
      img: Utils.getVal('em-img'),
      expertise: Utils.getVal('em-expertise'),
      bio,
      quote: Utils.getVal('em-quote'),
      achievements: Utils.getVal('em-achievements').split('\n').map(a => a.trim()).filter(Boolean),
      linkedin: Utils.getVal('em-linkedin'),
      email: Utils.getVal('em-email')
    };

    const token = sessionStorage.getItem('smps_api_token') || localStorage.getItem('smps_token');
    let savedSuccess = false;

    if (token) {
      try {
        let res;
        const headers = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        };
        if (editId && String(editId).match(/^\d+$/)) {
          res = await fetch(`/api/execom/${editId}`, {
            method: 'PUT',
            headers,
            body: JSON.stringify(obj)
          });
        } else {
          res = await fetch('/api/execom', {
            method: 'POST',
            headers,
            body: JSON.stringify(obj)
          });
        }
        if (res.ok) {
          savedSuccess = true;
          const listRes = await fetch('/api/execom?_=' + Date.now());
          if (listRes.ok) {
            const list = await listRes.json();
            window._cachedExecomData = list;
            await saveAll(list);
          }
        } else {
          const errData = await res.json();
          Toast.show(`⚠️ Server error: ${errData.error || 'Failed to save member'}`, 'error');
          return;
        }
      } catch (e) {
        console.warn('Backend save member failed, saving locally only', e);
      }
    }

    if (!savedSuccess) {
      const list = await getAll();
      const newObj = { ...obj, id: editId ? editId : Utils.uid('execom') };
      const updated = editId ? list.map(p => String(p.id) === String(editId) ? newObj : p) : [...list, newObj];
      await saveAll(updated);
      window._cachedExecomData = updated;
    }

    Modal.close('execomModal');
    render();
    Toast.show('✅ Member saved!', 'success');
  }

  async function remove(id) {
    const yes = await Confirm.ask('Delete this member? This cannot be undone.');
    if (!yes) return;

    const token = sessionStorage.getItem('smps_api_token') || localStorage.getItem('smps_token');
    if (token && String(id).match(/^\d+$/)) {
      try {
        await fetch(`/api/execom/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
      } catch (e) { console.warn('Backend delete failed', e); }
    }

    const list = await getAll();
    const updated = list.filter(p => String(p.id) !== String(id));
    await saveAll(updated);
    window._cachedExecomData = updated;
    render();
    Toast.show('🗑 Member deleted.');
  }

  function init() {
    Utils.el('addExecomBtn')?.addEventListener('click', () => openModal());
    Utils.el('saveExecomBtn')?.addEventListener('click', save);

    Utils.el('execomTableBody')?.addEventListener('click', (e) => {
      const editBtn   = e.target.closest('[data-edit]');
      const deleteBtn = e.target.closest('[data-delete]');
      if (editBtn)   openModal(editBtn.dataset.edit);
      if (deleteBtn) remove(deleteBtn.dataset.delete);
    });

    initTableSearch('execomSearch', 'execomTableBody');
  }

  return { init, render };
})();

/* ════════════════════════════════════════
   EVENTS MODULE
   ════════════════════════════════════════ */

const EventsSettings = (() => {
  const FIELDS = [
    'ev-heroTitle', 'ev-heroDesc',
    'ev-catAll', 'ev-catConference', 'ev-catWorkshop', 'ev-catNetworking', 'ev-catWebinar'
  ];

  function applyFields(d) {
    const defaults = Defaults.eventsSettings();
    FIELDS.forEach(f => {
      const key = f.replace('ev-', '');
      Utils.setVal(f, d[key] !== undefined ? d[key] : (defaults[key] || ''));
    });
  }

  async function loadFields() {
    try {
      const res = await fetch('/api/settings/eventsSettings');
      if (res.ok) {
        const data = await res.json();
        if (data && Object.keys(data).length) {
          applyFields(data);
          return;
        }
      }
    } catch (e) {
      console.warn('Failed to load events settings from backend:', e);
    }
    const local = Utils.lsGet('eventsSettings', {});
    applyFields(local);
    const remote = await DataStore.getDocument('eventsSettings', local);
    if (remote) applyFields(remote);
  }

  async function save() {
    const d = {};
    FIELDS.forEach(f => {
      const key = f.replace('ev-', '');
      d[key] = Utils.getVal(f);
    });

    const token = sessionStorage.getItem('smps_api_token') || localStorage.getItem('smps_token');
    if (token) {
      try {
        await fetch('/api/settings/eventsSettings', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(d)
        });
      } catch (e) {
        console.warn('Failed to save events settings to backend:', e);
      }
    }

    await DataStore.saveDocument('eventsSettings', d);
    Toast.show('✅ Events page settings saved!', 'success');
  }

  function init() {
    Utils.el('saveEventsSettingsBtn')?.addEventListener('click', save);
  }

  return { init, loadFields };
})();

const Events = (() => {
  async function getAll() {
    try {
      const res = await fetch('/api/events?_=' + Date.now());
      if (res.ok) {
        const list = await res.json();
        if (Array.isArray(list)) {
          window._cachedEventsData = list;
          return list;
        }
      }
    } catch (e) {
      console.warn('Backend events fetch failed, using memory cache', e);
    }
    return window._cachedEventsData !== undefined ? window._cachedEventsData : [];
  }

  async function saveAll(list) {
    window._cachedEventsData = list;
  }

  async function render() {
    const events = await getAll();
    const tbody = Utils.el('eventsTableBody');
    if (!tbody) return;

    if (!Array.isArray(events) || events.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4"><div class="empty-state" style="padding:40px"><div class="es-icon">📅</div><h3>No events yet</h3><p>Add your first event.</p></div></td></tr>`;
      return;
    }

    tbody.innerHTML = events.map(e => `
      <tr>
        <td>
          <div style="display:flex;align-items:center;gap:10px">
            ${e.img ? `<img src="${e.img}" style="width:40px;height:30px;border-radius:4px;object-fit:cover;">` : ''}
            <div>
              <div class="td-title">${Utils.sanitize(e.name)}</div>
              <div class="td-muted">${Utils.sanitize(e.desc?.substring(0, 50) || '')}...</div>
            </div>
          </div>
        </td>
        <td><span class="pill pill-purple">${Utils.sanitize(e.type)}</span></td>
        <td>
          <div class="td-title">${Utils.sanitize(e.date)}</div>
          <div class="td-muted">${Utils.sanitize(e.location)}</div>
        </td>
        <td class="td-actions">
          <button class="btn btn-secondary btn-sm" data-edit="${e.id}">✏️ Edit</button>
          <button class="btn btn-danger btn-sm"    data-delete="${e.id}">🗑</button>
        </td>
      </tr>
    `).join('');
  }

  async function openModal(editId) {
    Utils.setVal('ev-editId', '');
    ['ev-name', 'ev-date', 'ev-month', 'ev-day', 'ev-location', 'ev-img', 'ev-desc', 'ev-fullDesc', 'ev-speakers', 'ev-agenda', 'ev-prerequisites', 'ev-seats'].forEach(id => Utils.setVal(id, ''));
    Utils.el('ev-type').value = 'conference';
    Utils.el('ev-isFeatured').checked = false;
    Utils.el('eventsModalTitle').textContent = 'Add Event';

    if (editId !== undefined) {
      const e = (await getAll()).find(x => String(x.id) === String(editId));
      if (e) {
        Utils.el('eventsModalTitle').textContent = 'Edit Event';
        Utils.setVal('ev-name', e.name);
        Utils.el('ev-type').value = e.type || 'conference';
        Utils.setVal('ev-date', e.date);
        Utils.setVal('ev-month', e.month);
        Utils.setVal('ev-day', e.day);
        Utils.setVal('ev-location', e.location);
        Utils.setVal('ev-img', e.img || '');
        Utils.setVal('ev-desc', e.desc);
        Utils.setVal('ev-fullDesc', e.fullDesc);
        Utils.setVal('ev-speakers', Array.isArray(e.speakers) ? e.speakers.join('\n') : (e.speakers || ''));
        Utils.setVal('ev-agenda', e.agenda || '');
        Utils.setVal('ev-prerequisites', e.prerequisites || '');
        Utils.setVal('ev-seats', e.seats || '');
        Utils.el('ev-isFeatured').checked = Boolean(parseInt(e.is_featured || e.isFeatured || 0));
        Utils.setVal('ev-editId', e.id);
      }
    }
    Modal.open('eventsModal');
  }

  async function save() {
    const name = Utils.getVal('ev-name');
    const date = Utils.getVal('ev-date');
    const month = Utils.getVal('ev-month');
    const day = Utils.getVal('ev-day');
    const location = Utils.getVal('ev-location');
    const img = Utils.getVal('ev-img');
    const desc = Utils.getVal('ev-desc');
    const fullDesc = Utils.getVal('ev-fullDesc');

    if (!name || !date || !month || !day || !location || !img || !desc || !fullDesc) {
      Toast.show('⚠️ All fields marked with * are required.', 'error');
      return;
    }

    const editId = Utils.getVal('ev-editId');
    const obj = {
      name,
      type: Utils.el('ev-type').value,
      date,
      month,
      day,
      location,
      img,
      desc,
      fullDesc,
      speakers: Utils.getVal('ev-speakers').split('\n').map(s => s.trim()).filter(Boolean),
      agenda: Utils.getVal('ev-agenda'),
      prerequisites: Utils.getVal('ev-prerequisites'),
      seats: Utils.getVal('ev-seats'),
      is_featured: Utils.el('ev-isFeatured').checked ? 1 : 0
    };

    const token = sessionStorage.getItem('smps_api_token') || localStorage.getItem('smps_token');
    let savedSuccess = false;

    if (token) {
      try {
        let res;
        const headers = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        };
        if (editId && String(editId).match(/^\d+$/)) {
          res = await fetch(`/api/events/${editId}`, {
            method: 'PUT',
            headers,
            body: JSON.stringify(obj)
          });
        } else {
          res = await fetch('/api/events', {
            method: 'POST',
            headers,
            body: JSON.stringify(obj)
          });
        }
        if (res.ok) {
          savedSuccess = true;
          const listRes = await fetch('/api/events?_=' + Date.now());
          if (listRes.ok) {
            const list = await listRes.json();
            window._cachedEventsData = list;
            await saveAll(list);
          }
        } else {
          const errData = await res.json();
          Toast.show(`⚠️ Server error: ${errData.error || 'Failed to save event'}`, 'error');
          return;
        }
      } catch (e) {
        console.warn('Backend save event failed, saving locally only', e);
      }
    }

    if (!savedSuccess) {
      const list = await getAll();
      const newObj = { ...obj, id: editId ? editId : Utils.uid('event') };
      const updated = editId ? list.map(e => String(e.id) === String(editId) ? newObj : e) : [...list, newObj];
      await saveAll(updated);
      window._cachedEventsData = updated;
    }

    Modal.close('eventsModal');
    render();
    Toast.show('✅ Event saved!', 'success');
  }

  async function remove(id) {
    const yes = await Confirm.ask('Delete this event? This cannot be undone.');
    if (!yes) return;

    const token = sessionStorage.getItem('smps_api_token') || localStorage.getItem('smps_token');
    let deletedSuccess = false;
    if (token && String(id).match(/^\d+$/)) {
      try {
        const res = await fetch(`/api/events/${id}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          deletedSuccess = true;
          const listRes = await fetch('/api/events?_=' + Date.now());
          if (listRes.ok) {
            const list = await listRes.json();
            window._cachedEventsData = list;
            await saveAll(list);
          }
        }
      } catch (e) {
        console.warn('Backend delete failed', e);
      }
    }

    if (!deletedSuccess) {
      const list = await getAll();
      const updated = list.filter(e => String(e.id) !== String(id));
      await saveAll(updated);
      window._cachedEventsData = updated;
    }
    render();
    Toast.show('🗑 Event deleted.');
  }

  function init() {
    Utils.el('addEventsBtn')?.addEventListener('click', () => openModal());
    Utils.el('saveEventsBtn')?.addEventListener('click', save);

    Utils.el('eventsTableBody')?.addEventListener('click', (e) => {
      const editBtn   = e.target.closest('[data-edit]');
      const deleteBtn = e.target.closest('[data-delete]');
      if (editBtn)   openModal(editBtn.dataset.edit);
      if (deleteBtn) remove(deleteBtn.dataset.delete);
    });

    initTableSearch('eventsSearch', 'eventsTableBody');
  }

  return { init, render };
})();

/* ════════════════════════════════════════
   GALLERY MODULE
   ════════════════════════════════════════ */

const GallerySettings = (() => {
  const FIELDS = [
    'gal-heroTitle', 'gal-heroDesc',
    'gal-catAll', 'gal-catSummit', 'gal-catWorkshop', 'gal-catLab'
  ];

  function applyFields(d) {
    const defaults = Defaults.gallerySettings();
    FIELDS.forEach(f => {
      const key = f.replace('gal-', '');
      Utils.setVal(f, d[key] !== undefined ? d[key] : (defaults[key] || ''));
    });
  }

  async function loadFields() {
    try {
      const res = await fetch('/api/settings/gallerySettings');
      if (res.ok) {
        const data = await res.json();
        if (data && Object.keys(data).length) {
          applyFields(data);
          return;
        }
      }
    } catch (e) {
      console.warn('Failed to load gallery settings from backend:', e);
    }
    const local = Utils.lsGet('gallerySettings', {});
    applyFields(local);
    const remote = await DataStore.getDocument('gallerySettings', local);
    if (remote) applyFields(remote);
  }

  async function save() {
    const d = {};
    FIELDS.forEach(f => {
      const key = f.replace('gal-', '');
      d[key] = Utils.getVal(f);
    });

    const token = sessionStorage.getItem('smps_api_token') || localStorage.getItem('smps_token');
    if (token) {
      try {
        await fetch('/api/settings/gallerySettings', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(d)
        });
      } catch (e) {
        console.warn('Failed to save gallery settings to backend:', e);
      }
    }

    await DataStore.saveDocument('gallerySettings', d);
    Toast.show('✅ Gallery page settings saved!', 'success');
  }

  function init() {
    Utils.el('saveGallerySettingsBtn')?.addEventListener('click', save);
  }

  return { init, loadFields };
})();

const Gallery = (() => {
  async function getAll() {
    try {
      const res = await fetch('/api/gallery?_=' + Date.now());
      if (res.ok) {
        const list = await res.json();
        if (Array.isArray(list)) {
          window._cachedGalleryData = list;
          try { await DataStore.saveList('galleryData', list); } catch (e) {}
          return list;
        }
      }
    } catch (e) {
      console.warn('Backend gallery fetch failed, using cache', e);
    }

    if (window._cachedGalleryData !== undefined) return window._cachedGalleryData;
    try {
      const list = await DataStore.getList('galleryData', null);
      if (list !== null) return list;
    } catch (e) { console.warn('DataStore.getList failed for galleryData', e); }
    return Defaults.gallery();
  }

  async function saveAll(list) {
    await DataStore.saveList('galleryData', list);
  }

  async function render() {
    const list = await getAll();
    const tbody = Utils.el('galleryTableBody');
    if (!tbody) return;

    if (!Array.isArray(list) || list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4"><div class="empty-state" style="padding:40px"><div class="es-icon">🖼️</div><h3>No gallery items yet</h3><p>Add your first item.</p></div></td></tr>`;
      return;
    }

    tbody.innerHTML = list.map(g => `
      <tr>
        <td>
          ${g.img ? `<img src="${g.img}" style="width:50px;height:35px;border-radius:4px;object-fit:cover;">` : ''}
        </td>
        <td>
          <div class="td-title">${Utils.sanitize(g.title)}</div>
          <div class="td-muted">${Utils.sanitize(g.desc)}</div>
        </td>
        <td><span class="pill pill-blue">${Utils.sanitize(g.category)}</span></td>
        <td class="td-actions">
          <button class="btn btn-secondary btn-sm" data-edit="${g.id}">✏️ Edit</button>
          <button class="btn btn-danger btn-sm"    data-delete="${g.id}">🗑</button>
        </td>
      </tr>
    `).join('');
  }

  async function openModal(editId) {
    Utils.setVal('gm-editId', '');
    ['gm-title', 'gm-desc', 'gm-img'].forEach(id => Utils.setVal(id, ''));
    Utils.el('gm-category').value = 'summit';
    Utils.el('galleryModalTitle').textContent = 'Add Gallery Item';

    if (editId !== undefined) {
      const g = (await getAll()).find(x => String(x.id) === String(editId));
      if (g) {
        Utils.el('galleryModalTitle').textContent = 'Edit Gallery Item';
        Utils.setVal('gm-title', g.title);
        Utils.el('gm-category').value = g.category || 'summit';
        Utils.setVal('gm-desc', g.desc);
        Utils.setVal('gm-img', g.img || '');
        Utils.setVal('gm-editId', g.id);
      }
    }
    Modal.open('galleryModal');
  }

  async function save() {
    const title = Utils.getVal('gm-title');
    const desc = Utils.getVal('gm-desc');
    const img = Utils.getVal('gm-img');

    if (!title || !desc || !img) {
      Toast.show('⚠️ All fields marked with * are required.', 'error');
      return;
    }

    const editId = Utils.getVal('gm-editId');
    const obj = {
      title,
      category: Utils.el('gm-category').value,
      desc,
      img
    };

    const token = sessionStorage.getItem('smps_api_token') || localStorage.getItem('smps_token');
    let savedSuccess = false;

    if (token) {
      try {
        let res;
        const headers = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        };
        if (editId && String(editId).match(/^\d+$/)) {
          res = await fetch(`/api/gallery/${editId}`, {
            method: 'PUT',
            headers,
            body: JSON.stringify(obj)
          });
        } else {
          res = await fetch('/api/gallery', {
            method: 'POST',
            headers,
            body: JSON.stringify(obj)
          });
        }
        if (res.ok) {
          savedSuccess = true;
          const listRes = await fetch('/api/gallery?_=' + Date.now());
          if (listRes.ok) {
            const list = await listRes.json();
            window._cachedGalleryData = list;
            await saveAll(list);
          }
        } else {
          const errData = await res.json();
          Toast.show(`⚠️ Server error: ${errData.error || 'Failed to save gallery item'}`, 'error');
          return;
        }
      } catch (e) {
        console.warn('Backend save gallery failed, saving locally only', e);
      }
    }

    if (!savedSuccess) {
      const list = await getAll();
      const newObj = { ...obj, id: editId ? editId : Utils.uid('gallery') };
      const updated = editId ? list.map(g => String(g.id) === String(editId) ? newObj : g) : [...list, newObj];
      await saveAll(updated);
      window._cachedGalleryData = updated;
    }

    Modal.close('galleryModal');
    render();
    Toast.show('✅ Gallery item saved!', 'success');
  }

  async function remove(id) {
    const yes = await Confirm.ask('Delete this gallery item? This cannot be undone.');
    if (!yes) return;

    const token = sessionStorage.getItem('smps_api_token') || localStorage.getItem('smps_token');
    if (token && String(id).match(/^\d+$/)) {
      try {
        await fetch(`/api/gallery/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
      } catch (e) { console.warn('Backend delete failed', e); }
    }

    const list = await getAll();
    const updated = list.filter(g => String(g.id) !== String(id));
    await saveAll(updated);
    window._cachedGalleryData = updated;
    render();
    Toast.show('🗑 Gallery item deleted.');
  }

  function init() {
    Utils.el('addGalleryBtn')?.addEventListener('click', () => openModal());
    Utils.el('saveGalleryBtn')?.addEventListener('click', save);

    Utils.el('galleryTableBody')?.addEventListener('click', (e) => {
      const editBtn   = e.target.closest('[data-edit]');
      const deleteBtn = e.target.closest('[data-delete]');
      if (editBtn)   openModal(editBtn.dataset.edit);
      if (deleteBtn) remove(deleteBtn.dataset.delete);
    });

    initTableSearch('gallerySearch', 'galleryTableBody');
  }

  return { init, render };
})();

/* ════════════════════════════════════════
   IP PORTFOLIO MODULE
   ════════════════════════════════════════ */

const IP = (() => {
  async function getAll() {
    try {
      const res = await fetch('/api/patents');
      if (res.ok) {
        const list = await res.json();
        if (Array.isArray(list)) {
          window._cachedPatentsData = list;
          try { await DataStore.saveList('patents', list); } catch (e) {}
          return list;
        }
      }
    } catch (e) {
      console.warn('Backend patents fetch failed, using cache', e);
    }

    if (window._cachedPatentsData !== undefined) return window._cachedPatentsData;
    try {
      const list = await DataStore.getList('patents', null);
      if (list !== null) return list;
    } catch (e) { console.warn('DataStore.getList failed for patents', e); }
    return Defaults.patents();
  }

  async function saveAll(list) {
    await DataStore.saveList('patents', list);
  }

  async function render() {
    const list = await getAll();
    const tbody = Utils.el('ipTableBody');
    if (!tbody) return;

    if (!Array.isArray(list) || list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state" style="padding:40px"><div class="es-icon">🔬</div><h3>No IP assets yet</h3><p>Add your first IP asset.</p></div></td></tr>`;
      return;
    }

    tbody.innerHTML = list.map(p => `
      <tr>
        <td>
          <div class="td-title">${Utils.sanitize(p.title)}</div>
          <div class="td-muted">${Utils.sanitize(p.desc?.substring(0, 50) || '')}...</div>
        </td>
        <td><span class="pill pill-purple">${Utils.sanitize(p.typeLabel || p.type)}</span></td>
        <td class="td-muted">${Utils.sanitize(p.year)}</td>
        <td><span class="pill pill-gold">${Utils.sanitize(p.statusLabel || p.status)}</span></td>
        <td class="td-actions">
          <button class="btn btn-secondary btn-sm" data-edit="${p.id}">✏️ Edit</button>
          <button class="btn btn-danger btn-sm"    data-delete="${p.id}">🗑</button>
        </td>
      </tr>
    `).join('');
  }

  async function openModal(editId) {
    Utils.setVal('im-editId', '');
    ['im-title', 'im-year', 'im-tags', 'im-desc'].forEach(id => Utils.setVal(id, ''));
    Utils.el('im-type').value = 'patent';
    Utils.el('im-status').value = 'granted';
    Utils.el('ipModalTitle').textContent = 'Add IP Asset';

    if (editId !== undefined) {
      const p = (await getAll()).find(x => String(x.id) === String(editId));
      if (p) {
        Utils.el('ipModalTitle').textContent = 'Edit IP Asset';
        Utils.setVal('im-title', p.title);
        Utils.el('im-type').value = p.type || 'patent';
        Utils.setVal('im-year', p.year);
        Utils.el('im-status').value = p.status || 'granted';
        Utils.setVal('im-tags', Array.isArray(p.tags) ? p.tags.join(', ') : (p.tags || ''));
        Utils.setVal('im-desc', p.desc);
        Utils.setVal('im-editId', p.id);
      }
    }
    Modal.open('ipModal');
  }

  async function save() {
    const title = Utils.getVal('im-title');
    const desc = Utils.getVal('im-desc');

    if (!title || !desc) {
      Toast.show('⚠️ Title and Description are required.', 'error');
      return;
    }

    const editId = Utils.getVal('im-editId');
    const typeVal = Utils.el('im-type').value;
    const statusVal = Utils.el('im-status').value;

    const obj = {
      title,
      type: typeVal,
      typeLabel: typeVal.charAt(0).toUpperCase() + typeVal.slice(1),
      year: Utils.getVal('im-year') || String(new Date().getFullYear()),
      status: statusVal,
      statusLabel: statusVal.charAt(0).toUpperCase() + statusVal.slice(1),
      tags: Utils.getVal('im-tags').split(',').map(t => t.trim()).filter(Boolean),
      desc
    };

    const token = sessionStorage.getItem('smps_api_token') || localStorage.getItem('smps_token');
    let savedSuccess = false;

    if (token) {
      try {
        let res;
        const headers = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        };
        if (editId && String(editId).match(/^\d+$/)) {
          res = await fetch(`/api/patents/${editId}`, {
            method: 'PUT',
            headers,
            body: JSON.stringify(obj)
          });
        } else {
          res = await fetch('/api/patents', {
            method: 'POST',
            headers,
            body: JSON.stringify(obj)
          });
        }
        if (res.ok) {
          savedSuccess = true;
          const listRes = await fetch('/api/patents');
          if (listRes.ok) {
            const list = await listRes.json();
            window._cachedPatentsData = list;
            await saveAll(list);
          }
        } else {
          const errData = await res.json();
          Toast.show(`⚠️ Server error: ${errData.error || 'Failed to save IP asset'}`, 'error');
          return;
        }
      } catch (e) {
        console.warn('Backend save patent failed, saving locally only', e);
      }
    }

    if (!savedSuccess) {
      const list = await getAll();
      const newObj = { ...obj, id: editId ? editId : Utils.uid('patent') };
      const updated = editId ? list.map(p => String(p.id) === String(editId) ? newObj : p) : [...list, newObj];
      await saveAll(updated);
      window._cachedPatentsData = updated;
    }

    Modal.close('ipModal');
    render();
    Toast.show('✅ IP asset saved!', 'success');
  }

  async function remove(id) {
    const yes = await Confirm.ask('Delete this IP asset? This cannot be undone.');
    if (!yes) return;

    const token = sessionStorage.getItem('smps_api_token') || localStorage.getItem('smps_token');
    if (token && String(id).match(/^\d+$/)) {
      try {
        await fetch(`/api/patents/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
      } catch (e) { console.warn('Backend delete failed', e); }
    }

    const list = await getAll();
    const updated = list.filter(p => String(p.id) !== String(id));
    await saveAll(updated);
    window._cachedPatentsData = updated;
    render();
    Toast.show('🗑 IP asset deleted.');
  }

  function init() {
    Utils.el('addIPBtn')?.addEventListener('click', () => openModal());
    Utils.el('saveIPBtn')?.addEventListener('click', save);

    Utils.el('ipTableBody')?.addEventListener('click', (e) => {
      const editBtn   = e.target.closest('[data-edit]');
      const deleteBtn = e.target.closest('[data-delete]');
      if (editBtn)   openModal(editBtn.dataset.edit);
      if (deleteBtn) remove(deleteBtn.dataset.delete);
    });

    initTableSearch('ipSearch', 'ipTableBody');

    document.querySelectorAll('.ip-sub-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.ip-sub-tab').forEach(b => {
          b.classList.remove('btn-primary', 'active');
          b.classList.add('btn-secondary');
        });
        btn.classList.remove('btn-secondary');
        btn.classList.add('btn-primary', 'active');

        const target = btn.dataset.subtab;
        document.querySelectorAll('.ip-subpage').forEach(page => {
          page.style.display = page.id === `ip-subpage-${target}` ? 'block' : 'none';
        });
        if (target === 'settings') IPSettings.loadFields();
      });
    });
  }

  return { init, render };
})();

/* ════════════════════════════════════════
   RESEARCH PAPERS MODULE
   ════════════════════════════════════════ */

const Research = (() => {
  async function getAll() {
    try {
      const res = await fetch('/api/research');
      if (res.ok) {
        const list = await res.json();
        if (Array.isArray(list)) {
          window._cachedResearchData = list;
          try { await DataStore.saveList('researchData', list); } catch (e) {}
          return list;
        }
      }
    } catch (e) {
      console.warn('Backend research fetch failed, using cache', e);
    }

    if (window._cachedResearchData !== undefined) return window._cachedResearchData;
    try {
      const list = await DataStore.getList('researchData', null);
      if (list !== null) return list;
    } catch (e) { console.warn('DataStore.getList failed for researchData', e); }
    return Defaults.research();
  }

  async function saveAll(list) {
    if (window.DataStore && typeof DataStore.saveList === 'function') {
      try { await DataStore.saveList('researchData', list); } catch (e) { console.warn('DataStore.saveList failed', e); }
    } else {
      Utils.lsSet('researchData', list);
    }
  }

  async function render() {
    const list = await getAll();
    const tbody = Utils.el('researchTableBody');
    if (!tbody) return;

    if (!Array.isArray(list) || list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state" style="padding:40px"><div class="es-icon">📚</div><h3>No research papers yet</h3></div></td></tr>`;
      return;
    }

    tbody.innerHTML = list.map(r => `
      <tr>
        <td>
          <div class="td-title">${Utils.sanitize(r.title)}</div>
          <div class="td-muted">${Utils.sanitize(r.desc?.substring(0, 70) || '')}...</div>
        </td>
        <td>
          <div class="td-title">${Utils.sanitize(r.journal)}</div>
          ${r.impactFactor ? `<div class="td-muted">Impact Factor: ${Utils.sanitize(r.impactFactor)}</div>` : ''}
        </td>
        <td class="td-muted">${Utils.sanitize(r.year)}</td>
        <td><code class="pill pill-blue">${Utils.sanitize(r.icon)}</code></td>
        <td class="td-actions">
          <button class="btn btn-secondary btn-sm" data-edit="${Utils.sanitize(r.id)}">✏️ Edit</button>
          <button class="btn btn-danger btn-sm"    data-delete="${Utils.sanitize(r.id)}">🗑</button>
        </td>
      </tr>
    `).join('');
  }

  async function openModal(editId) {
    Utils.setVal('rm-editId', '');
    ['rm-title', 'rm-journal', 'rm-impactFactor', 'rm-year', 'rm-icon', 'rm-desc'].forEach(id => Utils.setVal(id, ''));
    Utils.el('researchModalTitle').textContent = 'Add Research Paper';

    if (editId) {
      const r = (await getAll()).find(x => String(x.id) === String(editId));
      if (r) {
        Utils.el('researchModalTitle').textContent = 'Edit Research Paper';
        Utils.setVal('rm-title', r.title);
        Utils.setVal('rm-journal', r.journal);
        Utils.setVal('rm-impactFactor', r.impactFactor || '');
        Utils.setVal('rm-year', r.year);
        Utils.setVal('rm-icon', r.icon);
        Utils.setVal('rm-desc', r.desc);
        Utils.setVal('rm-editId', r.id);
      }
    }
    Modal.open('researchModal');
  }

  async function save() {
    const title = Utils.getVal('rm-title');
    const journal = Utils.getVal('rm-journal');
    const icon = Utils.getVal('rm-icon');
    const desc = Utils.getVal('rm-desc');

    if (!title || !journal || !icon || !desc) {
      Toast.show('⚠️ All fields marked with * are required.', 'error');
      return;
    }

    const editId = Utils.getVal('rm-editId');
    const obj = {
      icon,
      title,
      desc,
      year: Utils.getVal('rm-year') || String(new Date().getFullYear()),
      journal,
      impactFactor: Utils.getVal('rm-impactFactor') || '',
    };

    const token = sessionStorage.getItem('smps_api_token') || localStorage.getItem('smps_token');
    let savedSuccess = false;

    if (token) {
      try {
        let res;
        const headers = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        };
        if (editId && String(editId).match(/^\d+$/)) {
          res = await fetch(`/api/research/${editId}`, {
            method: 'PUT',
            headers,
            body: JSON.stringify(obj)
          });
        } else {
          res = await fetch('/api/research', {
            method: 'POST',
            headers,
            body: JSON.stringify(obj)
          });
        }
        if (res.ok) {
          savedSuccess = true;
          const listRes = await fetch('/api/research');
          if (listRes.ok) {
            const list = await listRes.json();
            window._cachedResearchData = list;
            await saveAll(list);
          }
        } else {
          const errData = await res.json();
          Toast.show(`⚠️ Server error: ${errData.error || 'Failed to save research paper'}`, 'error');
          return;
        }
      } catch (e) {
        console.warn('Backend save research failed, saving locally only', e);
      }
    }

    if (!savedSuccess) {
      const list = await getAll();
      const newObj = { ...obj, id: editId ? editId : Utils.uid('R') };
      const updated = editId ? list.map(r => String(r.id) === String(editId) ? newObj : r) : [...list, newObj];
      await saveAll(updated);
      window._cachedResearchData = updated;
    }

    Modal.close('researchModal');
    render();
    Toast.show('✅ Research paper saved!', 'success');
  }

  async function remove(id) {
    const yes = await Confirm.ask('Delete this research paper? This cannot be undone.');
    if (!yes) return;

    const token = sessionStorage.getItem('smps_api_token') || localStorage.getItem('smps_token');
    if (token && String(id).match(/^\d+$/)) {
      try {
        await fetch(`/api/research/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
      } catch (e) { console.warn('Backend delete failed', e); }
    }

    const list = await getAll();
    const updated = list.filter(r => String(r.id) !== String(id));
    await saveAll(updated);
    window._cachedResearchData = updated;
    render();
    Toast.show('🗑 Research paper deleted.');
  }

  function init() {
    Utils.el('addResearchBtn')?.addEventListener('click', () => openModal());
    Utils.el('saveResearchBtn')?.addEventListener('click', save);

    Utils.el('researchTableBody')?.addEventListener('click', (e) => {
      const editBtn = e.target.closest('[data-edit]');
      const deleteBtn = e.target.closest('[data-delete]');
      if (editBtn) openModal(editBtn.dataset.edit);
      if (deleteBtn) remove(deleteBtn.dataset.delete);
    });

    initTableSearch('researchSearch', 'researchTableBody');
  }

  return { init, render };
})();

/* ════════════════════════════════════════
   COLLABORATIVE MODELS MODULE
   ════════════════════════════════════════ */

const Licensing = (() => {
  async function getAll() {
    try {
      const res = await fetch('/api/licensing');
      if (res.ok) {
        const list = await res.json();
        if (Array.isArray(list)) {
          window._cachedLicensingData = list;
          try { await DataStore.saveList('licensingData', list); } catch (e) {}
          return list;
        }
      }
    } catch (e) {
      console.warn('Backend licensing fetch failed, using cache', e);
    }

    if (window._cachedLicensingData !== undefined) return window._cachedLicensingData;
    try {
      const list = await DataStore.getList('licensingData', null);
      if (list !== null) return list;
    } catch (e) { console.warn('DataStore.getList failed for licensingData', e); }
    return Defaults.licensing();
  }

  async function saveAll(list) {
    if (window.DataStore && typeof DataStore.saveList === 'function') {
      try { await DataStore.saveList('licensingData', list); } catch (e) { console.warn('DataStore.saveList failed', e); }
    } else {
      Utils.lsSet('licensingData', list);
    }
  }

  async function render() {
    const list = await getAll();
    const tbody = Utils.el('licensingTableBody');
    if (!tbody) return;

    if (!Array.isArray(list) || list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4"><div class="empty-state" style="padding:40px"><div class="es-icon">🤝</div><h3>No collaborative models yet</h3></div></td></tr>`;
      return;
    }

    tbody.innerHTML = list.map(l => `
      <tr>
        <td><div class="td-title">${Utils.sanitize(l.title)}</div></td>
        <td class="td-muted">${Utils.sanitize(l.desc)}</td>
        <td><code class="pill pill-blue">${Utils.sanitize(l.icon)}</code></td>
        <td class="td-actions">
          <button class="btn btn-secondary btn-sm" data-edit="${Utils.sanitize(l.id)}">✏️ Edit</button>
          <button class="btn btn-danger btn-sm"    data-delete="${Utils.sanitize(l.id)}">🗑</button>
        </td>
      </tr>
    `).join('');
  }

  async function openModal(editId) {
    Utils.setVal('lm-editId', '');
    ['lm-title', 'lm-icon', 'lm-desc'].forEach(id => Utils.setVal(id, ''));
    Utils.el('licensingModalTitle').textContent = 'Add Collaborative Model';

    if (editId) {
      const l = (await getAll()).find(x => String(x.id) === String(editId));
      if (l) {
        Utils.el('licensingModalTitle').textContent = 'Edit Collaborative Model';
        Utils.setVal('lm-title', l.title);
        Utils.setVal('lm-icon', l.icon);
        Utils.setVal('lm-desc', l.desc);
        Utils.setVal('lm-editId', l.id);
      }
    }
    Modal.open('licensingModal');
  }

  async function save() {
    const title = Utils.getVal('lm-title');
    const icon = Utils.getVal('lm-icon');
    const desc = Utils.getVal('lm-desc');

    if (!title || !icon || !desc) {
      Toast.show('⚠️ All fields marked with * are required.', 'error');
      return;
    }

    const editId = Utils.getVal('lm-editId');
    const obj = {
      icon,
      title,
      desc
    };

    const token = sessionStorage.getItem('smps_api_token') || localStorage.getItem('smps_token');
    let savedSuccess = false;

    if (token) {
      try {
        let res;
        const headers = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        };
        if (editId && String(editId).match(/^\d+$/)) {
          res = await fetch(`/api/licensing/${editId}`, {
            method: 'PUT',
            headers,
            body: JSON.stringify(obj)
          });
        } else {
          res = await fetch('/api/licensing', {
            method: 'POST',
            headers,
            body: JSON.stringify(obj)
          });
        }
        if (res.ok) {
          savedSuccess = true;
          const listRes = await fetch('/api/licensing');
          if (listRes.ok) {
            const list = await listRes.json();
            window._cachedLicensingData = list;
            await saveAll(list);
          }
        } else {
          const errData = await res.json();
          Toast.show(`⚠️ Server error: ${errData.error || 'Failed to save collaborative model'}`, 'error');
          return;
        }
      } catch (e) {
        console.warn('Backend save licensing failed, saving locally only', e);
      }
    }

    if (!savedSuccess) {
      const list = await getAll();
      const newObj = { ...obj, id: editId ? editId : Utils.uid('L') };
      const updated = editId ? list.map(l => String(l.id) === String(editId) ? newObj : l) : [...list, newObj];
      await saveAll(updated);
      window._cachedLicensingData = updated;
    }

    Modal.close('licensingModal');
    render();
    Toast.show('✅ Model saved!', 'success');
  }

  async function remove(id) {
    const yes = await Confirm.ask('Delete this collaborative model? This cannot be undone.');
    if (!yes) return;

    const token = sessionStorage.getItem('smps_api_token') || localStorage.getItem('smps_token');
    if (token && String(id).match(/^\d+$/)) {
      try {
        await fetch(`/api/licensing/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
      } catch (e) { console.warn('Backend delete failed', e); }
    }

    const list = await getAll();
    const updated = list.filter(l => String(l.id) !== String(id));
    await saveAll(updated);
    window._cachedLicensingData = updated;
    render();
    Toast.show('🗑 Model deleted.');
  }

  function init() {
    Utils.el('addLicensingBtn')?.addEventListener('click', () => openModal());
    Utils.el('saveLicensingBtn')?.addEventListener('click', save);

    Utils.el('licensingTableBody')?.addEventListener('click', (e) => {
      const editBtn = e.target.closest('[data-edit]');
      const deleteBtn = e.target.closest('[data-delete]');
      if (editBtn) openModal(editBtn.dataset.edit);
      if (deleteBtn) remove(deleteBtn.dataset.delete);
    });

    initTableSearch('licensingSearch', 'licensingTableBody');
  }

  return { init, render };
})();

/* ════════════════════════════════════════
   IP SETTINGS MODULE
   ════════════════════════════════════════ */

const IPSettings = (() => {
  const FIELDS = [
    'ip-heroTitle', 'ip-heroDesc',
    'ip-stat1Num', 'ip-stat1Lbl',
    'ip-stat2Num', 'ip-stat2Lbl',
    'ip-stat3Num', 'ip-stat3Lbl',
    'ip-stat4Num', 'ip-stat4Lbl',
    'ip-stat5Num', 'ip-stat5Lbl',
    'ip-stat6Num', 'ip-stat6Lbl',
    'ip-projBadge', 'ip-projTitle',
    'ip-resBadge', 'ip-resTitle',
    'ip-licBadge', 'ip-licTitle',
    'ip-ctaTitle', 'ip-ctaDesc',
    'ip-ctaBtn'
  ];

  function applyFields(d) {
    const defaults = Defaults.ipSettings();
    FIELDS.forEach(f => {
      const key = f.replace('ip-', '');
      Utils.setVal(f, d[key] !== undefined ? d[key] : (defaults[key] || ''));
    });
  }

  async function getSettings() {
    try {
      const res = await fetch('/api/ip/settings');
      if (res.ok) {
        const data = await res.json();
        if (data && Object.keys(data).length) return data;
      }
    } catch (e) {
      console.warn('Failed to load IP settings from local backend:', e);
    }

    try {
      const local = await DataStore.getDocument('ipData', Defaults.ipSettings());
      if (local && Object.keys(local).length) return local;
    } catch (e) { console.warn('DataStore.getDocument failed for ipData', e); }
    return Defaults.ipSettings();
  }

  async function loadFields() {
    const data = await getSettings();
    applyFields(data);
  }

  async function save() {
    const d = {};
    FIELDS.forEach(f => {
      const key = f.replace('ip-', '');
      d[key] = Utils.getVal(f);
    });

    const token = sessionStorage.getItem('smps_api_token') || localStorage.getItem('smps_token');
    if (token) {
      try {
        await fetch('/api/ip/settings', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(d)
        });
      } catch (e) {
        console.warn('Failed to save IP settings to local backend:', e);
      }
    }

    await DataStore.saveDocument('ipData', d);
    Toast.show('✅ Hero & Stats saved!', 'success');
  }

  function init() {
    Utils.el('saveIpSettingsBtn')?.addEventListener('click', save);
    loadFields();
  }

  return { init, loadFields };
})();

/* ════════════════════════════════════════
   CAREERS / JOBS MODULE
   ════════════════════════════════════════ */

const Jobs = (() => {
  const TYPE_COLORS = { 'Full-time': 'pill-blue', 'Internship': 'pill-purple', 'Contract': 'pill-gold', 'Part-time': 'pill-cyan' };

  async function getAll()      { return DataStore.getList('jobs', Defaults.jobs()); }
  function saveAll(list) { DataStore.saveList('jobs', list); }

  async function render() {
    const jobs  = await getAll();
    const tbody = Utils.el('jobTableBody');
    if (!tbody) return;

    if (!Array.isArray(jobs) || jobs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state" style="padding:40px"><div class="es-icon">🎓</div><h3>No openings yet</h3></div></td></tr>`;
      return;
    }

    tbody.innerHTML = jobs.map(j => `
      <tr>
        <td class="td-title">${Utils.sanitize(j.title)}</td>
        <td><span class="pill ${TYPE_COLORS[j.type] || 'pill-blue'}">${Utils.sanitize(j.type)}</span></td>
        <td class="td-muted">${Utils.sanitize(j.dept)}</td>
        <td><span class="pill ${j.status === 'open' ? 'pill-green' : 'pill-red'}">${j.status === 'open' ? 'Open' : 'Closed'}</span></td>
        <td class="td-actions">
          <button class="btn btn-secondary btn-sm" data-edit="${Utils.sanitize(j.id)}">✏️ Edit</button>
          <button class="btn btn-danger btn-sm"    data-delete="${Utils.sanitize(j.id)}">🗑</button>
        </td>
      </tr>
    `).join('');
  }

  async function openModal(editId) {
    Utils.setVal('jm-editId', '');
    ['jm-title', 'jm-dept', 'jm-loc', 'jm-desc', 'jm-req'].forEach(id => Utils.setVal(id, ''));
    Utils.el('jm-type').value   = 'Full-time';
    Utils.el('jm-status').value = 'open';
    Utils.el('jobModalTitle').textContent = 'Post New Opening';

    if (editId) {
      const j = (await getAll()).find(x => x.id === editId);
      if (j) {
        Utils.el('jobModalTitle').textContent = 'Edit Opening';
        Utils.setVal('jm-title', j.title);
        Utils.setVal('jm-dept',  j.dept);
        Utils.setVal('jm-loc',   j.loc);
        Utils.setVal('jm-desc',  j.desc);
        Utils.setVal('jm-req',   (j.requirements || []).join('\n'));
        Utils.el('jm-type').value   = j.type;
        Utils.el('jm-status').value = j.status;
        Utils.setVal('jm-editId', j.id);
      }
    }
    Modal.open('jobModal');
  }

  async function save() {
    const title = Utils.getVal('jm-title');
    if (!title) { Toast.show('⚠️ Position title is required.', 'error'); return; }

    const editId = Utils.getVal('jm-editId');
    const obj = {
      id:     editId || Utils.uid('J'),
      title,
      type:   Utils.el('jm-type').value,
      dept:   Utils.getVal('jm-dept'),
      loc:    Utils.getVal('jm-loc'),
      status: Utils.el('jm-status').value,
      desc:   Utils.getVal('jm-desc'),
      requirements: Utils.getVal('jm-req').split('\n').map(r => r.trim()).filter(Boolean),
    };

    const jobs = await getAll();
    const updated = editId ? jobs.map(j => j.id === editId ? obj : j) : [...jobs, obj];

    saveAll(updated);
    Modal.close('jobModal');
    render();
    Toast.show('✅ Opening saved!', 'success');
  }

  async function remove(id) {
    const yes = await Confirm.ask('Delete this job opening? This cannot be undone.');
    if (!yes) return;
    const jobs = await getAll();
    saveAll(jobs.filter(j => j.id !== id));
    render();
    Toast.show('🗑 Opening deleted.');
  }

  function init() {
    Utils.el('addJobBtn')?.addEventListener('click', () => openModal());
    Utils.el('saveJobBtn')?.addEventListener('click', save);

    Utils.el('jobTableBody')?.addEventListener('click', (e) => {
      const editBtn   = e.target.closest('[data-edit]');
      const deleteBtn = e.target.closest('[data-delete]');
      if (editBtn)   openModal(editBtn.dataset.edit);
      if (deleteBtn) remove(deleteBtn.dataset.delete);
    });

    initTableSearch('jobSearch', 'jobTableBody');
  }

  return { init, render };
})();

/* ════════════════════════════════════════
   BLOG / INSIGHTS MODULE
   ════════════════════════════════════════ */

const Blogs = (() => {
  const CAT_COLORS = { Research: 'pill-purple', Industry: 'pill-blue', Innovation: 'pill-cyan', Policy: 'pill-gold', Events: 'pill-green' };

  async function getAll()      { return DataStore.getList('blogs', Defaults.blogs()); }
  function saveAll(list) { DataStore.saveList('blogs', list); }

  async function render() {
    const blogs = await getAll();
    const tbody = Utils.el('blogTableBody');
    if (!tbody) return;

    if (!Array.isArray(blogs) || blogs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state" style="padding:40px"><div class="es-icon">💡</div><h3>No posts yet</h3></div></td></tr>`;
      return;
    }

    tbody.innerHTML = blogs.map(b => `
      <tr>
        <td>
          <div class="td-title">${Utils.sanitize(b.title)}</div>
          <div class="td-muted">${Utils.sanitize(b.summary?.substring(0, 60) || '')}...</div>
        </td>
        <td><span class="pill ${CAT_COLORS[b.category] || 'pill-blue'}">${Utils.sanitize(b.category)}</span></td>
        <td class="td-muted">${Utils.sanitize(b.date || '')}</td>
        <td><span class="pill ${b.status === 'Published' ? 'pill-green' : 'pill-gold'}">${Utils.sanitize(b.status)}</span></td>
        <td class="td-actions">
          <button class="btn btn-secondary btn-sm" data-edit="${Utils.sanitize(b.id)}">✏️ Edit</button>
          <button class="btn btn-danger btn-sm"    data-delete="${Utils.sanitize(b.id)}">🗑</button>
        </td>
      </tr>
    `).join('');
  }

  async function openModal(editId) {
    Utils.setVal('bm-editId', '');
    ['bm-title', 'bm-author', 'bm-readtime', 'bm-summary', 'bm-content', 'bm-tags'].forEach(id => Utils.setVal(id, ''));
    Utils.el('bm-cat').value    = 'Research';
    Utils.el('bm-status').value = 'Published';
    Utils.el('blogModalTitle').textContent = 'New Blog Post';

    if (editId) {
      const b = (await getAll()).find(x => x.id === editId);
      if (b) {
        Utils.el('blogModalTitle').textContent = 'Edit Post';
        Utils.setVal('bm-title',    b.title);
        Utils.setVal('bm-author',   b.author);
        Utils.setVal('bm-readtime', b.readtime);
        Utils.setVal('bm-summary',  b.summary);
        Utils.setVal('bm-content',  b.content || '');
        Utils.setVal('bm-tags',     (b.tags || []).join(', '));
        Utils.el('bm-cat').value    = b.category;
        Utils.el('bm-status').value = b.status;
        Utils.setVal('bm-editId', b.id);
      }
    }
    Modal.open('blogModal');
  }

  async function save() {
    const title = Utils.getVal('bm-title');
    if (!title) { Toast.show('⚠️ Post title is required.', 'error'); return; }

    const editId = Utils.getVal('bm-editId');
    const obj = {
      id:       editId || Utils.uid('B'),
      title,
      category: Utils.el('bm-cat').value,
      author:   Utils.getVal('bm-author'),
      readtime: Utils.getVal('bm-readtime'),
      status:   Utils.el('bm-status').value,
      summary:  Utils.getVal('bm-summary'),
      content:  Utils.getVal('bm-content'),
      tags:     Utils.getVal('bm-tags').split(',').map(t => t.trim()).filter(Boolean),
      date:     new Date().toISOString().split('T')[0],
    };

    const blogs = await getAll();
    const updated = editId ? blogs.map(b => b.id === editId ? obj : b) : [...blogs, obj];

    saveAll(updated);
    Modal.close('blogModal');
    render();
    Toast.show('✅ Post saved!', 'success');
  }

  async function remove(id) {
    const yes = await Confirm.ask('Delete this blog post? This cannot be undone.');
    if (!yes) return;
    const blogs = await getAll();
    saveAll(blogs.filter(b => b.id !== id));
    render();
    Toast.show('🗑 Post deleted.');
  }

  function init() {
    Utils.el('addBlogBtn')?.addEventListener('click', () => openModal());
    Utils.el('saveBlogBtn')?.addEventListener('click', save);

    Utils.el('blogTableBody')?.addEventListener('click', (e) => {
      const editBtn   = e.target.closest('[data-edit]');
      const deleteBtn = e.target.closest('[data-delete]');
      if (editBtn)   openModal(editBtn.dataset.edit);
      if (deleteBtn) remove(deleteBtn.dataset.delete);
    });

    initTableSearch('blogSearch', 'blogTableBody');
  }

  return { init, render };
})();

/* ════════════════════════════════════════
   COLLABORATE MODULE
   ════════════════════════════════════════ */

const Collab = (() => {
  const FIELDS = [
    'col-heroTitle', 'col-heroDesc',
    'col-ac-smpsTag', 'col-ac-smpsTitle', 'col-ac-smpsDesc',
    'col-ac-acadTag', 'col-ac-acadTitle', 'col-ac-acadDesc',
    'col-ac-studTag', 'col-ac-studTitle', 'col-ac-studDesc',
    'col-in-smpsTag', 'col-in-smpsTitle', 'col-in-smpsDesc',
    'col-in-indTag', 'col-in-indTitle', 'col-in-indDesc',
    'col-in-empTag', 'col-in-empTitle', 'col-in-empDesc',
    'col-st-smpsTag', 'col-st-smpsTitle', 'col-st-smpsDesc',
    'col-st-startTag', 'col-st-startTitle', 'col-st-startDesc',
    'col-st-innTag', 'col-st-innTitle', 'col-st-innDesc',
    'col-gv-smpsTag', 'col-gv-smpsTitle', 'col-gv-smpsDesc',
    'col-gv-govTag', 'col-gv-govTitle', 'col-gv-govDesc',
    'col-gv-pubTag', 'col-gv-pubTitle', 'col-gv-pubDesc',
    'col-procBadge', 'col-procTitle', 'col-procSub',
    'col-step1Title', 'col-step1Desc',
    'col-step2Title', 'col-step2Desc',
    'col-step3Title', 'col-step3Desc',
    'col-step4Title', 'col-step4Desc',
    'col-storyBadge', 'col-storyTitle',
    'col-formBadge', 'col-formTitle', 'col-formDesc',
    'col-formEmail', 'col-formPhone'
  ];

  function applyFields(d) {
    const defaults = Defaults.collabSettings();
    FIELDS.forEach(f => {
      const key = f.replace('col-', '');
      Utils.setVal(f, d[key] !== undefined ? d[key] : (defaults[key] || ''));
    });
  }

  async function loadFields() {
    try {
      const res = await fetch('/api/settings/collabData');
      if (res.ok) {
        const data = await res.json();
        if (data && Object.keys(data).length) {
          applyFields(data);
          return;
        }
      }
    } catch (e) {
      console.warn('Failed to load collab settings from local backend:', e);
    }
    const local = await DataStore.getDocument('collabData', Defaults.collabSettings());
    applyFields(local);
  }

  async function save() {
    const d = {};
    FIELDS.forEach(f => {
      const key = f.replace('col-', '');
      d[key] = Utils.getVal(f);
    });
    const token = localStorage.getItem('smps_token');
    if (token) {
      try {
        await fetch('/api/settings/collabData', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(d)
        });
      } catch (e) {
        console.warn('Failed to save collab settings to local backend:', e);
      }
    }
    await DataStore.saveDocument('collabData', d);
    Toast.show('✅ Collaborate settings saved!', 'success');
  }

  function init() {
    Utils.el('saveCollabBtn')?.addEventListener('click', save);
    loadFields();
  }

  return { init, loadFields };
})();

const Proposals = (() => {
  let activeProposal = null;

  function renderRows(list) {
    return list.map((p, idx) => `
      <tr style="cursor:pointer" data-idx="${idx}">
        <td>${Utils.sanitize(`${p.fname} ${p.lname}`)}</td>
        <td>${Utils.sanitize(p.email)}</td>
        <td>${Utils.sanitize(p.org)}</td>
        <td>${Utils.sanitize(p.type)}</td>
        <td>${Utils.sanitize(p.date ? new Date(p.date).toLocaleString() : '')}</td>
      </tr>
    `).join('');
  }

  async function getAll() {
    try {
      const token = sessionStorage.getItem('smps_api_token') || localStorage.getItem('smps_token');
      if (token) {
        const res = await fetch('/api/proposals', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const list = await res.json();
          if (Array.isArray(list)) {
            window._cachedProposals = list;
            try { await DataStore.saveList('proposals', list); } catch (e) {}
            return list;
          }
        }
      }
    } catch (e) {
      console.warn('Backend proposals fetch failed, using local/DataStore cache', e);
    }

    if (window._cachedProposals !== undefined) return window._cachedProposals;
    try {
      const list = await DataStore.getList('proposals', []);
      if (list !== null) return list;
    } catch (e) { console.warn('DataStore.getList failed for proposals', e); }
    return [];
  }

  async function render() {
    const list = await getAll();
    const tbody = Utils.el('proposalTableBody');
    if (!tbody) return;
    tbody.innerHTML = list.length ? renderRows(list) : '<tr><td colspan="5"><div class="empty-state" style="padding:32px"><div class="es-icon">📭</div><h3>No proposals yet</h3><p>New requests will appear here once submitted.</p></div></td></tr>';
  }

  async function viewProposal(idx) {
    const list = await getAll();
    const p = list[idx];
    if (!p) return;
    activeProposal = p;

    const modalBody = Utils.el('proposalModalBody');
    if (modalBody) {
      modalBody.innerHTML = `
        <div style="margin-bottom:12px;"><strong>From:</strong> ${Utils.sanitize(`${p.fname} ${p.lname}`)} (${Utils.sanitize(p.email)})</div>
        <div style="margin-bottom:12px;"><strong>Organization:</strong> ${Utils.sanitize(p.org || 'None')}</div>
        <div style="margin-bottom:12px;"><strong>Partnership Type:</strong> <span class="pill pill-blue">${Utils.sanitize(p.type)}</span></div>
        <div style="margin-bottom:12px;"><strong>Submitted On:</strong> ${Utils.sanitize(p.date ? new Date(p.date).toLocaleString() : '')}</div>
        <hr style="border:0; border-top:1px solid var(--border); margin:16px 0;" />
        <div style="white-space:pre-wrap; background:var(--bg-light); padding:16px; border-radius:8px; color:var(--text); font-family:inherit;">${Utils.sanitize(p.msg || '(No message content)')}</div>
      `;
    }
    Modal.open('proposalModal');
  }

  async function deleteProposal() {
    if (!activeProposal) return;
    const yes = await Confirm.ask('Delete this proposal? This cannot be undone.');
    if (!yes) return;

    if (activeProposal.id) {
      try {
        const token = sessionStorage.getItem('smps_api_token') || localStorage.getItem('smps_token');
        await fetch(`/api/proposals/${activeProposal.id}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` }
        });
      } catch (e) {
        console.warn('Backend proposal delete failed', e);
      }
    }

    // Update local cache
    const list = await getAll();
    const updated = list.filter(item => item.id !== activeProposal.id);
    window._cachedProposals = updated;
    try { await DataStore.saveList('proposals', updated); } catch (e) {}

    Modal.close('proposalModal');
    activeProposal = null;
    await render();
    Toast.show('🗑 Proposal deleted.');
  }

  function init() {
    Utils.el('clearProposalsBtn')?.addEventListener('click', async () => {
      const yes = await Confirm.ask('Clear ALL proposals? This cannot be undone.', 'Clear Proposals');
      if (!yes) return;

      try {
        const token = sessionStorage.getItem('smps_api_token') || localStorage.getItem('smps_token');
        await fetch('/api/proposals', {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` }
        });
      } catch (e) {
        console.warn('Backend clear proposals failed', e);
      }

      window._cachedProposals = [];
      try { await DataStore.saveList('proposals', []); } catch (e) {}
      await render();
      Toast.show('🗑 All proposals cleared.');
    });

    Utils.el('proposalTableBody')?.addEventListener('click', (e) => {
      const row = e.target.closest('tr[data-idx]');
      if (row) {
        viewProposal(parseInt(row.dataset.idx));
      }
    });

    Utils.el('deleteProposalBtn')?.addEventListener('click', deleteProposal);
    initTableSearch('proposalSearch', 'proposalTableBody');
  }

  return { init, render };
})();

/* ════════════════════════════════════════
   ECOSYSTEM MODULE
   ════════════════════════════════════════ */

const Ecosystem = (() => {
  async function loadFields() {
    const local = Utils.lsGet('ecosystemData', {});
    renderAllianceList(local.alliances || Defaults.alliances());
    renderEventList(local.events || Defaults.events());

    const remote = await DataStore.getDocument('ecosystemData', local);
    if (remote) {
      renderAllianceList(remote.alliances || Defaults.alliances());
      renderEventList(remote.events || Defaults.events());
    }
  }

  function renderAllianceList(list) {
    const container = Utils.el('allianceList');
    if (!container) return;
    container.innerHTML = list.map((a, i) => `
      <div class="dynamic-row alliance-row" data-idx="${i}">
        <input type="text" class="dyn-input" data-f="icon"  value="${Utils.sanitize(a.icon)}" placeholder="🔗" style="text-align:center;font-size:18px">
        <input type="text" class="dyn-input" data-f="name"  value="${Utils.sanitize(a.name)}" placeholder="Alliance name">
        <input type="text" class="dyn-input" data-f="desc"  value="${Utils.sanitize(a.desc)}" placeholder="Description">
        <button class="btn btn-danger btn-sm remove-alliance" data-idx="${i}">✕</button>
      </div>
    `).join('');
  }

  function collectAlliances() {
    return [...document.querySelectorAll('#allianceList .dynamic-row')].map(row => ({
      icon: row.querySelector('[data-f="icon"]')?.value || '',
      name: row.querySelector('[data-f="name"]')?.value || '',
      desc: row.querySelector('[data-f="desc"]')?.value || '',
    }));
  }

  function renderEventList(list) {
    const container = Utils.el('eventList');
    if (!container) return;
    container.innerHTML = list.map((e, i) => `
      <div class="dynamic-row event-row" data-idx="${i}">
        <input type="text" class="dyn-input" data-f="title"    value="${Utils.sanitize(e.title)}"    placeholder="Event title">
        <input type="date" class="dyn-input" data-f="date"     value="${Utils.sanitize(e.date)}">
        <input type="text" class="dyn-input" data-f="location" value="${Utils.sanitize(e.location)}" placeholder="Location">
        <button class="btn btn-danger btn-sm remove-event" data-idx="${i}">✕</button>
      </div>
    `).join('');
  }

  function collectEvents() {
    return [...document.querySelectorAll('#eventList .dynamic-row')].map(row => ({
      title:    row.querySelector('[data-f="title"]')?.value    || '',
      date:     row.querySelector('[data-f="date"]')?.value     || '',
      location: row.querySelector('[data-f="location"]')?.value || '',
    }));
  }

  function save() {
    const payload = { alliances: collectAlliances(), events: collectEvents() };
    DataStore.saveDocument('ecosystemData', payload);
    Toast.show('✅ Ecosystem page saved!', 'success');
  }

  function init() {
    Utils.el('saveEcosystemBtn')?.addEventListener('click', save);

    Utils.el('addAllianceBtn')?.addEventListener('click', () => {
      const a = collectAlliances();
      a.push({ icon: '🔗', name: '', desc: '' });
      renderAllianceList(a);
    });

    Utils.el('addEventBtn')?.addEventListener('click', () => {
      const e = collectEvents();
      e.push({ title: '', date: '', location: '' });
      renderEventList(e);
    });

    // Event delegation for removes
    Utils.el('allianceList')?.addEventListener('click', (e) => {
      if (e.target.classList.contains('remove-alliance')) {
        const a = collectAlliances();
        a.splice(parseInt(e.target.dataset.idx), 1);
        renderAllianceList(a);
      }
    });

    Utils.el('eventList')?.addEventListener('click', (e) => {
      if (e.target.classList.contains('remove-event')) {
        const ev = collectEvents();
        ev.splice(parseInt(e.target.dataset.idx), 1);
        renderEventList(ev);
      }
    });
  }

  return { init, loadFields };
})();

/* ════════════════════════════════════════
   MESSAGES MODULE
   ════════════════════════════════════════ */

const Messages = (() => {
  let selectedIdx = -1;

  async function getAll() {
    try {
      const token = sessionStorage.getItem('smps_api_token') || localStorage.getItem('smps_token');
      if (token) {
        const res = await fetch('/api/messages', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const list = await res.json();
          if (Array.isArray(list)) {
            window._cachedContactMessages = list;
            try { await DataStore.saveList('contactMessages', list); } catch (e) {}
            return list;
          }
        }
      }
    } catch (e) {
      console.warn('Backend messages fetch failed, using local/DataStore cache', e);
    }

    if (window._cachedContactMessages !== undefined) return window._cachedContactMessages;
    try {
      const list = await DataStore.getList('contactMessages', []);
      if (list !== null) return list;
    } catch (e) { console.warn('DataStore.getList failed for contactMessages', e); }
    return [];
  }

  async function saveAll(list) { 
    window._cachedContactMessages = list;
    try { await DataStore.saveList('contactMessages', list); } catch (e) {}
  }

  async function render() {
    const msgs = await getAll();
    const container = Utils.el('msgListInner');
    if (!container) return;

    if (!Array.isArray(msgs) || msgs.length === 0) {
      container.innerHTML = `<div class="empty-state" style="padding:40px"><div class="es-icon">📭</div><h3>No messages</h3><p>Form submissions appear here.</p></div>`;
      return;
    }

    const reversed = [...msgs].map((m, origIdx) => ({ ...m, origIdx })).reverse();

    container.innerHTML = reversed.map((m, i) => `
      <div class="msg-item ${!m.read ? 'unread' : ''} ${selectedIdx === m.origIdx ? 'active' : ''}"
           data-orig="${m.origIdx}">
        <div class="msg-sender">
          <span class="msg-sender-name">${Utils.sanitize(m.fname || '')} ${Utils.sanitize(m.lname || '')}</span>
          ${!m.read ? '<div class="unread-dot"></div>' : ''}
        </div>
        <div class="msg-subject">${Utils.sanitize(m.subject || '(No subject)')}</div>
        <div class="msg-preview">${Utils.sanitize(m.msg?.substring(0, 50) || '')}...</div>
      </div>
    `).join('');
  }

  async function viewMsg(origIdx) {
    const msgs = await getAll();
    const m = msgs[origIdx];
    if (!m) return;

    selectedIdx = origIdx;
    msgs[origIdx].read = true;

    if (m.id) {
      try {
        const token = sessionStorage.getItem('smps_api_token') || localStorage.getItem('smps_token');
        await fetch(`/api/messages/${m.id}/read`, {
          method: 'PUT',
          headers: { 'Authorization': `Bearer ${token}` }
        });
      } catch (e) {
        console.warn('Backend mark message read failed', e);
      }
    }

    await saveAll(msgs);

    Dashboard.updateMsgBadge();

    const detail = Utils.el('msgDetail');
    if (detail) {
      detail.innerHTML = `
        <div class="msg-detail-header">
          <div class="msg-detail-subject">${Utils.sanitize(m.subject || '(No subject)')}</div>
          <div class="msg-meta-row">
            <div class="msg-meta"><strong>From:</strong> ${Utils.sanitize(m.fname || '')} ${Utils.sanitize(m.lname || '')} &lt;${Utils.sanitize(m.email || '')}&gt;</div>
          </div>
          ${m.inquiryType ? `<div class="msg-meta-row"><div class="msg-meta"><strong>Type:</strong> <span class="pill pill-blue">${Utils.sanitize(m.inquiryType)}</span></div></div>` : ''}
          ${m.date ? `<div class="msg-meta-row"><div class="msg-meta"><strong>Date:</strong> ${Utils.sanitize(Utils.fmtDate(m.date))}</div></div>` : ''}
          <div class="msg-meta-row" style="margin-top:12px">
            <button class="btn btn-danger btn-sm" id="deleteMsgBtn">🗑 Delete</button>
          </div>
        </div>
        <div class="msg-body">${Utils.sanitize(m.msg || '')}</div>
      `;

      Utils.el('deleteMsgBtn')?.addEventListener('click', () => removeMsg(origIdx));
    }

    render();
  }

  async function removeMsg(origIdx) {
    const yes = await Confirm.ask('Delete this message? This cannot be undone.');
    if (!yes) return;
    const msgs = await getAll();
    const m = msgs[origIdx];
    if (m && m.id) {
      try {
        const token = sessionStorage.getItem('smps_api_token') || localStorage.getItem('smps_token');
        await fetch(`/api/messages/${m.id}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` }
        });
      } catch (e) {
        console.warn('Backend message delete failed', e);
      }
    }
    msgs.splice(origIdx, 1);
    await saveAll(msgs);
    selectedIdx = -1;
    const detail = Utils.el('msgDetail');
    if (detail) {
      detail.innerHTML = `<div class="msg-detail-empty"><div style="font-size:48px;opacity:.3">✉️</div><div>Select a message to read</div></div>`;
    }
    render();
    Dashboard.updateMsgBadge();
    Toast.show('🗑 Message deleted.');
  }

  async function markAllRead() {
    const msgs = await getAll();
    const token = sessionStorage.getItem('smps_api_token') || localStorage.getItem('smps_token');
    for (const m of msgs) {
      if (!m.read) {
        m.read = true;
        if (m.id && token) {
          try {
            await fetch(`/api/messages/${m.id}/read`, {
              method: 'PUT',
              headers: { 'Authorization': `Bearer ${token}` }
            });
          } catch (e) {
            console.warn('Backend mark message read failed', e);
          }
        }
      }
    }
    await saveAll(msgs);
    render();
    Dashboard.updateMsgBadge();
    Toast.show('✅ All messages marked as read.', 'success');
  }

  function init() {
    Utils.el('markAllReadBtn')?.addEventListener('click', markAllRead);

    // Event delegation for message items
    Utils.el('msgListInner')?.addEventListener('click', (e) => {
      const item = e.target.closest('.msg-item[data-orig]');
      if (item) viewMsg(parseInt(item.dataset.orig));
    });
  }

  return { init, render };
})();

/* ════════════════════════════════════════
   SUBSCRIBERS MODULE
   ════════════════════════════════════════ */

const Subscribers = (() => {
  async function getAll()      { return DataStore.getList('subscribers', []); }
  function saveAll(list) { DataStore.saveList('subscribers', list); }

  async function render() {
    const subs  = await getAll();
    const tbody = Utils.el('subTableBody');
    if (!tbody) return;

    if (!Array.isArray(subs) || subs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="3"><div class="empty-state" style="padding:40px"><div class="es-icon">📭</div><h3>No subscribers yet</h3></div></td></tr>`;
      return;
    }

    tbody.innerHTML = subs.map((s, i) => `
      <tr>
        <td class="td-muted">${i + 1}</td>
        <td class="td-title">${Utils.sanitize(s)}</td>
        <td class="td-actions">
          <button class="btn btn-danger btn-sm" data-delete="${i}">🗑 Remove</button>
        </td>
      </tr>
    `).join('');
  }

  async function remove(idx) {
    const yes = await Confirm.ask('Remove this subscriber?');
    if (!yes) return;
    const subs = await getAll();
    subs.splice(idx, 1);
    saveAll(subs);
    render();
    Toast.show('🗑 Subscriber removed.');
  }

  async function clearAll() {
    const yes = await Confirm.ask('Clear ALL subscribers? This cannot be undone.', 'Clear All Subscribers');
    if (!yes) return;
    await DataStore.saveList('subscribers', []);
    render();
    Toast.show('🗑 All subscribers cleared.');
  }

  async function exportCSV() {
    const subs = await getAll();
    if (!Array.isArray(subs) || !subs.length) { Toast.show('No subscribers to export.', 'error'); return; }
    const csv = 'Email\n' + subs.map(s => `"${s.replace(/"/g, '""')}"`).join('\n');
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    a.download = 'smps_subscribers.csv';
    a.click();
    Toast.show('⬇ Exported!', 'success');
  }

  function init() {
    Utils.el('exportSubsBtn')?.addEventListener('click', exportCSV);
    Utils.el('clearSubsBtn')?.addEventListener('click', clearAll);

    Utils.el('subTableBody')?.addEventListener('click', (e) => {
      const deleteBtn = e.target.closest('[data-delete]');
      if (deleteBtn) remove(parseInt(deleteBtn.dataset.delete));
    });

    initTableSearch('subSearch', 'subTableBody');
  }

  return { init, render };
})();

/* ════════════════════════════════════════
   SETTINGS MODULE
   ════════════════════════════════════════ */

const Settings = (() => {
  const FIELDS = ['s-name', 's-tagline', 's-email', 's-phone1', 's-phone2', 's-hours', 's-address', 's-linkedin', 's-instagram', 's-youtube', 's-twitter', 's-ticker'];

  async function loadFields() {
    const d = await DataStore.getDoc('siteSettings', {});
    FIELDS.forEach(k => {
      const fieldId = k;
      const keyName = k.replace('s-', '');
      const input = Utils.el(fieldId);
      if (input) input.value = d[keyName] || '';
    });
  }

  async function save() {
    const d = {};
    FIELDS.forEach(k => { d[k.replace('s-', '')] = Utils.getVal(k); });
    await DataStore.saveDoc('siteSettings', d);
    Toast.show('✅ Settings saved!', 'success');
  }

  function init() {
    Utils.el('saveSettingsBtn')?.addEventListener('click', save);
  }

  return { init, loadFields };
})();

/* ════════════════════════════════════════
   REAL-TIME SUBSCRIPTIONS & STORAGE UPLOADS
   ════════════════════════════════════════ */

const subscriptions = {};

function setupImageUploaders() {
  const ids = ['pm-img', 'em-img', 'ev-img', 'gm-img'];
  ids.forEach(id => {
    const input = document.getElementById(id);
    if (!input) return;
    
    // Check if uploader already appended
    if (input.parentNode.querySelector('.btn-upload-file')) return;

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.style.display = 'none';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-secondary btn-upload-file';
    btn.textContent = '📤 Upload Image';
    btn.style.marginLeft = '8px';
    btn.style.padding = '4px 8px';
    btn.style.fontSize = '12px';

    btn.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', async () => {
      const file = fileInput.files[0];
      if (!file) return;
      btn.textContent = '⏳ Uploading...';
      try {
        const storageRef = firebase.storage().ref();
        const fileRef = storageRef.child(`uploads/${Date.now()}_${file.name}`);
        await fileRef.put(file);
        const url = await fileRef.getDownloadURL();
        input.value = url;
        btn.textContent = '✅ Uploaded';
        Toast.show('Image uploaded successfully!', 'success');
      } catch (err) {
        console.error('Image upload failed:', err);
        btn.textContent = '❌ Failed';
        Toast.show('Image upload failed: ' + err.message, 'error');
      }
    });

    input.parentNode.appendChild(fileInput);
    input.parentNode.appendChild(btn);
  });
}

function setupRealtimeSubscriptions() {
  // NOTE: Products are managed via SQLite API — no Firebase subscription needed.
  // The Firebase subscription was overwriting SQLite data with an empty list.
  // Products.render() is called directly when the products tab is activated.

  // Execom Members and Advisors are managed via SQLite API — no Firebase subscription needed.

  // Events are managed via SQLite API — no Firebase subscription needed.

  // 5. Gallery
  subscriptions.galleryData = DataStore.subscribe('galleryData', (list) => {
    window._cachedGalleryData = list;
    Gallery.render();
    setupImageUploaders();
  }, []);

  // 6. Patents
  subscriptions.patents = DataStore.subscribe('patents', (list) => {
    window._cachedPatents = list;
    IP.render();
    setupImageUploaders();
  }, []);

  // 7. Research
  subscriptions.researchData = DataStore.subscribe('researchData', (list) => {
    window._cachedResearchData = list;
    Research.render();
    setupImageUploaders();
  }, []);

  // 8. Licensing
  subscriptions.licensingData = DataStore.subscribe('licensingData', (list) => {
    window._cachedLicensingData = list;
    Licensing.render();
    setupImageUploaders();
  }, []);

  // 9. Proposals
  subscriptions.proposals = DataStore.subscribe('proposals', (list) => {
    window._cachedProposals = list;
    Proposals.render();
  }, []);

  // 10. Subscribers
  subscriptions.subscribers = DataStore.subscribe('subscribers', (list) => {
    window._cachedSubscribers = list;
    Subscribers.render();
  }, []);

  // 11. Messages
  subscriptions.contactMessages = DataStore.subscribe('contactMessages', (list) => {
    window._cachedContactMessages = list;
    Messages.render();
    Dashboard.updateMsgBadge();
  }, []);
}

/* ════════════════════════════════════════
   APP BOOTSTRAPPER
   ════════════════════════════════════════ */

const App = {
  _subscribed: false,
  init() {
    // Initialize all modules
    Dashboard.init();
    Home.init();
    About.init();
    Products.init();
    ProdSettings.init();
    Execom.init();
    ExecomSettings.init();
    Events.init();
    EventsSettings.init();
    Gallery.init();
    GallerySettings.init();
    IP.init();
    Research.init();
    Licensing.init();
    IPSettings.init();
    Jobs.init();
    Blogs.init();
    Collab.init();
    Proposals.init();
    Ecosystem.init();
    Messages.init();
    Subscribers.init();
    Settings.init();

    if (!this._subscribed) {
      setupRealtimeSubscriptions();
      this._subscribed = true;
    }
  }
};

/* ════════════════════════════════════════
   ENTRY POINT — DOM Ready
   ════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {
  Modal.init();
  Confirm.init();
  Nav.init();
  Auth.init();
});