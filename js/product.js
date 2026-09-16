/**
 * Fiche produit — product.html?id=1
 *
 * Flux : on lit l'id dans l'URL → GET api/product.php?id=… → on remplit la
 * page → le bouton « Ajouter au panier » écrit dans localStorage.
 *
 * Dépend de : cart-storage.js, api.js, ui.js.
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

/** Affiche le produit reçu de l'API dans la page. */
function renderProduct(product) {
  categoryEl.textContent = product.category_name;
  nameEl.textContent = product.name;
  priceEl.textContent = formatPrice(product.price);
  // Les sauts de ligne du texte SQL sont conservés à l'affichage.
  descriptionEl.textContent = product.description || "Pas de description pour ce produit.";
  descriptionEl.style.whiteSpace = "pre-line";

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

/** Ajoute le produit et la quantité choisis au panier. */
function handleAddToCart() {
  if (currentProduct === null) {
    return;
  }

  const added = addToCart(currentProduct, quantityInput.value);

  if (added === 0) {
    showMessage(message, "Ce produit n'est plus disponible.", "error");
    return;
  }

  // addToCart renvoie la quantité désormais présente dans le panier : le
  // visiteur comprend pourquoi le nombre a augmenté s'il a cliqué deux fois.
  showMessage(
    message,
    currentProduct.name + " a été ajouté au panier (" + added + " au total).",
    "success"
  );
  refreshCartBadge();
}

/** Charge le produit demandé au démarrage de la page. */
async function init() {
  refreshCartBadge();

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
