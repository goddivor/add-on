/**
 * Content Script - Grubhub Cart Saver
 * Injecte les boutons Save/Load et gère l'interaction avec la page
 */

// État global
let injectedScriptLoaded = false;

/**
 * Injecte le script externe dans la page
 */
function injectExternalScript() {
  if (injectedScriptLoaded) return;

  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('injected-script.js');
  script.onload = () => {
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
    if (!injectedScriptLoaded) {
      setTimeout(() => {
        if (!injectedScriptLoaded) {
          reject(new Error('Injected script not loaded. Please refresh the page.'));
          return;
        }
        sendPageScriptRequest(action, params).then(resolve).catch(reject);
      }, 2000);
      return;
    }

    const eventId = 'cart-saver-' + Math.random().toString(36).substr(2, 9);

    const handleMessage = (event) => {
      if (event.source !== window) return;
      if (event.data && event.data.type === 'CART_SAVER_RESPONSE' && event.data.eventId === eventId) {
        window.removeEventListener('message', handleMessage);
        clearTimeout(timeoutId);

        if (event.data.error) {
          reject(new Error(event.data.error));
        } else {
          resolve(event.data.result);
        }
      }
    };

    window.addEventListener('message', handleMessage);

    window.postMessage({
      type: 'CART_SAVER_REQUEST',
      eventId: eventId,
      action: action,
      params: params
    }, '*');

    const timeoutId = setTimeout(() => {
      window.removeEventListener('message', handleMessage);
      reject(new Error('Timeout waiting for page script response'));
    }, 15000);
  });
}

/**
 * Initialisation
 */
function init() {
  injectExternalScript();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(injectButtons, 500));
  } else {
    setTimeout(injectButtons, 500);
  }
}

/**
 * Injecte les boutons Save/Load dans la page avec position fixe
 */
function injectButtons() {
  if (!isRestaurantPage()) {
    return;
  }

  if (document.getElementById('grubhub-cart-saver-buttons')) {
    return;
  }

  const container = document.createElement('div');
  container.id = 'grubhub-cart-saver-buttons';
  container.className = 'cart-saver-container';

  const saveBtn = createButton('save', '💾 Save Cart', handleSaveCart);
  const loadBtn = createButton('load', '📥 Load Cart', handleLoadCart);

  container.appendChild(saveBtn);
  container.appendChild(loadBtn);

  document.body.appendChild(container);
}

/**
 * Vérifie si on est sur une page de restaurant
 */
function isRestaurantPage() {
  const url = window.location.href;
  return url.includes('/restaurant/') || url.includes('/menu');
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
    const context = extractContext();
    const payloads = await extractCartItems();

    if (payloads.length === 0) {
      showNotification('Cart is empty!', 'warning');
      return;
    }

    const savedCart = {
      context,
      payloads,
      timestamp: Date.now(),
      url: window.location.href
    };

    await chrome.storage.local.set({ savedCart });
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
    const result = await chrome.storage.local.get('savedCart');

    if (!result.savedCart) {
      showNotification('No saved cart found!', 'warning');
      return;
    }

    const { savedCart } = result;
    const payloads = savedCart.payloads || savedCart.items;

    if (!payloads || payloads.length === 0) {
      showNotification('Saved cart is empty!', 'warning');
      return;
    }

    const currentContext = extractContext();

    if (!isValidContext(savedCart.context, currentContext)) {
      showNotification('Wrong restaurant or location!', 'error');
      return;
    }

    showNotification(`Adding ${payloads.length} items to cart...`, 'info');
    await readdItemsToCart(payloads);

    // Recharger la page pour afficher les items
    showNotification('Cart loaded! Reloading page...', 'success');
    await new Promise(resolve => setTimeout(resolve, 1000));
    window.location.reload();

  } catch (error) {
    console.error('[Cart Saver] Error loading cart:', error);
    showNotification('Failed to load cart!', 'error');
  }
}

/**
 * Extrait le contexte (restaurant, location, menu)
 */
function extractContext() {
  const cartState = localStorage.getItem('ngStorage-cartState');

  let context = {
    restaurantId: null,
    cartId: null,
    orderMethod: null,
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

  const urlMatch = window.location.pathname.match(/\/restaurant\/[^\/]+\/(\d+)/);
  if (urlMatch) {
    context.restaurantId = context.restaurantId || urlMatch[1];
  }

  return context;
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
    cost: (lineItem.price || 0) / 100,
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
    return [];
  }

  try {
    const cartsData = await sendPageScriptRequest('GET_CART', {
      cartId: context.cartId
    });

    const currentCart = cartsData.carts ? cartsData.carts[context.cartId] : cartsData;

    if (!currentCart) {
      return [];
    }

    const lineItems = currentCart.charges?.lines?.line_items || [];

    if (lineItems.length === 0) {
      return [];
    }

    const payloads = lineItems.map(lineItem => {
      try {
        return lineItemToPayload(lineItem, context.restaurantId);
      } catch (e) {
        console.error('[Cart Saver] Error transforming line item:', lineItem, e);
        return null;
      }
    }).filter(p => p !== null);

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
  if (savedContext.restaurantId !== currentContext.restaurantId) {
    return false;
  }
  return true;
}

/**
 * Réajoute les items au panier
 */
async function readdItemsToCart(payloads) {
  const context = extractContext();

  // Créer un nouveau cart
  const newCart = await sendPageScriptRequest('CREATE_CART', {});
  const cartId = newCart.id;

  // GET du cart vide
  await sendPageScriptRequest('GET_CART_BY_ID', { cartId: cartId });

  // Ajouter tous les items au nouveau cart
  for (let i = 0; i < payloads.length; i++) {
    const payload = payloads[i];
    try {
      const finalPayload = {
        ...payload,
        restaurant_id: context.restaurantId
      };

      await sendPageScriptRequest('ADD_ITEM', {
        cartId: cartId,
        payload: finalPayload
      });

      // GET du cart après chaque ajout
      const updatedCart = await sendPageScriptRequest('GET_CART_BY_ID', { cartId: cartId });

      // Mettre à jour le localStorage
      updateLocalStorageCart(cartId, updatedCart);

      // Attendre un peu entre chaque item
      await new Promise(resolve => setTimeout(resolve, 500));

    } catch (error) {
      console.error('[Cart Saver] Error adding item:', payload, error);
    }
  }

  // Attendre un peu que toutes les requêtes se terminent
  await new Promise(resolve => setTimeout(resolve, 500));

  console.log('[Cart Saver] All items added successfully! Reloading page...');
}

/**
 * Met à jour le localStorage avec les données du cart
 */
function updateLocalStorageCart(cartId, cartData) {
  try {
    const cartState = {
      cartId: cartId,
      restaurantId: cartData.restaurant_ids?.[0] || null,
      orderMethod: cartData.fulfillment_info?.type || 'DELIVERY'
    };

    localStorage.setItem('ngStorage-cartState', JSON.stringify(cartState));

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
 * Affiche une notification à l'utilisateur
 */
function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `cart-saver-notification cart-saver-${type}`;
  notification.textContent = message;

  document.body.appendChild(notification);

  setTimeout(() => notification.classList.add('show'), 100);

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
    setTimeout(injectButtons, 500);
  }
}).observe(document, { subtree: true, childList: true });
