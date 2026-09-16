/**
 * Page catalogue — products.html
 *
 * Flux : la page se charge → on lit les filtres de l'URL → on appelle
 * api/products.php → on construit une carte par produit dans la grille.
 * Aucune donnée n'est écrite ici : cette page ne fait que lire l'API.
 *
 * Dépend de : cart-storage.js, api.js, ui.js (chargés avant ce fichier).
 */

const grid = document.getElementById("product-grid");
const message = document.getElementById("message");
const loading = document.getElementById("loading");
const emptyState = document.getElementById("empty");
const searchForm = document.getElementById("search-form");
const searchInput = document.getElementById("search");
const categorySelect = document.getElementById("category");

// Les filtres sont lus dans l'URL : ainsi un rechargement de page, ou un lien
// envoyé à quelqu'un, retrouve exactement la même liste de produits.
const urlParams = new URLSearchParams(window.location.search);
const filters = {
  category: urlParams.get("category") || "",
  search: urlParams.get("search") || "",
};

searchInput.value = filters.search;

/**
 * Construit la chaîne de requête à partir des filtres actifs.
 * Exemple : "category=2&search=lampe", ou "" si aucun filtre.
 */
function currentQuery() {
  const params = new URLSearchParams();
  if (filters.category !== "") {
    params.set("category", filters.category);
  }
  if (filters.search !== "") {
    params.set("search", filters.search);
  }
  return params.toString();
}

/**
 * Recharge la liste avec les filtres actuels.
 * async/await permet d'écrire le code comme s'il était synchrone : "await"
 * attend la réponse du serveur avant de passer à la ligne suivante.
 */
async function loadProducts() {
  loading.hidden = false;
  emptyState.hidden = true;
  // On vide la grille avant de la remplir : sinon les anciens résultats
  // resteraient affichés sous les nouveaux.
  grid.replaceChildren();

  const query = currentQuery();

  try {
    const products = await fetchJson("api/products.php" + (query === "" ? "" : "?" + query));
    loading.hidden = true;
    // Le message d'erreur précédent n'est effacé qu'une fois la réussite
    // confirmée : un échec de chargement des catégories reste visible.
    hideMessage(message);

    if (products.length === 0) {
      emptyState.hidden = false;
      return;
    }

    // createProductCard est appelée pour chaque produit, puis les cartes sont
    // insérées d'un coup dans la grille.
    grid.replaceChildren(...products.map(createProductCard));
  } catch (error) {
    loading.hidden = true;
    // error.message vient de fetchJson : soit le message "error" renvoyé par
    // PHP, soit un message de notre côté (réponse illisible, serveur arrêté).
    showMessage(message, error.message, "error");
  }
}

/** Charge les catégories et remplit le menu déroulant. */
async function loadCategories() {
  try {
    const categories = await fetchJson("api/categories.php");

    for (const category of categories) {
      const option = document.createElement("option");
      option.value = String(category.id);
      // Le nombre de produits est affiché dans l'option : l'information est
      // calculée par SQL (COUNT + GROUP BY), pas par JavaScript.
      option.textContent = category.name + " (" + category.product_count + ")";
      categorySelect.append(option);
    }
  } catch (error) {
    showMessage(message, "Impossible de charger les catégories : " + error.message, "error");
    return;
  }

  // Si l'URL contient une catégorie qui n'existe pas, l'option n'a jamais été
  // créée et le select garde sa valeur par défaut. On retire alors le filtre,
  // sinon le catalogue apparaîtrait vide sans raison visible.
  if (filters.category !== "" && categorySelect.value !== filters.category) {
    filters.category = "";
  }
  categorySelect.value = filters.category;
}

/** Construit la carte d'un produit dans la grille. */
function createProductCard(product) {
  const card = document.createElement("article");
  card.className = "product-card";

  const mediaLink = document.createElement("a");
  mediaLink.className = "product-card__media";
  mediaLink.href = "product.html?id=" + product.id;
  mediaLink.append(createThumbnail(product));

  const body = document.createElement("div");
  body.className = "product-card__body";

  const category = document.createElement("p");
  category.className = "product-card__category";
  category.textContent = product.category_name;

  const title = document.createElement("h2");
  title.className = "product-card__name";
  const titleLink = document.createElement("a");
  titleLink.href = "product.html?id=" + product.id;
  titleLink.textContent = product.name;
  title.append(titleLink);

  const price = document.createElement("p");
  price.className = "product-card__price";
  price.textContent = formatPrice(product.price);

  body.append(category, title, price, createStockBadge(product));
  card.append(mediaLink, body);

  return card;
}

/** Synchronise le contenu de la page avec les filtres actifs. */
function applyFilters() {
  // replaceState réécrit l'URL sans ajouter une entrée dans l'historique :
  // le bouton « Retour » du navigateur ne se remplit pas à chaque recherche.
  const query = currentQuery();
  history.replaceState(null, "", query === "" ? "products.html" : "products.html?" + query);

  loadProducts();
}

// La touche Entrée ou le bouton « Rechercher » déclenchent submit. Sans
// preventDefault, le navigateur rechargerait la page et perdrait l'état.
searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  filters.search = searchInput.value.trim();
  filters.category = categorySelect.value;
  applyFilters();
});

// Le changement de catégorie est immédiat : pas besoin de valider un formulaire.
categorySelect.addEventListener("change", () => {
  filters.category = categorySelect.value;
  applyFilters();
});

// Démarrage de la page : le badge du panier d'abord, puis les catégories, puis
// les produits. loadCategories est attendu pour que le select soit rempli avant
// que le filtre de l'URL y soit appliqué. Les deux appels sont volontairement
// enchaînés et non lancés en parallèle pour garder un ordre facile à suivre.
refreshCartBadge();
loadCategories().then(loadProducts);
