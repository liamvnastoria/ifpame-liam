/**
 * Fiche produit — product.html?id=1
 *
 * Flux : on lit l'id dans l'URL → GET api/product.php?id=… → on remplit la
 * page → le bouton « Ajouter au panier » appelle POST api/cart.php.
 *
 * Depuis que le panier est réservé aux comptes, il faut être connecté pour
 * ajouter un produit : un visiteur sans compte est envoyé vers le formulaire
 * de connexion, qui le ramène ici grâce au paramètre next=.
 *
 * Dépend de : cart-storage.js, api.js, ui.js, auth.js.
 */

const message = document.getElementById("message");
const loading = document.getElementById("loading");
const detail = document.getElementById("product-detail");
const imageBox = document.getElementById("product-image");
const categoryEl = document.getElementById("product-category");
const nameEl = document.getElementById("product-name");
const priceEl = document.getElementById("product-price");
const stockEl = document.getElementById("product-stock");
const descriptionEl = document.getElementById("product-description");
const quantityInput = document.getElementById("quantity");
const addButton = document.getElementById("add-to-cart");

// Le produit renvoyé par l'API est mémorisé ici : le clic sur « Ajouter au
// panier » n'a pas besoin de refaire un appel réseau pour l'obtenir.
let currentProduct = null;
// L'utilisateur connecté (null si visiteur), rempli par initAuth().
let currentUser = null;

/** Valide l'id reçu dans l'URL avant d'appeler l'API. */
function readProductId() {
  const id = new URLSearchParams(window.location.search).get("id");

  // Un id doit être composé uniquement de chiffres. Vérifier ici évite un
  // aller-retour inutile vers le serveur pour une URL manifestement invalide.
  if (id === null || !/^\d+$/.test(id)) {
    return null;
  }

  return id;
}

/**
 * Affiche le prix, et le prix barré si le produit est en promotion.
 * Le montant lu par le panier est celui de getEffectivePrice() : les deux
 * affichages parlent donc forcément du même prix.
 */
function renderPrice(product) {
  priceEl.replaceChildren();

  if (product.discount_price === null) {
    priceEl.textContent = formatPrice(product.price);
    return;
  }

  priceEl.append(
    el("span", "mr-3 text-base font-normal text-slate-400 line-through", formatPrice(product.price)),
    el("span", "text-red-600", formatPrice(product.discount_price))
  );
}

/** Affiche le produit reçu de l'API dans la page. */
function renderProduct(product) {
  categoryEl.textContent = product.category_name;
  nameEl.textContent = product.name;
  renderPrice(product);
  // Les sauts de ligne du texte SQL sont conservés grâce à la classe
  // Tailwind "whitespace-pre-line" posée sur l'élément dans product.html.
  descriptionEl.textContent = product.description || "Pas de description pour ce produit.";

  imageBox.replaceChildren(createThumbnail(product));
  stockEl.replaceChildren(createStockBadge(product));

  if (product.stock === 0) {
    // En rupture, le champ et le bouton sont désactivés : la règle du stock
    // est visible dans l'interface ET vérifiée côté serveur.
    quantityInput.disabled = true;
    addButton.disabled = true;
    addButton.textContent = "Produit indisponible";
  } else {
    // max limite la saisie au stock connu ; PHP revérifiera de toute façon.
    quantityInput.max = String(product.stock);
  }

  loading.hidden = true;
  detail.hidden = false;
}

/** Ajoute le produit et la quantité choisis au panier serveur. */
async function handleAddToCart() {
  if (currentProduct === null) {
    return;
  }

  // Le panier est réservé aux comptes : sans connexion, on renvoie vers le
  // formulaire avec un next= qui ramène ici juste après la connexion.
  if (currentUser === null) {
    window.location.href =
      "login.html?next=" + encodeURIComponent("product.html?id=" + currentProduct.id);
    return;
  }

  addButton.disabled = true;
  addButton.textContent = "Ajout en cours…";

  try {
    // Le serveur vérifie le stock et renvoie le nombre total d'articles : le
    // visiteur comprend pourquoi le nombre a augmenté s'il a cliqué deux fois.
    const count = await addToCart(currentProduct.id, quantityInput.value);
    showMessage(
      message,
      currentProduct.name + " a été ajouté au panier (" + count + " article(s) au total).",
      "success"
    );
    refreshCartBadge();
  } catch (error) {
    // Cas fréquents : stock insuffisant (409), session expirée (401).
    showMessage(message, error.message, "error");
  }

  addButton.disabled = false;
  addButton.textContent = "Ajouter au panier";
}

/** Charge le produit demandé au démarrage de la page. */
async function init() {
  refreshCartBadge();
  // La barre des départements et la zone de compte sont communes à toutes
  // les pages : elles se chargent ici, en parallèle de la fiche produit.
  initHeaderNav();
  currentUser = await initAuth();

  const id = readProductId();
  if (id === null) {
    loading.hidden = true;
    showMessage(message, "Aucun produit valide n'est demandé dans l'adresse de la page.", "error");
    return;
  }

  try {
    const product = await fetchJson("api/product.php?id=" + encodeURIComponent(id));
    currentProduct = product;
    renderProduct(product);
    addButton.addEventListener("click", handleAddToCart);
  } catch (error) {
    loading.hidden = true;
    // Le message vient du serveur : 404 « Product not found » si l'id
    // n'existe pas, ou un message générique si la base est injoignable.
    showMessage(message, error.message, "error");
  }
}

init();