# Grubhub Cart Saver Extension

Extension Chrome/Firefox pour sauvegarder et restaurer votre panier Grubhub avec tous les items et modificateurs.

## 📁 Structure du projet

```
add-on/
├── manifest.json          # Configuration de l'extension
├── content-script.js      # Script injecté dans les pages Grubhub
├── background.js          # Service worker pour les tâches en arrière-plan
├── style.css             # Styles pour les boutons et notifications
├── popup.html            # Interface popup de l'extension
├── popup.js              # Script pour la popup
└── icons/                # Icons de l'extension (à créer)
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

## 🚀 Installation

### Mode développeur

1. **Chrome:**
   - Ouvrir `chrome://extensions/`
   - Activer "Mode développeur" (coin supérieur droit)
   - Cliquer sur "Charger l'extension non empaquetée"
   - Sélectionner le dossier `add-on/`

2. **Firefox:**
   - Ouvrir `about:debugging#/runtime/this-firefox`
   - Cliquer sur "Charger un module complémentaire temporaire"
   - Sélectionner le fichier `manifest.json`

## 🎨 Icons

Les icons ne sont pas encore créés. Vous devez créer 3 fichiers PNG :

- `icons/icon16.png` - 16x16 pixels
- `icons/icon48.png` - 48x48 pixels
- `icons/icon128.png` - 128x128 pixels

Vous pouvez utiliser un simple logo avec un panier ou le symbole 💾.

## ⚠️ État actuel

### ✅ Implémenté

- Structure de base de l'extension (Manifest V3)
- Injection des boutons Save/Load dans la page (centrés en haut)
- Extraction du contexte (restaurant, cartId, méthode de commande)
- Sauvegarde dans le storage de l'extension
- Validation du contexte avant de charger
- Système de notifications
- Interface popup pour gérer les paniers sauvegardés
- Gestion de la navigation SPA (Single Page Application)
- **Extraction des items via l'API Grubhub** (`GET /carts/{cartId}`)
- **Réajout des items au panier via l'API** (`POST /carts/{cartId}/lines`)
- Support complet des options/modificateurs

### 🎯 Fonctionnalités principales

L'extension est maintenant **fonctionnelle** ! Elle peut :
- Sauvegarder votre panier avec tous les items et leurs options
- Restaurer le panier sur le même restaurant
- Gérer les quantités, instructions spéciales, et modificateurs
- Afficher des notifications de succès/erreur

### ⚠️ Points à tester

1. Tester sur différents restaurants
2. Vérifier le comportement avec des items complexes (multiples options)
3. Tester la restauration sur un panier vide vs un panier existant
4. Vérifier les cas d'erreur (mauvais restaurant, API indisponible, etc.)

## 🔌 API Grubhub utilisées

L'extension utilise les API suivantes :

### Récupération du panier
```
GET https://api-gtm.grubhub.com/carts/{cartId}
Headers:
  accept: application/json
  x-gh-features: 60=18045;appName=@grubhubprod/order-taking-client-sdk;appVersion=16.4.0;
```

### Ajout d'un item au panier
```
POST https://api-gtm.grubhub.com/carts/{cartId}/lines
Headers:
  accept: application/json
  content-type: application/json;charset=UTF-8
  x-gh-features: 60=18045;appName=@grubhubprod/order-taking-client-sdk;appVersion=16.4.0;
Body:
{
  "menu_item_id": "303559337064",
  "brand": "GRUBHUB",
  "experiments": ["LINEOPTION_ENHANCEMENTS"],
  "quantity": 1,
  "special_instructions": "",
  "options": [{
    "quantity": 1,
    "id": 303559339504,
    "child_options": [],
    "sub_option_ids": []
  }],
  "cost": 7.39,
  "restaurant_id": "2292950",
  "popular": false,
  "isBadged": false,
  "source": "cart_saver_extension"
}
```

## 🧪 Testing

1. Charger l'extension en mode développeur
2. Aller sur https://www.grubhub.com
3. Naviguer vers un restaurant
4. Les boutons "💾 Save Cart" et "📥 Load Cart" devraient apparaître
5. Ajouter des items au panier
6. Cliquer sur Save
7. Vider le panier
8. Cliquer sur Load

## 📝 Notes

- L'extension fonctionne uniquement sur `*.grubhub.com`
- Les données sont stockées localement dans le navigateur
- Le panier est validé avant chargement (même restaurant)
- Support des Single Page Applications (SPA) avec MutationObserver

## 🐛 Debug

Pour voir les logs dans la console :
1. Ouvrir les DevTools sur une page Grubhub
2. Chercher les messages `[Cart Saver]`
3. Vérifier le storage : DevTools > Application > Storage > Extension Storage
# add-on
