/**
 * Popup Script - Interface de l'extension
 */

// Éléments du DOM
const statusDiv = document.getElementById('status');
const statusMessage = document.getElementById('statusMessage');
const cartInfo = document.getElementById('cartInfo');
const viewCartBtn = document.getElementById('viewCart');
const clearCartBtn = document.getElementById('clearCart');
const openGrubhubBtn = document.getElementById('openGrubhub');

// Initialisation au chargement
document.addEventListener('DOMContentLoaded', loadCartStatus);

/**
 * Charge et affiche le statut du panier sauvegardé
 */
async function loadCartStatus() {
  try {
    const result = await chrome.storage.local.get('savedCart');

    if (result.savedCart) {
      const cart = result.savedCart;
      const date = new Date(cart.timestamp);

      // Support des anciennes et nouvelles versions
      const itemCount = (cart.payloads || cart.items || []).length;

      // Afficher qu'il y a un panier
      statusDiv.className = 'status has-cart';
      statusMessage.textContent = 'Saved cart available';

      // Afficher les détails
      cartInfo.innerHTML = `
        <strong>Restaurant ID:</strong> ${cart.context.restaurantId || 'N/A'}<br>
        <strong>Number of items:</strong> ${itemCount}<br>
        <strong>Method:</strong> ${cart.context.orderMethod || 'N/A'}<br>
        <strong>Saved on:</strong> ${date.toLocaleDateString('en-US')} at ${date.toLocaleTimeString('en-US')}
      `;
      cartInfo.classList.remove('hidden');

      // Afficher les boutons
      viewCartBtn.classList.remove('hidden');
      clearCartBtn.classList.remove('hidden');
    } else {
      // Pas de panier sauvegardé
      statusDiv.className = 'status no-cart';
      statusMessage.textContent = 'No saved cart';
      cartInfo.classList.add('hidden');
      viewCartBtn.classList.add('hidden');
      clearCartBtn.classList.add('hidden');
    }
  } catch (error) {
    console.error('[Cart Saver] Error loading cart status:', error);
    statusMessage.textContent = 'Loading error';
  }
}

/**
 * Affiche les détails du panier dans la console
 */
viewCartBtn.addEventListener('click', async () => {
  try {
    const result = await chrome.storage.local.get('savedCart');
    if (result.savedCart) {
      console.log('[Cart Saver] Saved Cart:', result.savedCart);
      alert(`Saved cart:\n\n${JSON.stringify(result.savedCart, null, 2)}\n\nSee console for more details.`);
    }
  } catch (error) {
    console.error('[Cart Saver] Error viewing cart:', error);
  }
});

/**
 * Supprime le panier sauvegardé
 */
clearCartBtn.addEventListener('click', async () => {
  if (confirm('Are you sure you want to delete the saved cart?')) {
    try {
      await chrome.storage.local.remove('savedCart');
      console.log('[Cart Saver] Cart cleared');
      loadCartStatus(); // Recharger l'interface
    } catch (error) {
      console.error('[Cart Saver] Error clearing cart:', error);
      alert('Error deleting cart');
    }
  }
});

/**
 * Ouvre Grubhub dans un nouvel onglet
 */
openGrubhubBtn.addEventListener('click', () => {
  chrome.tabs.create({ url: 'https://www.grubhub.com' });
});
