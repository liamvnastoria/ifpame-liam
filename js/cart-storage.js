/**
 * Le panier du compte connecté, stocké SUR LE SERVEUR.
 *
 * Depuis l'ajout du panier par compte, le panier ne vit plus dans le
 * navigateur : il vit dans la table cart_items, lié au compte. Ce fichier
 * est la passerelle entre les pages et l'API, et il conserve une COPIE du
 * panier en mémoire (cartCache) pour que les pages puissent afficher le
 * contenu sans faire un appel réseau à chaque rendu.
 *
 * Structure d'une ligne :
 *
 *   { id: 3, name: "Étagère murale", price: 39.5,
 *     image_url: null, stock: 0, quantity: 2 }
 *
 * price est le prix EFFECTIF (promotion comprise), calculé par le serveur.
 * Point capital : le panier serveur est une source de vérité. Au moment de
 * commander, PHP relit les prix en base et le panier dans cart_items : le
 * navigateur ne fait que l'afficher.
 *
 * Ce fichier est chargé sur toutes les pages. Il ne contient que des
 * fonctions : rien ne s'exécute tant qu'une page ne les appelle pas.
 */

// Copie locale du panier serveur. null = "pas encore chargé / pas connecté",
// et getCart() renvoie alors un panier vide pour ne faire planter aucune page.
let cartCache = null;

/**
 * Recharge le panier depuis le serveur (GET api/cart.php).
 * À appeler après une connexion : c'est le moment où le panier du compte
 * doit apparaître.
 */
async function loadCart() {
  const data = await fetchJson("api/cart.php");
  cartCache = data.items || [];
  return cartCache;
}

/** Renvoie le contenu actuellement connu du panier (vide si non chargé). */
function getCart() {
  return cartCache === null ? [] : cartCache;
}

/**
 * Réinitialise la copie locale. À appeler quand personne n'est connecté ou
 * juste après une commande : l'écran ne doit plus montrer un panier fantôme.
 */
function resetCartCache() {
  cartCache = null;
}

/**
 * Ajoute un produit au panier (action "add" : la quantité s'additionne).
 * Le serveur vérifie le stock : il peut refuser l'ajout.
 *
 * @returns {number} La quantité totale de ce produit dans le panier, ou 0.
 */
async function addToCart(productId, quantity) {
  const data = await fetchJson("api/cart.php", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ product_id: productId, quantity: quantity, action: "add" }),
  });
  cartCache = data.items || [];
  return data.count || 0;
}

/**
 * Fixe la quantité d'une ligne (action "set") : c'est ce qu'utilise le champ
 * de quantité de la page panier. Une valeur invalide est refusée par le
 * serveur (400), le serveur ne descend jamais sous 1.
 */
async function updateQuantity(productId, quantity) {
  const data = await fetchJson("api/cart.php", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ product_id: productId, quantity: quantity, action: "set" }),
  });
  cartCache = data.items || [];
}

/** Supprime un produit du panier. */
async function removeFromCart(productId) {
  const data = await fetchJson("api/cart.php", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ product_id: productId }),
  });
  cartCache = data.items || [];
}

/** Vide le panier côté serveur. */
async function clearCart() {
  const data = await fetchJson("api/cart.php", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  cartCache = data.items || [];
}

/** Nombre total d'articles (quantités additionnées), pour le badge de l'en-tête. */
function getCartCount() {
  return getCart().reduce((total, line) => total + line.quantity, 0);
}

/**
 * Montant du panier, calculé à partir des prix renvoyés par le serveur.
 * Il sert UNIQUEMENT à l'affichage : le montant qui fait foi est celui que
 * PHP recalcule au moment de la commande.
 */
function getCartTotal() {
  return getCart().reduce((total, line) => total + line.price * line.quantity, 0);
}

/** Met à jour le badge du panier dans l'en-tête, présent sur toutes les pages. */
function refreshCartBadge() {
  const badge = document.querySelector("[data-cart-count]");
  if (badge === null) {
    return;
  }

  const count = getCartCount();
  badge.textContent = count;
  // Un panier vide, ou un visiteur non connecté, ne doit pas afficher une
  // bulle de compteur.
  badge.hidden = cartCache === null || count === 0;
}