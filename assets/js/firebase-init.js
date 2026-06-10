(function () {
  'use strict';

  // Global fetch interceptor to route relative API calls (starting with /api/) to port 5500 if the frontend is hosted on another port (e.g. VS Code Live Server on 5501)
  const originalFetch = window.fetch;
  window.fetch = function (input, init) {
    const backendPort = '5500';
    if (window.location.port !== backendPort) {
      if (typeof input === 'string') {
        if (input.startsWith('/api/')) {
          input = `http://127.0.0.1:${backendPort}${input}`;
        }
      } else if (input && typeof input === 'object' && typeof input.url === 'string') {
        if (input.url.startsWith(window.location.origin + '/api/')) {
          const newUrl = input.url.replace(window.location.origin, `http://127.0.0.1:${backendPort}`);
          try {
            input = new Request(newUrl, input);
          } catch (e) {
            input = newUrl;
          }
        }
      }
    }
    return originalFetch(input, init);
  };

  const firebaseConfig = {
    apiKey: 'AIzaSyCaNx1RY4H36XrUQ_TwwtVBHWTXqf7bHlk',
    authDomain: 'smps-main-website.firebaseapp.com',
    projectId: 'smps-main-website',
    storageBucket: 'smps-main-website.firebasestorage.app',
    messagingSenderId: '1027367877035',
    appId: '1:1027367877035:web:9b79a9b55369632ff07aee'
  };

  const scriptSources = [
    'https://www.gstatic.com/firebasejs/9.22.1/firebase-app-compat.js',
    'https://www.gstatic.com/firebasejs/9.22.1/firebase-auth-compat.js',
    'https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore-compat.js',
    'https://www.gstatic.com/firebasejs/9.22.1/firebase-storage-compat.js'
  ];

  let firestoreAvailable = true;
  let firestoreWritable = true;

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) {
        return resolve();
      }
      const script = document.createElement('script');
      script.src = src;
      script.async = false;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`Failed to load ${src}`));
      document.head.appendChild(script);
    });
  }

  // ── FIREBASE INITIALIZATION ──────────────────────────────────────────────────

  async function initFirebase() {
    if (window.firebase && window.firebase.apps && window.firebase.apps.length) {
      return window.firebase;
    }

    for (const src of scriptSources) {
      await loadScript(src);
    }

    if (!window.firebase) {
      throw new Error('Firebase SDK not available after loading scripts.');
    }

    if (!window.firebase.apps.length) {
      window.firebase.initializeApp(firebaseConfig);
    }

    return window.firebase;
  }

  async function getFirestore() {
    if (!firestoreAvailable) {
      throw new Error('Firestore currently unavailable');
    }
    try {
      const firebase = await window.FirebaseApp.ready;
      if (!firebase) {
        throw new Error('Firebase failed to initialize.');
      }
      return firebase.firestore();
    } catch (e) {
      firestoreAvailable = false;
      throw e;
    }
  }

  // ── GET DOCUMENT ───────────────────────────────────────────────────────────

  async function getDocument(key, fallback = null) {
    const localVal = localGet(key, null);
    if (!firestoreAvailable) {
      return localVal !== null ? localVal : fallback;
    }
    try {
      const db = await getFirestore();
      const snap = await db.collection('site').doc(key).get();
      if (snap.exists) {
        const data = snap.data();
        const value = data && data.value !== undefined ? data.value : data;
        localSet(key, value);
        return value;
      }
    } catch (error) {
      if (error && (error.code === 'permission-denied' || String(error).toLowerCase().includes('permission'))) {
        if (firestoreAvailable) {
          console.info('[Firebase] Insufficient permissions for Firestore. Falling back entirely to local SQLite and localStorage.');
          firestoreAvailable = false;
        }
      } else {
        console.warn(`Firestore get failed for ${key}, using local cache fallback:`, error);
      }
    }
    return localVal !== null ? localVal : fallback;
  }

  // ── SAVE DOCUMENT ──────────────────────────────────────────────────────────

  async function saveDocument(key, value) {
    localSet(key, value);
    if (!firestoreAvailable || !firestoreWritable) {
      return;
    }
    try {
      const db = await getFirestore();
      await db.collection('site').doc(key).set({
        value,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    } catch (error) {
      if (error && (error.code === 'permission-denied' || String(error).toLowerCase().includes('permission'))) {
        if (firestoreAvailable) {
          console.info('[Firebase] Insufficient permissions for Firestore. Falling back entirely to local SQLite and localStorage.');
          firestoreAvailable = false;
        }
        firestoreWritable = false;
      } else {
        console.warn(`Firestore save failed for ${key}:`, error);
      }
    }
  }

  // ── REALTIME SUBSCRIBER (onSnapshot) ───────────────────────────────────────

  function subscribe(key, callback, fallback = null) {
    let unsubscribe = () => {};
    
    // Immediately trigger callback with local storage cache to populate UI instantly & securely
    const localVal = localGet(key, null);
    if (localVal !== null) {
      callback(localVal);
    } else if (fallback !== null) {
      callback(fallback);
    }
    
    // We run async initialization but return a clean cancel hook
    window.FirebaseApp.ready.then(async () => {
      try {
        const db = await getFirestore();
        if (!firestoreAvailable) return;
        unsubscribe = db.collection('site').doc(key).onSnapshot((doc) => {
          if (doc.exists) {
            const data = doc.data();
            const value = data && data.value !== undefined ? data.value : data;
            localSet(key, value); // Keep local cache synchronized
            callback(value);
          }
        }, (error) => {
          if (error && (error.code === 'permission-denied' || String(error).toLowerCase().includes('permission'))) {
            if (firestoreAvailable) {
              console.info('[Firebase] Insufficient permissions for Firestore. Falling back entirely to local SQLite and localStorage.');
              firestoreAvailable = false;
            }
          } else {
            console.warn(`Firestore snapshot subscription failed for ${key}:`, error);
          }
          // Do NOT overwrite existing local cache with empty fallback arrays on database errors
        });
      } catch (e) {
        if (!String(e).toLowerCase().includes('unavailable') && !String(e).toLowerCase().includes('permission')) {
          console.warn(`Subscription initialization failed for ${key}:`, e);
        }
      }
    }).catch(err => {
      if (firestoreAvailable) {
        console.error(`Firebase App ready failed in subscribe for ${key}:`, err);
      }
    });

    // Return the unsubscribe function wrapper
    return () => unsubscribe();
  }

  // ── LIST OPERATIONS ───────────────────────────────────────────────────────

  async function getList(key, fallback = []) {
    const list = await getDocument(key, fallback);
    return Array.isArray(list) ? list : fallback;
  }

  async function saveList(key, items) {
    if (!Array.isArray(items)) {
      return;
    }
    await saveDocument(key, items);
  }

  async function addToList(key, item) {
    const list = await getList(key, []);
    const updated = [...list, item];
    await saveList(key, updated);
    return updated;
  }

  async function deleteFromList(key, id) {
    const list = await getList(key, []);
    const updated = list.filter((item) => String(item.id) !== String(id));
    await saveList(key, updated);
    return updated;
  }

  // ── BACKWARD-COMPATIBILITY STUBS (No-op localStorage) ─────────────────────
  function localGet(key, fallback = null) {
    try {
      const v = localStorage.getItem('smps_sandbox_' + key);
      return v ? JSON.parse(v) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function localSet(key, value) {
    try {
      localStorage.setItem('smps_sandbox_' + key, JSON.stringify(value));
      localStorage.setItem(key, JSON.stringify(value)); // standard key for event listener
      return true;
    } catch (e) {
      return false;
    }
  }

  // Expose to window scope
  window.FirebaseApp = {
    ready: initFirebase()
  };

  window.DataStore = {
    ready: window.FirebaseApp.ready,
    getDocument,
    saveDocument,
    getList,
    saveList,
    addToList,
    deleteFromList,
    subscribe,
    localGet,
    localSet
  };
})();
