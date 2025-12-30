/**
 * Content Script - Grubhub Cart Saver
 * Injecte les boutons Save/Load et gère l'interaction avec la page
 */

// Configuration
const CONFIG = {
  BUTTON_CONTAINER_SELECTOR: 'body', // À ajuster selon l'analyse du DOM
  CART_ITEMS_SELECTOR: '.cart-item', // À ajuster
  RETRY_DELAY: 1000,
  MAX_RETRIES: 5
};

// État global
let retryCount = 0;
let injectedScriptLoaded = false;

/**
 * Injecte le script externe dans la page
 */
function injectExternalScript() {
  if (injectedScriptLoaded) return;

  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('injected-script.js');
  script.onload = () => {
    console.log('[Cart Saver] External script injected successfully');
    injectedScriptLoaded = true;
    script.remove();
  };
  script.onerror = () => {
    console.error('[Cart Saver] Failed to inject external script');
  };

  (document.head || document.documentElement).appendChild(script);
}

/**
 * Envoie une requête au script injecté dans la page
 */
function sendPageScriptRequest(action, params = {}) {
  return new Promise((resolve, reject) => {
    // Vérifier que le script injecté est chargé
    if (!injectedScriptLoaded) {
      console.warn('[Cart Saver] Injected script not loaded yet, waiting...');
      // Attendre un peu que le script se charge
      setTimeout(() => {
        if (!injectedScriptLoaded) {
          reject(new Error('Injected script not loaded. Please refresh the page.'));
          return;
        }
        // Réessayer la requête
        sendPageScriptRequest(action, params).then(resolve).catch(reject);
      }, 2000);
      return;
    }

    const eventId = 'cart-saver-' + Math.random().toString(36).substr(2, 9);

    console.log('[Cart Saver] Sending request to page script:', action, params);

    // Écouter la réponse
    const handleMessage = (event) => {
      if (event.source !== window) return;
      if (event.data && event.data.type === 'CART_SAVER_RESPONSE' && event.data.eventId === eventId) {
        window.removeEventListener('message', handleMessage);
        clearTimeout(timeoutId);

        console.log('[Cart Saver] Received response from page script:', event.data);

        if (event.data.error) {
          reject(new Error(event.data.error));
        } else {
          resolve(event.data.result);
        }
      }
    };

    window.addEventListener('message', handleMessage);

    // Envoyer la requête
    window.postMessage({
      type: 'CART_SAVER_REQUEST',
      eventId: eventId,
      action: action,
      params: params
    }, '*');

    // Timeout
    const timeoutId = setTimeout(() => {
      window.removeEventListener('message', handleMessage);
      reject(new Error('Timeout waiting for page script response'));
    }, 15000);
  });
}

/**
 * Initialisation - Injecte les boutons dans la page
 */
function init() {
  // IMPORTANT: Injecter le script externe IMMÉDIATEMENT pour intercepter fetch
  // avant que Grubhub ne fasse ses requêtes
  injectExternalScript();

  // Attendre que le DOM soit prêt pour les boutons
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectButtons);
  } else {
    // Si le DOM est déjà chargé, attendre un peu pour trouver les éléments
    setTimeout(injectButtons, 1000);
  }
}

/**
 * Injecte les boutons Save/Load dans la page
 */
function injectButtons() {
  // Vérifier si on est sur une page de restaurant/menu
  if (!isRestaurantPage()) {
    console.log('[Cart Saver] Not on restaurant page');
    return;
  }

  // Éviter les doublons
  if (document.getElementById('grubhub-cart-saver-buttons')) {
    console.log('[Cart Saver] Buttons already injected');
    return;
  }

  // Créer le conteneur des boutons
  const buttonContainer = createButtonContainer();

  // Trouver où injecter (header, cart, etc.)
  const targetElement = findTargetElement();

  if (targetElement) {
    targetElement.appendChild(buttonContainer);
    console.log('[Cart Saver] Buttons injected successfully');
  } else {
    // Réessayer si l'élément n'est pas encore dans le DOM
    if (retryCount < CONFIG.MAX_RETRIES) {
      retryCount++;
      console.log(`[Cart Saver] Retrying injection (${retryCount}/${CONFIG.MAX_RETRIES})`);
      setTimeout(injectButtons, CONFIG.RETRY_DELAY);
    } else {
      console.error('[Cart Saver] Failed to inject buttons - target element not found');
    }
  }
}

/**
 * Vérifie si on est sur une page de restaurant
 */
function isRestaurantPage() {
  const url = window.location.href;
  return url.includes('/restaurant/') || url.includes('/menu');
}

/**
 * Trouve l'élément cible où injecter les boutons
 */
function findTargetElement() {
  // Essayer plusieurs sélecteurs possibles
  const selectors = [
    '[class*="cart"]',
    '[class*="Cart"]',
    '[class*="header"]',
    'header',
    'main',
    'body'
  ];

  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element) {
      return element;
    }
  }

  return document.body;
}

/**
 * Crée le conteneur avec les boutons
 */
function createButtonContainer() {
  const container = document.createElement('div');
  container.id = 'grubhub-cart-saver-buttons';
  container.className = 'cart-saver-container';

  // Bouton Save
  const saveBtn = createButton('save', '💾 Save Cart', handleSaveCart);

  // Bouton Load
  const loadBtn = createButton('load', '📥 Load Cart', handleLoadCart);

  container.appendChild(saveBtn);
  container.appendChild(loadBtn);

  return container;
}

/**
 * Crée un bouton
 */
function createButton(id, text, onClick) {
  const button = document.createElement('button');
  button.id = `cart-saver-${id}`;
  button.className = `cart-saver-btn cart-saver-${id}`;
  button.textContent = text;
  button.addEventListener('click', onClick);
  return button;
}

/**
 * Handler pour Save Cart
 */
async function handleSaveCart() {
  try {
    console.log('[Cart Saver] Saving cart...');

    // 1. Récupérer le contexte (restaurant, location, etc.)
    const context = extractContext();

    // 2. Extraire les items du panier et les transformer en payloads
    const payloads = await extractCartItems();

    if (payloads.length === 0) {
      showNotification('Cart is empty!', 'warning');
      return;
    }

    // 3. NOUVEAU : Sauvegarder le HTML du cart pour l'injection visuelle
    const cartHTML = extractCartHTML();

    // 4. Créer l'objet à sauvegarder
    const savedCart = {
      context,
      payloads, // Payloads pour recréer via API
      cartHTML, // HTML brut pour injection visuelle
      timestamp: Date.now(),
      url: window.location.href,
      version: '2.0' // Version mise à jour avec HTML
    };

    // 5. Sauvegarder dans le storage de l'extension
    await chrome.storage.local.set({ savedCart });

    console.log('[Cart Saver] Cart saved:', savedCart);
    showNotification(`Cart saved! (${payloads.length} items)`, 'success');

  } catch (error) {
    console.error('[Cart Saver] Error saving cart:', error);
    showNotification('Failed to save cart!', 'error');
  }
}

/**
 * Handler pour Load Cart
 */
async function handleLoadCart() {
  try {
    console.log('[Cart Saver] Loading cart...');

    // 1. Récupérer le cart sauvegardé
    const result = await chrome.storage.local.get('savedCart');

    if (!result.savedCart) {
      showNotification('No saved cart found!', 'warning');
      return;
    }

    const { savedCart } = result;

    // Support des anciennes versions (avec "items" au lieu de "payloads")
    const payloads = savedCart.payloads || savedCart.items;
    const cartHTML = savedCart.cartHTML; // HTML sauvegardé pour injection

    if (!payloads || payloads.length === 0) {
      showNotification('Saved cart is empty!', 'warning');
      return;
    }

    // 2. Vérifier le contexte (même restaurant, etc.)
    const currentContext = extractContext();

    if (!isValidContext(savedCart.context, currentContext)) {
      showNotification('Wrong restaurant or location!', 'error');
      return;
    }

    // 3. Réajouter les items au panier via API (4 requêtes)
    showNotification(`Adding ${payloads.length} items to cart...`, 'info');
    const { successCount, cartId } = await readdItemsToCart(payloads);

    console.log('[Cart Saver] Items added via API, checking DOM...');

    // 4. Vérifier le DOM et injecter le HTML si nécessaire
    await triggerCartRefresh(cartId, cartHTML);

  } catch (error) {
    console.error('[Cart Saver] Error loading cart:', error);
    showNotification('Failed to load cart!', 'error');
  }
}

/**
 * Extrait le HTML du cart pour le sauvegarder
 */
function extractCartHTML() {
  try {
    console.log('[Cart Saver] Extracting cart HTML...');

    // Trouver le conteneur principal du popover (popover-content)
    const popoverContent = document.querySelector('.popover-content');

    if (!popoverContent) {
      console.warn('[Cart Saver] Popover content not found');
      return null;
    }

    // Récupérer tout le HTML du popover
    const popoverHTML = popoverContent.innerHTML;

    // Récupérer aussi le nombre d'items affiché sur le badge
    const itemCountBadge = document.querySelector('[data-testid="toggleCart-bag-button-total-item-quantity"]');
    const itemCount = itemCountBadge ? itemCountBadge.textContent : '0';

    console.log('[Cart Saver] Extracted popover HTML:', popoverHTML.substring(0, 200) + '...');
    console.log('[Cart Saver] Item count badge:', itemCount);

    return {
      popoverHTML: popoverHTML,
      itemCount: itemCount,
      timestamp: Date.now()
    };

  } catch (e) {
    console.error('[Cart Saver] Error extracting cart HTML:', e);
    return null;
  }
}

/**
 * Extrait le contexte (restaurant, location, menu)
 */
function extractContext() {
  // Récupérer depuis le localStorage de Grubhub
  const cartState = localStorage.getItem('ngStorage-cartState');
  const account = localStorage.getItem('ngStorage-account');

  let context = {
    restaurantId: null,
    cartId: null,
    orderMethod: null,
    location: null,
    url: window.location.pathname
  };

  if (cartState) {
    try {
      const parsed = JSON.parse(cartState);
      context.restaurantId = parsed.restaurantId;
      context.cartId = parsed.cartId;
      context.orderMethod = parsed.orderMethod;
    } catch (e) {
      console.error('[Cart Saver] Error parsing cartState:', e);
    }
  }

  // Extraire aussi depuis l'URL si possible
  const urlMatch = window.location.pathname.match(/\/restaurant\/[^\/]+\/(\d+)/);
  if (urlMatch) {
    context.restaurantId = context.restaurantId || urlMatch[1];
  }

  console.log('[Cart Saver] Context extracted:', context);
  return context;
}

/**
 * Attend que le cartId soit disponible ou récupère le premier cart actif
 */
async function ensureCartId(restaurantId, maxRetries = 5) {
  let retries = 0;

  while (retries < maxRetries) {
    const context = extractContext();

    if (context.cartId) {
      console.log('[Cart Saver] Cart ID found:', context.cartId);
      return context.cartId;
    }

    // Si pas de cartId dans localStorage, essayer de récupérer via API
    try {
      console.log('[Cart Saver] No cartId in localStorage, fetching from API...');
      const cartsData = await sendPageScriptRequest('GET_CART', {});

      if (cartsData && cartsData.carts) {
        // Trouver un cart actif pour ce restaurant
        const activeCarts = Object.values(cartsData.carts).filter(cart =>
          cart.state === 'ACTIVE' &&
          cart.restaurant_ids &&
          cart.restaurant_ids.includes(restaurantId)
        );

        if (activeCarts.length > 0) {
          const cartId = activeCarts[0].id;
          console.log('[Cart Saver] Found active cart from API:', cartId);
          return cartId;
        }

        // Si pas de cart pour ce restaurant, prendre le premier cart actif
        const anyActiveCarts = Object.values(cartsData.carts).filter(cart => cart.state === 'ACTIVE');
        if (anyActiveCarts.length > 0) {
          const cartId = anyActiveCarts[0].id;
          console.log('[Cart Saver] Using first active cart:', cartId);
          return cartId;
        }
      }
    } catch (error) {
      console.error('[Cart Saver] Error fetching carts from API:', error);
    }

    // Attendre un peu avant de réessayer
    retries++;
    if (retries < maxRetries) {
      console.log(`[Cart Saver] Retrying to find cartId (${retries}/${maxRetries})...`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  throw new Error('Could not find or create a cart ID. Please try adding an item to your cart first.');
}

/**
 * Transforme les options du format GET vers le format POST
 */
function transformOptions(options) {
  if (!options || !Array.isArray(options)) return [];

  return options.map(option => {
    const transformed = {
      quantity: option.quantity || 1,
      id: typeof option.id === 'string' ? parseInt(option.id) : option.id,
      child_options: [],
      sub_option_ids: []
    };

    // Gérer les child_options récursivement si présents
    if (option.child_options && option.child_options.length > 0) {
      transformed.child_options = transformOptions(option.child_options);
    }

    return transformed;
  });
}

/**
 * Transforme un line_item (format GET) en payload (format POST)
 */
function lineItemToPayload(lineItem, restaurantId) {
  return {
    menu_item_id: String(lineItem.menu_item_id),
    brand: 'GRUBHUB',
    experiments: ['LINEOPTION_ENHANCEMENTS'],
    quantity: lineItem.quantity || 1,
    special_instructions: lineItem.special_instructions || '',
    options: transformOptions(lineItem.options),
    cost: (lineItem.price || 0) / 100, // Convertir centimes → dollars
    restaurant_id: String(restaurantId || lineItem.restaurant_id),
    popular: false,
    isBadged: lineItem.badges && lineItem.badges.length > 0,
    source: 'cart_saver_extension'
  };
}

/**
 * Extrait les items du panier via l'API Grubhub et les transforme en payloads
 */
async function extractCartItems() {
  const context = extractContext();

  if (!context.cartId) {
    console.warn('[Cart Saver] No cart ID found');
    return [];
  }

  try {
    // Envoyer une requête au script injecté pour récupérer tous les carts
    const cartsData = await sendPageScriptRequest('GET_CART', {
      cartId: context.cartId
    });

    console.log('[Cart Saver] Carts data received:', cartsData);

    // Extraire le cart actuel
    const currentCart = cartsData.carts ? cartsData.carts[context.cartId] : cartsData;

    if (!currentCart) {
      console.warn('[Cart Saver] Current cart not found in response');
      return [];
    }

    const lineItems = currentCart.charges?.lines?.line_items || [];

    if (lineItems.length === 0) {
      console.log('[Cart Saver] No items in cart');
      return [];
    }

    // Transformer chaque line_item en payload POST
    const payloads = lineItems.map(lineItem => {
      try {
        const payload = lineItemToPayload(lineItem, context.restaurantId);
        console.log('[Cart Saver] Transformed item:', lineItem.name, '→', payload);
        return payload;
      } catch (e) {
        console.error('[Cart Saver] Error transforming line item:', lineItem, e);
        return null;
      }
    }).filter(p => p !== null);

    console.log('[Cart Saver] Payloads created:', payloads);
    return payloads;

  } catch (error) {
    console.error('[Cart Saver] Error fetching cart items:', error);
    return [];
  }
}


/**
 * Vérifie si le contexte est valide pour charger le cart
 */
function isValidContext(savedContext, currentContext) {
  // Vérifier que c'est le même restaurant
  if (savedContext.restaurantId !== currentContext.restaurantId) {
    console.warn('[Cart Saver] Different restaurant ID');
    return false;
  }

  // Vérifier la méthode de commande (delivery/pickup)
  if (savedContext.orderMethod !== currentContext.orderMethod) {
    console.warn('[Cart Saver] Different order method');
    // Peut-être juste un warning au lieu de bloquer
  }

  return true;
}

/**
 * Réajoute les items au panier
 * Les items sont déjà des payloads prêts à être envoyés
 */
async function readdItemsToCart(payloads) {
  console.log('[Cart Saver] Re-adding items to cart:', payloads.length, 'items');

  const context = extractContext();

  // ÉTAPE 1 : Créer un NOUVEAU cart (comme Grubhub le fait)
  console.log('[Cart Saver] STEP 1: Creating new cart...');
  const newCart = await sendPageScriptRequest('CREATE_CART', {});
  const cartId = newCart.id;

  console.log('[Cart Saver] New cart created:', cartId);

  // ÉTAPE 2 : GET du cart vide (optionnel mais suit le flow Grubhub)
  console.log('[Cart Saver] STEP 2: Fetching empty cart...');
  await sendPageScriptRequest('GET_CART_BY_ID', { cartId: cartId });

  const successCount = { added: 0, failed: 0 };

  // ÉTAPE 3 : Ajouter tous les items au nouveau cart
  for (let i = 0; i < payloads.length; i++) {
    const payload = payloads[i];
    try {
      console.log(`[Cart Saver] STEP 3.${i + 1}: Adding item ${i + 1}/${payloads.length}:`, payload.menu_item_id);

      // Les payloads sont déjà au bon format, on les envoie directement
      // Juste mettre à jour le restaurant_id au cas où
      const finalPayload = {
        ...payload,
        restaurant_id: context.restaurantId
      };

      // Envoyer une requête au script injecté
      const result = await sendPageScriptRequest('ADD_ITEM', {
        cartId: cartId,
        payload: finalPayload
      });

      console.log('[Cart Saver] Item added successfully:', result);
      successCount.added++;

      // ÉTAPE 4 : GET du cart après chaque ajout (comme Grubhub)
      console.log(`[Cart Saver] STEP 4.${i + 1}: Fetching updated cart...`);
      const updatedCart = await sendPageScriptRequest('GET_CART_BY_ID', { cartId: cartId });

      // Mettre à jour le localStorage pour que React détecte le changement
      updateLocalStorageCart(cartId, updatedCart);

      // Petit délai entre chaque item
      await new Promise(resolve => setTimeout(resolve, 500));

    } catch (error) {
      console.error('[Cart Saver] Error adding item:', payload, error);
      successCount.failed++;
    }
  }

  console.log('[Cart Saver] Re-add summary:', successCount);

  if (successCount.failed > 0) {
    throw new Error(`Failed to add ${successCount.failed} item(s). ${successCount.added} item(s) added successfully.`);
  }

  return { successCount, cartId };
}

/**
 * Met à jour le localStorage avec les données du cart
 * Pour que React détecte le changement
 */
function updateLocalStorageCart(cartId, cartData) {
  try {
    console.log('[Cart Saver] Updating localStorage with cart data:', cartId);

    // Mettre à jour ngStorage-cartState
    const cartState = {
      cartId: cartId,
      restaurantId: cartData.restaurant_ids?.[0] || null,
      orderMethod: cartData.fulfillment_info?.type || 'DELIVERY'
    };

    localStorage.setItem('ngStorage-cartState', JSON.stringify(cartState));
    console.log('[Cart Saver] Updated ngStorage-cartState:', cartState);

    // Déclencher un événement storage pour que React détecte le changement
    window.dispatchEvent(new StorageEvent('storage', {
      key: 'ngStorage-cartState',
      newValue: JSON.stringify(cartState),
      url: window.location.href
    }));

  } catch (e) {
    console.error('[Cart Saver] Error updating localStorage:', e);
  }
}

/**
 * Injecte le HTML sauvegardé dans le DOM
 */
async function injectSavedHTML(cartHTML) {
  try {
    console.log('[Cart Saver] Injecting saved HTML into DOM...');

    if (!cartHTML || !cartHTML.popoverHTML) {
      console.warn('[Cart Saver] No HTML to inject');
      return false;
    }

    // 1. Trouver le conteneur popover-content
    const popoverContent = document.querySelector('.popover-content');

    if (!popoverContent) {
      console.error('[Cart Saver] Popover content container not found');
      return false;
    }

    // 2. Remplacer tout le contenu du popover avec le HTML sauvegardé
    console.log('[Cart Saver] Replacing popover content...');
    popoverContent.innerHTML = cartHTML.popoverHTML;

    console.log('[Cart Saver] ✅ Popover HTML injected successfully!');

    // 3. Mettre à jour le badge du nombre d'items sur l'icône du cart
    const itemCountBadge = document.querySelector('[data-testid="toggleCart-bag-button-total-item-quantity"]');

    if (itemCountBadge && cartHTML.itemCount) {
      console.log('[Cart Saver] Updating item count badge to:', cartHTML.itemCount);
      itemCountBadge.textContent = cartHTML.itemCount;

      // S'assurer que le bouton affiche bien qu'il y a des items
      const cartButton = document.querySelector('[data-testid="toggleCart-bag-button"]');
      if (cartButton && !cartButton.classList.contains('mainNavBtn-myBag--withItems')) {
        cartButton.classList.add('mainNavBtn-myBag--withItems');
        console.log('[Cart Saver] Added "withItems" class to cart button');
      }

      console.log('[Cart Saver] ✅ Item count badge updated!');
    }

    return true;

  } catch (e) {
    console.error('[Cart Saver] Error injecting HTML:', e);
    return false;
  }
}

/**
 * Déclenche un rafraîchissement du cart
 */
async function triggerCartRefresh(cartId, savedCartHTML) {
  try {
    console.log('[Cart Saver] Triggering cart refresh for:', cartId);

    // ÉTAPE 1: Ouvrir le cart s'il est fermé
    const cartIcon = document.querySelector('[data-testid="cart-icon"]') ||
                    document.querySelector('button[aria-label*="bag" i]') ||
                    document.querySelector('svg[aria-label*="cart" i]');

    if (cartIcon) {
      const clickable = cartIcon.tagName === 'BUTTON' ? cartIcon : cartIcon.closest('button');
      const globalCart = document.querySelector('[data-testid="global-cart"]');
      const isCartOpen = globalCart && globalCart.offsetParent !== null;

      if (!isCartOpen && clickable) {
        console.log('[Cart Saver] Opening cart...');
        clickable.click();
        await new Promise(resolve => setTimeout(resolve, 600));
      }
    }

    // ÉTAPE 2: Attendre que le DOM se stabilise
    await new Promise(resolve => setTimeout(resolve, 800));

    // ÉTAPE 3: Vérifier si le cart affiche toujours "Your bag is empty"
    const cartContainer = document.querySelector('[data-testid="global-cart"]');
    const isEmpty = cartContainer && cartContainer.innerHTML.includes('Your bag is empty');

    console.log('[Cart Saver] Cart is empty in DOM:', isEmpty);

    if (isEmpty && savedCartHTML) {
      // ÉTAPE 4: Le DOM est toujours vide, injecter le HTML sauvegardé
      console.log('[Cart Saver] DOM still shows empty, injecting saved HTML...');
      const injected = await injectSavedHTML(savedCartHTML);

      if (injected) {
        console.log('[Cart Saver] ✅ Cart displayed successfully with saved HTML!');
        showNotification('Cart loaded and displayed!', 'success');
      } else {
        console.warn('[Cart Saver] Failed to inject HTML, reloading page...');
        showNotification('Reloading to display items...', 'info');
        await new Promise(resolve => setTimeout(resolve, 1000));
        window.location.reload();
      }
    } else if (!isEmpty) {
      // Le DOM s'est mis à jour tout seul !
      console.log('[Cart Saver] ✅ Cart updated automatically in DOM!');
      showNotification('Cart loaded successfully!', 'success');
    } else {
      // Pas de HTML sauvegardé, fallback sur reload
      console.log('[Cart Saver] No saved HTML, reloading page...');
      showNotification('Reloading to display items...', 'info');
      await new Promise(resolve => setTimeout(resolve, 1000));
      window.location.reload();
    }

  } catch (e) {
    console.error('[Cart Saver] Error triggering cart refresh:', e);
    window.location.reload();
  }
}

/**
 * Affiche une notification à l'utilisateur
 */
function showNotification(message, type = 'info') {
  // Créer une notification visuelle
  const notification = document.createElement('div');
  notification.className = `cart-saver-notification cart-saver-${type}`;
  notification.textContent = message;

  document.body.appendChild(notification);

  // Faire apparaître avec animation
  setTimeout(() => notification.classList.add('show'), 100);

  // Retirer après 3 secondes
  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

// Initialiser le script
init();

// Écouter les changements de navigation (SPA)
let lastUrl = location.href;
new MutationObserver(() => {
  const url = location.href;
  if (url !== lastUrl) {
    lastUrl = url;
    retryCount = 0;
    injectButtons();
  }
}).observe(document, { subtree: true, childList: true });
