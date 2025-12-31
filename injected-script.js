/**
 * Script injecté dans la page Grubhub
 * S'exécute dans le contexte de la page et a accès aux cookies
 */

/**
 * Récupère le token d'authentification depuis le localStorage
 */
function getAuthToken() {
  try {
    const sdkData = localStorage.getItem('__ghsdk_data');

    if (sdkData) {
      const parsed = JSON.parse(sdkData);
      const token = parsed?.auth?.credentials?.session_handle?.access_token;
      if (token) {
        return token;
      }
    }

    const authData = localStorage.getItem('ngStorage-account');
    if (authData) {
      const parsed = JSON.parse(authData);
      const token = parsed.session_token || parsed.sessionToken || parsed.token || parsed.access_token;
      if (token) {
        return token;
      }
    }

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

  const { action, eventId, params } = event.data;

  try {
    let result;
    const authToken = getAuthToken();
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

    if (action === 'CREATE_CART') {
      headers['content-type'] = 'application/json;charset=UTF-8';

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

      const response = await fetch(`${API_BASE}/carts`, {
        method: 'POST',
        headers: headers,
        credentials: 'include',
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`Failed to create cart: ${response.status}`);
      }

      result = await response.json();

    } else if (action === 'GET_CART') {
      const response = await fetch(`${API_BASE}/carts`, {
        method: 'GET',
        headers: headers,
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch carts: ${response.status}`);
      }

      result = await response.json();

    } else if (action === 'GET_CART_BY_ID') {
      const response = await fetch(`${API_BASE}/carts/${params.cartId}`, {
        method: 'GET',
        headers: headers,
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch cart: ${response.status}`);
      }

      result = await response.json();

    } else if (action === 'ADD_ITEM') {
      headers['content-type'] = 'application/json;charset=UTF-8';

      const response = await fetch(`${API_BASE}/carts/${params.cartId}/lines`, {
        method: 'POST',
        headers: headers,
        credentials: 'include',
        body: JSON.stringify(params.payload)
      });

      if (!response.ok) {
        throw new Error(`Failed to add item: ${response.status}`);
      }

      result = await response.json();
    }

    // Envoyer la réponse
    window.postMessage({
      type: 'CART_SAVER_RESPONSE',
      eventId: eventId,
      result: result
    }, '*');

  } catch (error) {
    console.error('[Cart Saver] Error:', error);
    window.postMessage({
      type: 'CART_SAVER_RESPONSE',
      eventId: eventId,
      error: error.message || error.toString()
    }, '*');
  }
});
