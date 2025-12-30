/**
 * Background Service Worker - Grubhub Cart Saver
 * Gère les événements globaux et peut intercepter les requêtes réseau
 */

console.log('[Cart Saver] Background service worker loaded');

// Installation de l'extension
chrome.runtime.onInstalled.addListener((details) => {
  console.log('[Cart Saver] Extension installed/updated:', details.reason);

  if (details.reason === 'install') {
    // Première installation
    console.log('[Cart Saver] First installation');
  } else if (details.reason === 'update') {
    // Mise à jour
    console.log('[Cart Saver] Extension updated');
  }
});

// Écouter les messages depuis le content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Cart Saver] Message received:', message);

  switch (message.action) {
    case 'saveCart':
      handleSaveCart(message.data, sendResponse);
      return true; // Garde la connexion ouverte pour sendResponse async

    case 'loadCart':
      handleLoadCart(message.data, sendResponse);
      return true;

    case 'addItemToCart':
      // TODO: Intercepter ou faire l'API call pour ajouter un item
      handleAddItem(message.data, sendResponse);
      return true;

    default:
      console.warn('[Cart Saver] Unknown action:', message.action);
  }
});

/**
 * Sauvegarde le panier
 */
async function handleSaveCart(cartData, sendResponse) {
  try {
    await chrome.storage.local.set({ savedCart: cartData });
    console.log('[Cart Saver] Cart saved in background:', cartData);
    sendResponse({ success: true });
  } catch (error) {
    console.error('[Cart Saver] Error saving cart:', error);
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Charge le panier sauvegardé
 */
async function handleLoadCart(data, sendResponse) {
  try {
    const result = await chrome.storage.local.get('savedCart');
    console.log('[Cart Saver] Cart loaded from background:', result.savedCart);
    sendResponse({ success: true, cart: result.savedCart });
  } catch (error) {
    console.error('[Cart Saver] Error loading cart:', error);
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Ajoute un item au panier via API
 * TODO: Implémenter avec les vraies API calls après analyse des payloads
 */
async function handleAddItem(itemData, sendResponse) {
  try {
    console.log('[Cart Saver] Would add item:', itemData);

    // TODO: Faire l'appel API réel ici
    // const response = await fetch('https://api.grubhub.com/...', {
    //   method: 'POST',
    //   headers: { ... },
    //   body: JSON.stringify(itemData)
    // });

    // Pour l'instant, juste simuler
    sendResponse({ success: true, message: 'Item added (simulated)' });
  } catch (error) {
    console.error('[Cart Saver] Error adding item:', error);
    sendResponse({ success: false, error: error.message });
  }
}

// Optionnel: Intercepter les requêtes réseau (pour debug)
// chrome.webRequest.onBeforeRequest.addListener(
//   (details) => {
//     if (details.url.includes('api.grubhub.com')) {
//       console.log('[Cart Saver] API Request:', details);
//     }
//   },
//   { urls: ['*://*.grubhub.com/*'] },
//   ['requestBody']
// );
