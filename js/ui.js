/**
 * Petits blocs d'affichage réutilisés par plusieurs pages.
 *
 * Ces fonctions ne font aucun appel réseau : elles transforment seulement des
 * données déjà en mémoire en éléments du DOM. Elles existent parce que la même
 * construction serait sinon recopiée dans products.js, product.js et cart.js.
 */

/**
 * Formate un montant pour un visiteur francophone : 49.9 devient « 49,90 € ».
 * Intl gère la virgule décimale et le placement du symbole selon la locale,
 * ce qu'un simple prix + " €" ne ferait pas correctement.
 */
function formatPrice(amount) {
  return new Intl.NumberFormat("fr-BE", {
    style: "currency",
    currency: "EUR",
  }).format(Number(amount));
}

/**
 * Affiche un message dans la zone d'alerte de la page.
 *
 * @param {HTMLElement} element La zone prévue dans le HTML (souvent #message).
 * @param {string} text         Le texte à afficher.
 * @param {string} type         "error", "success" ou "info".
 */
function showMessage(element, text, type) {
  // textContent et non innerHTML : le texte est inséré COMME DU TEXTE. Un nom
  // de produit contenant "<script>" ne pourra donc jamais être exécuté par le
  // navigateur. C'est la protection la plus simple contre l'injection HTML.
  element.textContent = text;
  element.className = "alert alert--" + type;
  element.hidden = false;
}

/** Vide et masque une zone de message. */
function hideMessage(element) {
  element.textContent = "";
  element.hidden = true;
}

/**
 * Construit la vignette d'un produit : son image si elle existe, sinon un bloc
 * coloré avec l'initiale du nom. Sans ce repli, un produit sans image
 * afficherait une icône d'image cassée.
 */
function createThumbnail(product) {
  const wrapper = document.createElement("div");
  wrapper.className = "thumb";

  if (product.image_url) {
    const image = document.createElement("img");
    image.src = product.image_url;
    image.alt = product.name;
    wrapper.append(image);
  } else {
    const letter = document.createElement("span");
    letter.className = "thumb__letter";
    letter.textContent = product.name.charAt(0).toUpperCase();
    wrapper.append(letter);
  }

  return wrapper;
}

/** Construit le badge de disponibilité d'un produit. */
function createStockBadge(product) {
  const badge = document.createElement("span");

  if (product.stock === 0) {
    badge.className = "badge badge--out";
    badge.textContent = "Rupture de stock";
  } else if (product.stock <= 3) {
    badge.className = "badge badge--low";
    badge.textContent = "Plus que " + product.stock + " en stock";
  } else {
    badge.className = "badge badge--ok";
    badge.textContent = "En stock";
  }

  return badge;
}
