/**
 * Page catalogue — products.html
 *
 * Flux : la page se charge → on lit les filtres de l'URL → on appelle
 * api/products.php → la grille est remplie de cartes produit.
 *
 * Les quatre filtres (catégorie, recherche, tri, promotions) sont TOUS dans
 * l'URL. C'est ce qui permet aux liens « Tout voir → » de la homepage
 * d'arriver avec le bon filtre déjà appliqué, et à un lien envoyé à quelqu'un
 * d'afficher la même liste.
 *
 * Dépend de : cart-storage.js, api.js, ui.js (chargés avant ce fichier).
 */

const grid = document.getElementById("product-grid");
const message = document.getElementById("message");
const loading = document.getElementById("loading");
const emptyState = document.getElementById("empty");
const searchInput = document.getElementById("header-search");
const categorySelect = document.getElementById("category");
const sortSelect = document.getElementById("sort");
const promoCheckbox = document.getElementById("promo");

const urlParams = new URLSearchParams(window.location.search);
const filters = {
  category: urlParams.get("category") || "",
  search: urlParams.get("search") || "",
  sort: urlParams.get("sort") || "",
  promo: urlParams.get("promo") || "",
};

// Le champ de recherche est celui de l'en-tête, commun aux six pages : on y
// réaffiche la recherche en cours, sinon le visiteur ne comprendrait pas
// pourquoi la liste est incomplète.
searchInput.value = filters.search;
// "name" est le tri par défaut de l'API : le select doit le montrer même si
// l'URL ne contient rien.
sortSelect.value = filters.sort === "" ? "name" : filters.sort;
promoCheckbox.checked = filters.promo === "1";

/**
 * Construit la chaîne de requête à partir des filtres actifs.
 * Exemple : "category=2&search=clavier&sort=price", ou "" si aucun filtre.
 */
function currentQuery() {
  const params = new URLSearchParams();

  if (filters.category !== "") {
    params.set("category", filters.category);
  }
  if (filters.search !== "") {
    params.set("search", filters.search);
  }
  // Inutile d'écrire le tri par défaut dans l'URL : une adresse plus courte
  // reste lisible, et l'API applique "name" si le paramètre est absent.
  if (filters.sort !== "" && filters.sort !== "name") {
    params.set("sort", filters.sort);
  }
  if (filters.promo === "1") {
    params.set("promo", "1");
  }

  return params.toString();
}

/** Recharge la liste avec les filtres actuels. */
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

    // createProductCard est fournie par ui.js : le catalogue et les rangées de
    // la homepage affichent donc exactement la même carte.
    grid.replaceChildren(...products.map(createProductCard));
  } catch (error) {
    loading.hidden = true;
    showMessage(message, error.message, "error");
  }
}

/** Charge les catégories et remplit le menu déroulant, groupé par département. */
async function loadCategories() {
  try {
    const categories = await fetchJson("api/categories.php");

    // <optgroup> est l'élément HTML prévu pour les menus à deux niveaux : le
    // navigateur met lui-même les sous-catégories en retrait, sans une ligne
    // de CSS. C'est exactement la structure renvoyée par l'API.
    for (const department of categories) {
      const group = document.createElement("optgroup");
      group.label = department.name;

      // Le département reste sélectionnable : il permet de voir tout ce qu'il
      // contient, sous-catégories comprises (l'API gère ce cas avec un OR).
      const departmentOption = document.createElement("option");
      departmentOption.value = String(department.id);
      departmentOption.textContent = "Tout : " + department.name + " (" + department.product_count + ")";
      group.append(departmentOption);

      for (const child of department.children) {
        const option = document.createElement("option");
        option.value = String(child.id);
        option.textContent = child.name + " (" + child.product_count + ")";
        group.append(option);
      }

      categorySelect.append(group);
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

/** Synchronise le contenu de la page et l'URL avec les filtres actifs. */
function applyFilters() {
  // replaceState réécrit l'URL sans ajouter une entrée dans l'historique :
  // le bouton « Retour » ne se remplit pas à chaque changement de filtre.
  const query = currentQuery();
  history.replaceState(null, "", query === "" ? "products.html" : "products.html?" + query);

  loadProducts();
}

// Chaque filtre est immédiat : pas de bouton « Appliquer » à chercher.
// La recherche, elle, se valide avec la touche Entrée puisqu'elle est
// soumise par le formulaire de l'en-tête (voir le HTML).
categorySelect.addEventListener("change", () => {
  filters.category = categorySelect.value;
  applyFilters();
});

sortSelect.addEventListener("change", () => {
  filters.sort = sortSelect.value;
  applyFilters();
});

promoCheckbox.addEventListener("change", () => {
  filters.promo = promoCheckbox.checked ? "1" : "";
  applyFilters();
});

// Démarrage de la page : badge du panier, barre des départements, puis
// catégories et produits. loadCategories est attendu avant loadProducts pour
// que le select soit rempli avant qu'on y applique le filtre de l'URL.
refreshCartBadge();
initHeaderNav();
initAuth();
loadCategories().then(loadProducts);
