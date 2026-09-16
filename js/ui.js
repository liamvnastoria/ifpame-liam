/**
 * Composants partagés par plusieurs pages.
 *
 * Ce fichier contient les morceaux d'interface qui apparaissent à plusieurs
 * endroits : la carte produit (catalogue et homepage), la vignette, le badge
 * de stock, les messages, et la barre des départements de l'en-tête.
 *
 * Règle : tout est construit avec el() et textContent, jamais avec innerHTML.
 * Un nom de produit contenant "<script>" reste donc du TEXTE pour le
 * navigateur, il ne peut pas être exécuté. C'est la protection la plus simple
 * contre l'injection HTML, et elle ne demande aucune fonction d'échappement.
 *
 * Dépend de api.js (pour initHeaderNav) : api.js doit être chargé avant.
 */

/**
 * Petit raccourci : crée un élément, lui donne une classe et un texte.
 * Sans lui, chaque ligne du DOM demanderait trois instructions.
 */
function el(tag, className, text) {
  const element = document.createElement(tag);
  if (className) {
    element.className = className;
  }
  if (text !== undefined) {
    element.textContent = text;
  }
  return element;
}

/**
 * Formate un montant pour un visiteur francophone : 899 devient « 899,00 € ».
 * Intl gère la virgule décimale et le placement du symbole selon la locale,
 * ce qu'un simple montant + " €" ne ferait pas correctement.
 */
function formatPrice(amount) {
  return new Intl.NumberFormat("fr-BE", {
    style: "currency",
    currency: "EUR",
  }).format(Number(amount));
}

/**
 * Prix réellement payé par le client.
 *
 * Le prix normal reste dans "price" et la promotion dans "discount_price".
 * Toute la logique d'affichage passe par ici pour qu'il n'existe qu'un seul
 * endroit où l'on décide quel prix est le bon.
 */
function getEffectivePrice(product) {
  return product.discount_price === null ? product.price : product.discount_price;
}

/**
 * Affiche un message dans la zone d'alerte de la page.
 *
 * @param {HTMLElement} element La zone prévue dans le HTML (souvent #message).
 * @param {string} text         Le texte à afficher.
 * @param {string} type         "error", "success" ou "info".
 */
function showMessage(element, text, type) {
  element.textContent = text;
  element.className = "alert alert-" + type;
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
  const wrapper = el("div", "thumb");

  if (product.image_url) {
    const image = el("img");
    image.src = product.image_url;
    image.alt = product.name;
    wrapper.append(image);
  } else {
    wrapper.append(el("span", "thumb-letter", product.name.charAt(0).toUpperCase()));
  }

  return wrapper;
}

/** Construit le badge de disponibilité d'un produit. */
function createStockBadge(product) {
  if (product.stock === 0) {
    return el("span", "badge badge-out", "Rupture de stock");
  }
  if (product.stock <= 3) {
    return el("span", "badge badge-low", "Plus que " + product.stock + " en stock");
  }
  return el("span", "badge badge-ok", "En stock");
}

/**
 * Construit la ligne de prix d'une carte.
 * En promotion, l'ancien prix est barré et le nouveau mis en avant : c'est le
 * même prix que getEffectivePrice(), simplement présenté deux fois.
 */
function createPriceLine(product) {
  const line = el("p", "product-card-price");

  if (product.discount_price === null) {
    line.textContent = formatPrice(product.price);
    return line;
  }

  // Le prix barré est décoratif : il n'est jamais envoyé à l'API. Le panier,
  // lui, retient le prix effectif (voir addToCart dans cart-storage.js).
  line.append(
    el("span", "mr-2 text-sm font-normal text-slate-400 line-through", formatPrice(product.price)),
    el("span", "text-red-600", formatPrice(product.discount_price))
  );

  return line;
}

/**
 * Construit la carte d'un produit.
 * Utilisée par la page catalogue ET par les quatre rangées de la homepage :
 * une seule fonction pour les deux, donc un seul endroit à modifier le jour
 * où la carte change de forme.
 */
function createProductCard(product) {
  const card = el("article", "product-card");

  // "block" est une classe utilitaire : le lien se comporte comme un bloc, ce
  // qui évite un espace parasite sous la vignette.
  const mediaLink = el("a", "block");
  mediaLink.href = "product.html?id=" + product.id;
  mediaLink.append(createThumbnail(product));

  const title = el("h2", "product-card-name");
  const titleLink = el("a", null, product.name);
  titleLink.href = "product.html?id=" + product.id;
  title.append(titleLink);

  const body = el("div", "product-card-body");
  body.append(
    el("p", "product-card-category", product.category_name),
    title,
    createPriceLine(product),
    createStockBadge(product)
  );

  card.append(mediaLink, body);
  return card;
}

/**
 * Remplit la barre des départements de l'en-tête.
 *
 * La liste vient de la base et non du HTML : sinon les six pages
 * contiendraient chacune une copie de la structure du catalogue, et ajouter
 * un département obligerait à modifier six fichiers.
 */
function renderDepartmentNav(categories) {
  const nav = document.querySelector("[data-departments]");
  if (nav === null) {
    return;
  }

  const firstLink = el("a", "whitespace-nowrap text-slate-600 hover:text-brand", "Tout le catalogue");
  firstLink.href = "products.html";

  const links = [firstLink];
  for (const department of categories) {
    const link = el("a", "whitespace-nowrap text-slate-600 hover:text-brand", department.name);
    link.href = "products.html?category=" + department.id;
    links.push(link);
  }

  nav.replaceChildren(...links);
}

/**
 * Charge les catégories puis remplit la barre de l'en-tête.
 * Appelée par toutes les pages sauf la homepage, qui a de toute façon besoin
 * des catégories pour ses tuiles et son pied de page.
 */
function initHeaderNav() {
  fetchJson("api/categories.php")
    .then(renderDepartmentNav)
    .catch((error) => {
      // La navigation est un confort, pas une nécessité : si elle échoue, la
      // page reste utilisable. On journalise au lieu d'afficher une alerte.
      console.warn("Départements indisponibles :", error.message);
    });
}
