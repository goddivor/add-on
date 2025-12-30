/**
 * Script injecté dans la page Grubhub
 * S'exécute dans le contexte de la page et a accès aux cookies
 */

console.log('[Cart Saver] Injected script loaded');

// ============================================
// INTERCEPTION DES REQUÊTES FETCH
// ============================================

const originalFetch = window.fetch;
const fetchInterceptor = {
  requests: [],
  callbacks: []
};

// Intercepter fetch pour voir ce qui se passe après les requêtes Grubhub
window.fetch = async function(...args) {
  const [url, options] = args;
  const urlString = typeof url === 'string' ? url : url.url;

  // Logger les requêtes vers l'API Grubhub
  if (urlString.includes('api-gtm.grubhub.com/carts')) {
    console.log('[Cart Saver Fetch Interceptor] REQUEST:', options?.method || 'GET', urlString);
  }

  // Appeler la vraie fonction fetch
  const response = await originalFetch.apply(this, args);

  // Intercepter les réponses pour les carts
  if (urlString.includes('api-gtm.grubhub.com/carts')) {
    const clonedResponse = response.clone();

    console.log('[Cart Saver Fetch Interceptor] RESPONSE:', response.status, urlString);

    // Si c'est un GET /carts/{id} avec succès
    if ((options?.method === 'GET' || !options?.method) && response.status === 200 && urlString.match(/\/carts\/[^\/]+$/)) {
      try {
        const data = await clonedResponse.json();
        console.log('[Cart Saver Fetch Interceptor] ✅ GET CART SUCCESS:', data);

        // Capturer ce qui se passe après
        setTimeout(() => {
          console.log('[Cart Saver Fetch Interceptor] 📊 Checking what happened after successful GET...');

          // Vérifier si des événements ont été déclenchés
          const cartElement = document.querySelector('[data-testid="global-cart"]');
          if (cartElement) {
            console.log('[Cart Saver Fetch Interceptor] Cart element state:', {
              visible: cartElement.offsetParent !== null,
              innerHTML: cartElement.innerHTML.substring(0, 200)
            });
          }

          // Logger tous les événements qui se sont déclenchés dans les 2 dernières secondes
          console.log('[Cart Saver Fetch Interceptor] Recent events:', window.__cartSaverEvents || []);
        }, 100);

        // Stocker les données pour pouvoir les rejouer
        fetchInterceptor.requests.push({
          type: 'GET_CART_SUCCESS',
          url: urlString,
          cartId: urlString.split('/carts/')[1],
          data: data,
          timestamp: Date.now()
        });

        // Déclencher un événement personnalisé avec les données
        window.dispatchEvent(new CustomEvent('grubhub-cart-fetched', {
          detail: { cartId: urlString.split('/carts/')[1], data }
        }));

      } catch (e) {
        console.error('[Cart Saver Fetch Interceptor] Error reading response:', e);
      }
    }
  }

  return response;
};

// Capturer tous les événements pour debugging
window.__cartSaverEvents = [];
const eventTypes = ['storage', 'message', 'popstate', 'hashchange', 'click', 'change', 'input'];

eventTypes.forEach(type => {
  window.addEventListener(type, (e) => {
    window.__cartSaverEvents.push({
      type: e.type,
      timestamp: Date.now(),
      target: e.target?.tagName,
      detail: e.detail
    });

    // Garder seulement les 50 derniers événements
    if (window.__cartSaverEvents.length > 50) {
      window.__cartSaverEvents.shift();
    }
  }, true);
});

console.log('[Cart Saver] Fetch interceptor installed');

// ============================================
// INTERCEPTION DES XMLHttpRequest (XHR)
// ============================================

const originalXHROpen = XMLHttpRequest.prototype.open;
const originalXHRSend = XMLHttpRequest.prototype.send;

XMLHttpRequest.prototype.open = function(method, url, ...args) {
  this.__cartSaver = {
    method: method,
    url: url,
    startTime: Date.now()
  };

  // Logger les requêtes vers l'API Grubhub
  if (typeof url === 'string' && url.includes('api-gtm.grubhub.com/carts')) {
    console.log('[Cart Saver XHR Interceptor] REQUEST:', method, url);
  }

  return originalXHROpen.apply(this, [method, url, ...args]);
};

XMLHttpRequest.prototype.send = function(...args) {
  if (this.__cartSaver && this.__cartSaver.url.includes('api-gtm.grubhub.com/carts')) {
    // Intercepter la réponse
    this.addEventListener('load', function() {
      const url = this.__cartSaver.url;
      const method = this.__cartSaver.method;

      console.log('[Cart Saver XHR Interceptor] RESPONSE:', this.status, method, url);

      // Si c'est un GET /carts/{id} avec succès
      if (method === 'GET' && this.status === 200 && url.match(/\/carts\/[^\/\?]+$/)) {
        try {
          const data = JSON.parse(this.responseText);
          console.log('[Cart Saver XHR Interceptor] ✅ GET CART SUCCESS:', data);

          const cartId = url.split('/carts/')[1].split('?')[0];

          // Capturer ce qui se passe après
          setTimeout(() => {
            console.log('[Cart Saver XHR Interceptor] 📊 Checking what happened after successful GET...');

            const cartElement = document.querySelector('[data-testid="global-cart"]');
            if (cartElement) {
              console.log('[Cart Saver XHR Interceptor] Cart element state:', {
                visible: cartElement.offsetParent !== null,
                innerHTML: cartElement.innerHTML.substring(0, 200)
              });
            }
          }, 100);

          // Stocker les données
          fetchInterceptor.requests.push({
            type: 'GET_CART_SUCCESS',
            method: 'XHR',
            url: url,
            cartId: cartId,
            data: data,
            timestamp: Date.now()
          });

          // Déclencher un événement personnalisé
          window.dispatchEvent(new CustomEvent('grubhub-cart-fetched', {
            detail: { cartId, data }
          }));

        } catch (e) {
          console.error('[Cart Saver XHR Interceptor] Error reading response:', e);
        }
      }
    });
  }

  return originalXHRSend.apply(this, args);
};

console.log('[Cart Saver] XHR interceptor installed');

// Exposer des fonctions helper pour debugging dans la console
window.__cartSaverDebug = {
  // Voir l'historique des requêtes interceptées
  showHistory: () => {
    console.log('=== FETCH HISTORY ===');
    console.table(fetchInterceptor.requests.map(r => ({
      type: r.type,
      cartId: r.cartId,
      timestamp: new Date(r.timestamp).toLocaleTimeString()
    })));
  },

  // Voir les événements récents
  showEvents: () => {
    console.log('=== RECENT EVENTS ===');
    console.table(window.__cartSaverEvents.slice(-20));
  },

  // Tester le replay d'un cart
  replayCart: async (cartId) => {
    console.log('Replaying cart:', cartId);
    const event = new CustomEvent('CART_SAVER_REQUEST', {
      detail: { action: 'REPLAY_CART_FETCH', cartId }
    });
    window.dispatchEvent(event);
  },

  // Voir les données complètes d'une requête
  getRequest: (index) => {
    return fetchInterceptor.requests[index];
  },

  // Comparer avant/après un ajout d'item
  startMonitoring: () => {
    console.log('🔍 Monitoring started. Add an item manually to see what happens...');
    window.__cartSaverMonitoring = {
      startTime: Date.now(),
      startEvents: [...window.__cartSaverEvents]
    };
  },

  // Test si l'interceptor fonctionne
  testInterceptor: () => {
    console.log('%c=== TESTING INTERCEPTOR ===', 'background: #9C27B0; color: white; padding: 5px;');
    console.log('Total requests intercepted:', fetchInterceptor.requests.length);
    console.log('Total events captured:', window.__cartSaverEvents.length);
    console.log('Monitoring active:', !!window.__cartSaverMonitoring);

    if (fetchInterceptor.requests.length > 0) {
      console.log('✅ Interceptor is working! Last request:');
      console.log(fetchInterceptor.requests[fetchInterceptor.requests.length - 1]);
    } else {
      console.warn('⚠️ No requests intercepted yet. Try refreshing the page or adding an item.');
    }

    return {
      working: true,
      requestsCount: fetchInterceptor.requests.length,
      eventsCount: window.__cartSaverEvents.length
    };
  },

  stopMonitoring: () => {
    if (!window.__cartSaverMonitoring) {
      console.error('❌ Monitoring not started. Call startMonitoring() first.');
      return { error: 'Not started' };
    }

    const duration = Date.now() - window.__cartSaverMonitoring.startTime;

    const newEvents = window.__cartSaverEvents.filter(e =>
      e.timestamp > window.__cartSaverMonitoring.startTime
    );

    const newRequests = fetchInterceptor.requests.filter(r =>
      r.timestamp > window.__cartSaverMonitoring.startTime
    );

    console.log(`%c=== 🛑 MONITORING STOPPED (${duration}ms) ===`, 'background: #222; color: #bada55; font-size: 14px; padding: 5px;');

    console.log(`%c📊 CAPTURED ${newEvents.length} events and ${newRequests.length} requests`, 'color: #4CAF50; font-weight: bold;');

    if (newRequests.length > 0) {
      console.log('%c=== REQUESTS DURING MONITORING ===', 'background: #2196F3; color: white; padding: 3px;');
      console.table(newRequests.map(r => ({
        type: r.type,
        cartId: r.cartId,
        url: r.url?.substring(0, 60),
        time: new Date(r.timestamp).toLocaleTimeString()
      })));

      // Afficher les détails de chaque requête
      newRequests.forEach((req, i) => {
        console.log(`%cRequest ${i + 1}:`, 'color: #2196F3; font-weight: bold;', req);
      });
    } else {
      console.warn('⚠️ No requests captured!');
    }

    if (newEvents.length > 0) {
      console.log('%c=== EVENTS DURING MONITORING ===', 'background: #FF9800; color: white; padding: 3px;');
      console.table(newEvents.slice(-30).map(e => ({
        type: e.type,
        target: e.target,
        time: new Date(e.timestamp).toLocaleTimeString()
      })));
    } else {
      console.warn('⚠️ No events captured!');
    }

    const result = {
      duration,
      eventsCount: newEvents.length,
      requestsCount: newRequests.length,
      events: newEvents,
      requests: newRequests
    };

    delete window.__cartSaverMonitoring;

    console.log('%c✅ Monitoring data:', 'color: #4CAF50; font-weight: bold;', result);

    return result;
  }
};

console.log('%c💡 Cart Saver Debug Tools', 'background: #4CAF50; color: white; font-size: 16px; padding: 5px; font-weight: bold;');
console.log('%cAvailable commands at window.__cartSaverDebug:', 'color: #2196F3; font-weight: bold;');
console.log('  📊 testInterceptor()       - Test if interceptor is working');
console.log('  📜 showHistory()           - Show all intercepted requests');
console.log('  📋 showEvents()            - Show recent events');
console.log('  🔍 startMonitoring()       - Start capturing (add item manually after this)');
console.log('  🛑 stopMonitoring()        - Stop and show captured data');
console.log('');
console.log('%cQuick test:', 'color: #FF5722; font-weight: bold;');
console.log('  __cartSaverDebug.testInterceptor()');

/**
 * Récupère le token d'authentification depuis le localStorage
 */
function getAuthToken() {
  console.log('[Cart Saver] Getting auth token...');

  try {
    // Grubhub stocke le token dans __ghsdk_data
    const sdkData = localStorage.getItem('__ghsdk_data');
    console.log('[Cart Saver] __ghsdk_data exists:', !!sdkData);

    if (sdkData) {
      const parsed = JSON.parse(sdkData);
      console.log('[Cart Saver] __ghsdk_data structure:', Object.keys(parsed));

      const token = parsed?.auth?.credentials?.session_handle?.access_token;
      if (token) {
        console.log('[Cart Saver] Auth token found in __ghsdk_data:', token.substring(0, 10) + '...');
        return token;
      } else {
        console.log('[Cart Saver] No token at expected path in __ghsdk_data');
        console.log('[Cart Saver] auth:', parsed.auth);
      }
    }

    // Fallback : essayer ngStorage-account
    const authData = localStorage.getItem('ngStorage-account');
    console.log('[Cart Saver] ngStorage-account exists:', !!authData);

    if (authData) {
      const parsed = JSON.parse(authData);
      const token = parsed.session_token || parsed.sessionToken || parsed.token || parsed.access_token;
      if (token) {
        console.log('[Cart Saver] Auth token found in ngStorage-account');
        return token;
      }
    }

    console.warn('[Cart Saver] No auth token found in localStorage');
    console.warn('[Cart Saver] Available localStorage keys:', Object.keys(localStorage));
    return null;
  } catch (e) {
    console.error('[Cart Saver] Error getting auth token:', e);
    return null;
  }
}

// Écouter les messages du content script
window.addEventListener('message', async (event) => {
  if (event.source !== window) return;
  if (!event.data || event.data.type !== 'CART_SAVER_REQUEST') return;

  console.log('[Cart Saver Injected] Received request:', event.data);

  const { action, eventId, params } = event.data;

  console.log('[Cart Saver Injected] Processing action:', action);

  try {
    let result;
    const authToken = getAuthToken();
    console.log('[Cart Saver Injected] Auth token available:', !!authToken);

    if (action === 'CREATE_CART') {
      // Créer un nouveau cart
      const API_BASE = 'https://api-gtm.grubhub.com';

      const headers = {
        'accept': 'application/json',
        'content-type': 'application/json;charset=UTF-8',
        'cache-control': 'no-cache',
        'if-modified-since': '0',
        'x-gh-features': '60=78219;appName=@grubhubprod/order-taking-client-sdk;appVersion=16.4.0;'
      };

      if (authToken) {
        headers['authorization'] = `Bearer ${authToken}`;
      }

      const payload = {
        brand: 'GRUBHUB',
        experiments: [
          'IGNORE_MINIMUM_TIP_REQUIREMENT',
          'LINEOPTION_ENHANCEMENTS',
          'ENABLE_BUNDLED_ORDER_PAYMENTS',
          'ROBOT_DELIVERY'
        ],
        cart_attributes: []
      };

      console.log('[Cart Saver Injected] Creating new cart...');

      const response = await fetch(`${API_BASE}/carts`, {
        method: 'POST',
        headers: headers,
        credentials: 'include',
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const text = await response.text();
        console.error('[Cart Saver Injected] Error creating cart:', text);
        throw new Error(`Failed to create cart: ${response.status} - ${text}`);
      }

      result = await response.json();
      console.log('[Cart Saver Injected] Cart created:', result);

    } else if (action === 'GET_CART') {
      // Récupérer tous les paniers (pour avoir la structure complète avec charges.lines.line_items)
      const API_BASE = 'https://api-gtm.grubhub.com';

      const headers = {
        'accept': 'application/json',
        'cache-control': 'no-cache',
        'if-modified-since': '0',
        'x-gh-features': '60=78219;appName=@grubhubprod/order-taking-client-sdk;appVersion=16.4.0;'
      };

      // Ajouter le token si disponible
      if (authToken) {
        headers['authorization'] = `Bearer ${authToken}`;
      }

      console.log('[Cart Saver Injected] Fetching carts...');
      console.log('[Cart Saver Injected] Headers:', headers);

      // GET /carts retourne tous les carts avec la structure complète
      const response = await fetch(`${API_BASE}/carts`, {
        method: 'GET',
        headers: headers,
        credentials: 'include'
      });

      console.log('[Cart Saver Injected] Response status:', response.status);

      if (!response.ok) {
        const text = await response.text();
        console.error('[Cart Saver Injected] Error response:', text);
        throw new Error(`Failed to fetch carts: ${response.status} - ${text}`);
      }

      result = await response.json();
      console.log('[Cart Saver Injected] Carts fetched:', result);

    } else if (action === 'GET_CART_BY_ID') {
      // Récupérer un cart spécifique par son ID (ÉTAPE 2 et 4 du process Grubhub)
      const API_BASE = 'https://api-gtm.grubhub.com';

      const headers = {
        'accept': 'application/json',
        'cache-control': 'no-cache',
        'if-modified-since': '0',
        'x-gh-features': '60=78219;appName=@grubhubprod/order-taking-client-sdk;appVersion=16.4.0;'
      };

      if (authToken) {
        headers['authorization'] = `Bearer ${authToken}`;
      }

      console.log('[Cart Saver Injected] Fetching cart by ID:', params.cartId);

      const response = await fetch(`${API_BASE}/carts/${params.cartId}`, {
        method: 'GET',
        headers: headers,
        credentials: 'include'
      });

      console.log('[Cart Saver Injected] Response status:', response.status);

      if (!response.ok) {
        const text = await response.text();
        console.error('[Cart Saver Injected] Error response:', text);
        throw new Error(`Failed to fetch cart: ${response.status} - ${text}`);
      }

      result = await response.json();
      console.log('[Cart Saver Injected] Cart fetched:', result);

    } else if (action === 'ADD_ITEM') {
      // Ajouter un item au panier
      const API_BASE = 'https://api-gtm.grubhub.com';

      const headers = {
        'accept': 'application/json',
        'content-type': 'application/json;charset=UTF-8',
        'cache-control': 'no-cache',
        'if-modified-since': '0',
        'x-gh-features': '60=78219;appName=@grubhubprod/order-taking-client-sdk;appVersion=16.4.0;'
      };

      // Ajouter le token si disponible
      if (authToken) {
        headers['authorization'] = `Bearer ${authToken}`;
      }

      console.log('[Cart Saver Injected] Adding item to cart:', params.cartId);
      console.log('[Cart Saver Injected] Payload:', params.payload);
      console.log('[Cart Saver Injected] Headers:', headers);

      const response = await fetch(`${API_BASE}/carts/${params.cartId}/lines`, {
        method: 'POST',
        headers: headers,
        credentials: 'include',
        body: JSON.stringify(params.payload)
      });

      console.log('[Cart Saver Injected] Response status:', response.status);

      if (!response.ok) {
        const text = await response.text();
        console.error('[Cart Saver Injected] Error response:', text);
        throw new Error(`Failed to add item: ${response.status} - ${text}`);
      }

      result = await response.json();
      console.log('[Cart Saver Injected] Item added:', result);

    } else if (action === 'INSPECT_FETCH_HISTORY') {
      // Inspecter l'historique des requêtes fetch interceptées
      console.log('[Cart Saver Injected] Fetch history:', fetchInterceptor.requests);
      console.log('[Cart Saver Injected] Recent events:', window.__cartSaverEvents);

      result = {
        requests: fetchInterceptor.requests,
        events: window.__cartSaverEvents,
        timestamp: Date.now()
      };

    } else if (action === 'REPLAY_CART_FETCH') {
      // Rejouer une requête GET /carts/{id} pour déclencher le même comportement
      const cartId = params.cartId;

      console.log('[Cart Saver Injected] Replaying cart fetch for:', cartId);

      // Faire un vrai GET pour déclencher tous les listeners de Grubhub
      const API_BASE = 'https://api-gtm.grubhub.com';
      const headers = {
        'accept': 'application/json',
        'cache-control': 'no-cache',
        'if-modified-since': '0',
        'x-gh-features': '60=78219;appName=@grubhubprod/order-taking-client-sdk;appVersion=16.4.0;'
      };

      const authToken = getAuthToken();
      if (authToken) {
        headers['authorization'] = `Bearer ${authToken}`;
      }

      console.log('[Cart Saver Injected] Making GET request to trigger Grubhub listeners...');

      // Cette requête va passer par notre interceptor ET par les listeners de Grubhub
      const response = await fetch(`${API_BASE}/carts/${cartId}`, {
        method: 'GET',
        headers: headers,
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error(`Failed to replay fetch: ${response.status}`);
      }

      result = await response.json();
      console.log('[Cart Saver Injected] Replayed fetch successfully:', result);

    } else if (action === 'FORCE_REACT_REFRESH') {
      // Forcer React à rafraîchir le cart en manipulant directement le state
      console.log('[Cart Saver Injected] Forcing React refresh...');

      try {
        // Méthode 1: Trouver le composant React du cart et forcer un update
        const cartElement = document.querySelector('[data-testid="global-cart"]') ||
                           document.querySelector('[id*="cart"]') ||
                           document.querySelector('[class*="globalCart"]');

        if (cartElement) {
          console.log('[Cart Saver Injected] Found cart element:', cartElement);

          // Chercher les propriétés React sur l'élément
          const reactKeys = Object.keys(cartElement).filter(key =>
            key.startsWith('__react') || key.startsWith('_react')
          );

          console.log('[Cart Saver Injected] React keys found:', reactKeys);

          for (const key of reactKeys) {
            try {
              const reactInstance = cartElement[key];
              console.log('[Cart Saver Injected] React instance:', reactInstance);

              // Chercher le composant fiber
              let fiber = reactInstance;
              if (fiber && fiber.return) {
                // Remonter jusqu'au composant cart
                let currentFiber = fiber;
                let attempts = 0;
                while (currentFiber && attempts < 50) {
                  if (currentFiber.stateNode) {
                    console.log('[Cart Saver Injected] Found stateNode:', currentFiber.stateNode);

                    // Essayer de forcer un update
                    if (typeof currentFiber.stateNode.forceUpdate === 'function') {
                      console.log('[Cart Saver Injected] Calling forceUpdate on:', currentFiber.stateNode);
                      currentFiber.stateNode.forceUpdate();
                    }

                    // Essayer de déclencher un setState vide
                    if (typeof currentFiber.stateNode.setState === 'function') {
                      console.log('[Cart Saver Injected] Calling setState on:', currentFiber.stateNode);
                      currentFiber.stateNode.setState({});
                    }
                  }

                  currentFiber = currentFiber.return;
                  attempts++;
                }
              }
            } catch (e) {
              console.warn('[Cart Saver Injected] Error with React key:', key, e);
            }
          }
        }

        // Méthode 2: Utiliser React DevTools Hook si disponible
        if (window.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
          console.log('[Cart Saver Injected] React DevTools hook found');

          // Essayer de forcer un update global
          const hook = window.__REACT_DEVTOOLS_GLOBAL_HOOK__;
          if (hook.renderers) {
            console.log('[Cart Saver Injected] Found renderers:', hook.renderers.size);

            hook.renderers.forEach((renderer, id) => {
              console.log('[Cart Saver Injected] Renderer:', id, renderer);

              // Forcer un update via le renderer
              if (renderer.scheduleRefresh) {
                console.log('[Cart Saver Injected] Calling scheduleRefresh');
                renderer.scheduleRefresh();
              }
            });
          }
        }

        // Méthode 3: Déclencher des événements DOM natifs qui pourraient trigger React
        const events = ['change', 'input', 'click', 'focus', 'blur'];
        events.forEach(eventType => {
          const event = new Event(eventType, { bubbles: true, cancelable: true });
          document.body.dispatchEvent(event);
        });

        // Méthode 4: Chercher et appeler toutes les fonctions de refresh/refetch dans window
        const globalKeys = Object.keys(window);
        const refreshFunctions = globalKeys.filter(key =>
          typeof window[key] === 'function' &&
          (key.toLowerCase().includes('refresh') ||
           key.toLowerCase().includes('refetch') ||
           key.toLowerCase().includes('reload') ||
           key.toLowerCase().includes('update'))
        );

        console.log('[Cart Saver Injected] Found potential refresh functions:', refreshFunctions);

        result = {
          success: true,
          message: 'React refresh attempted with multiple methods'
        };

      } catch (error) {
        console.error('[Cart Saver Injected] Error forcing React refresh:', error);
        result = {
          success: false,
          error: error.message
        };
      }
    }

    // Envoyer la réponse
    window.postMessage({
      type: 'CART_SAVER_RESPONSE',
      eventId: eventId,
      result: result
    }, '*');

  } catch (error) {
    console.error('[Cart Saver Injected] Error:', error);
    window.postMessage({
      type: 'CART_SAVER_RESPONSE',
      eventId: eventId,
      error: error.message || error.toString()
    }, '*');
  }
});
