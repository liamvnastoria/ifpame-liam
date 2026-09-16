/**
 * Le panier, stocké dans localStorage.
 *
 * Ce fichier est chargé sur toutes les pages. Il ne contient que des fonctions :
 * rien ne s'exécute tant qu'une page ne les appelle pas.
 *
 * Le panier est un TABLEAU d'objets, enregistré en JSON sous la clé CART_KEY :
 *
 *   [{ id: 3, name: "Étagère murale", price: 39.5,
 *      image_url: null, stock: 0, quantity: 2 }]
 *
 * Point capital : ce tableau vit dans le navigateur, ce n'est donc PAS une
 * source de vérité. Le prix et le stock y sont recopiés pour l'affichage
 * seulement. Au moment de commander, la page de checkout n'envoie que
 * id + quantity, et PHP relit les vrais prix en base (voir js/checkout.js).
 */

const CART_KEY = "shop_cart";

/**
 * Lit le panier depuis localStorage.
 * Renvoie toujours un tableau, même si la valeur enregistrée est absente,
 * vide ou corrompue : aucune page ne doit planter pour un panier illisible.
 */
function getCart() {
  const raw = localStorage.getItem(CART_KEY);
  if (raw === null) {
    return [];
  }

  try {
    const items = JSON.parse(raw);
    if (!Array.isArray(items)) {
      return [];
    }
    // Filtrage minimal : une entrée sans id ou sans quantité positive est
    // ignorée plutôt que de produire des lignes vides dans le tableau.
    return items.filter((line) => line !== null && line.id != null && line.quantity > 0);
  } catch (error) {
    // JSON.parse échoue si la valeur a été modifiée à la main dans les outils
    // du navigateur. On repart d'un panier vide au lieu de bloquer le site.
    console.warn("Panier illisible, réinitialisation.", error);
    localStorage.removeItem(CART_KEY);
    return [];
  }
}

/** Écrit le panier. localStorage ne sait stocker que des chaînes : d'où JSON.stringify. */
function saveCart(items) {
  localStorage.setItem(CART_KEY, JSON.stringify(items));
}

/**
 * Ajoute un produit au panier, ou augmente sa quantité s'il y est déjà.
 *
 * @returns {number} La quantité finale dans le panier, ou 0 si rien n'a été ajouté.
 */
function addToCart(product, quantity) {
  const cart = getCart();
  const wanted = Math.max(1, Math.floor(Number(quantity) || 1));
  const line = cart.find((item) => item.id === product.id);
  const alreadyInCart = line ? line.quantity : 0;
  const stock = Number(product.stock);

  // On ne dépasse jamais le stock connu à cet instant : c'est une limite
  // d'interface, pas une sécurité. Le contrôle réel a lieu en PHP, car le
  // stock a très bien pu baisser depuis l'affichage de la page.
  const finalQuantity = Math.min(alreadyInCart + wanted, stock);
  if (finalQuantity < 1) {
    return 0;
  }

  if (line) {
    line.quantity = finalQuantity;
    // Le nom, le prix et le stock sont rafraîchis : le panier reste cohérent
    // si le produit a changé depuis le dernier ajout.
    line.name = product.name;
    line.price = Number(product.price);
    line.image_url = product.image_url;
    line.stock = stock;
  } else {
    cart.push({
      id: product.id,
      name: product.name,
      price: Number(product.price),
      image_url: product.image_url,
      stock: stock,
      quantity: finalQuantity,
    });
  }

  saveCart(cart);
  return finalQuantity;
}

/**
 * Modifie la quantité d'une ligne existante.
 * Une valeur invalide (0, vide, texte) retombe sur 1 : vider une ligne est une
 * action explicite, pas un effet de bord d'une saisie ratée.
 */
function updateQuantity(productId, quantity) {
  const cart = getCart();
  const line = cart.find((item) => item.id === productId);
  if (!line) {
    return false;
  }

  const value = Math.floor(Number(quantity));
  if (!Number.isFinite(value) || value < 1) {
    line.quantity = 1;
  } else {
    line.quantity = Math.min(value, line.stock);
  }

  saveCart(cart);
  return true;
}

/** Supprime une ligne du panier. */
function removeFromCart(productId) {
  const cart = getCart().filter((item) => item.id !== productId);
  saveCart(cart);
}

/** Vide le panier (après une commande réussie, ou via le bouton « Vider »). */
function clearCart() {
  localStorage.removeItem(CART_KEY);
}

/** Nombre total d'articles (quantités additionnées), pour le badge de l'en-tête. */
function getCartCount() {
  return getCart().reduce((total, line) => total + line.quantity, 0);
}

/**
 * Montant du panier, calculé à partir des prix mémorisés localement.
 *
 * Ce total sert UNIQUEMENT à l'affichage. Il peut différer du montant réel si
 * un prix a changé en base depuis l'ajout au panier : le montant qui fait foi
 * est celui que PHP recalculera et renverra avec la commande.
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
  // Un panier vide ne doit pas afficher une bulle « 0 ».
  badge.hidden = count === 0;
}
