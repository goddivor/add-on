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
      statusMessage.textContent = 'Panier sauvegardé disponible';

      // Afficher les détails
      cartInfo.innerHTML = `
        <strong>Restaurant ID:</strong> ${cart.context.restaurantId || 'N/A'}<br>
        <strong>Nombre d'items:</strong> ${itemCount}<br>
        <strong>Méthode:</strong> ${cart.context.orderMethod || 'N/A'}<br>
        <strong>Sauvegardé le:</strong> ${date.toLocaleDateString('fr-FR')} à ${date.toLocaleTimeString('fr-FR')}
      `;
      cartInfo.classList.remove('hidden');

      // Afficher les boutons
      viewCartBtn.classList.remove('hidden');
      clearCartBtn.classList.remove('hidden');
    } else {
      // Pas de panier sauvegardé
      statusDiv.className = 'status no-cart';
      statusMessage.textContent = 'Aucun panier sauvegardé';
      cartInfo.classList.add('hidden');
      viewCartBtn.classList.add('hidden');
      clearCartBtn.classList.add('hidden');
    }
  } catch (error) {
    console.error('[Cart Saver] Error loading cart status:', error);
    statusMessage.textContent = 'Erreur de chargement';
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
      alert(`Panier sauvegardé:\n\n${JSON.stringify(result.savedCart, null, 2)}\n\nVoir la console pour plus de détails.`);
    }
  } catch (error) {
    console.error('[Cart Saver] Error viewing cart:', error);
  }
});

/**
 * Supprime le panier sauvegardé
 */
clearCartBtn.addEventListener('click', async () => {
  if (confirm('Êtes-vous sûr de vouloir supprimer le panier sauvegardé ?')) {
    try {
      await chrome.storage.local.remove('savedCart');
      console.log('[Cart Saver] Cart cleared');
      loadCartStatus(); // Recharger l'interface
    } catch (error) {
      console.error('[Cart Saver] Error clearing cart:', error);
      alert('Erreur lors de la suppression du panier');
    }
  }
});

/**
 * Ouvre Grubhub dans un nouvel onglet
 */
openGrubhubBtn.addEventListener('click', () => {
  chrome.tabs.create({ url: 'https://www.grubhub.com' });
});
