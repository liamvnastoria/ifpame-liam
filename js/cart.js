/**
 * Page panier — cart.html
 *
 * Flux : compte connecté → GET api/cart.php (via initAuth) → tableau HTML →
 * modification des quantités → POST/DELETE api/cart.php → tableau rafraîchi.
 *
 * Particularité : le panier est réservé aux comptes. Un visiteur non connecté
 * voit un message « Connectez-vous », pas un tableau vide. Chaque modification
 * passe par le serveur, qui vérifie le stock et revoit les prix : le montant
 * affiché est donc déjà le montant réel, contrairement à l'ancien localStorage.
 *
 * Dépend de : cart-storage.js, api.js, ui.js, auth.js.
 */

const message = document.getElementById("message");
const loginState = document.getElementById("cart-login");
const tableWrapper = document.getElementById("cart-table-wrapper");
const tbody = document.getElementById("cart-items");
const emptyState = document.getElementById("cart-empty");
const summary = document.getElementById("cart-summary");
const totalEl = document.getElementById("cart-total");
const clearButton = document.getElementById("clear-cart");

/** Redessine entièrement la page à partir du panier connu (getCart()). */
function render() {
  const cart = getCart();
  const isEmpty = cart.length === 0;

  // Les trois blocs s'excluent : soit le panier est vide et on affiche le
  // message, soit il contient des articles et on affiche tableau + total.
  emptyState.hidden = !isEmpty;
  tableWrapper.hidden = isEmpty;
  summary.hidden = isEmpty;
  clearButton.hidden = isEmpty;

  if (isEmpty) {
    return;
  }

  // On reconstruit toutes les lignes à chaque modification : c'est moins
  // fin que de mettre à jour une seule cellule, mais beaucoup plus simple à
  // suivre, et le panier ne contient que quelques lignes.
  tbody.replaceChildren(...cart.map(createLine));
  totalEl.textContent = formatPrice(getCartTotal());
}

/** Construit une ligne du tableau pour un article du panier. */
function createLine(line) {
  const row = document.createElement("tr");

  // --- Produit : vignette + nom cliquable ---
  const productCell = document.createElement("td");
  const productBox = document.createElement("div");
  productBox.className = "cell-product";

  const nameLink = document.createElement("a");
  nameLink.href = "product.html?id=" + line.id;
  nameLink.textContent = line.name;

  productBox.append(createThumbnail(line), nameLink);
  productCell.append(productBox);

  // --- Prix unitaire (prix effectif renvoyé par le serveur) ---
  const priceCell = document.createElement("td");
  priceCell.className = "num";
  priceCell.textContent = formatPrice(line.price);

  // --- Quantité ---
  const quantityCell = document.createElement("td");
  const quantityInput = document.createElement("input");
  quantityInput.type = "number";
  // Deux classes : "input" (l'apparence du champ, definie dans input.css) et
  // "w-20" (la largeur, une classe utilitaire Tailwind).
  quantityInput.className = "input w-20";
  quantityInput.min = "1";
  // La limite haute vient du stock lu au moment du chargement. Elle guide la
  // saisie, elle ne la garantit pas : le serveur revérifie à chaque "set".
  quantityInput.max = String(line.stock);
  quantityInput.value = String(line.quantity);
  quantityInput.setAttribute("aria-label", "Quantité pour " + line.name);
  // "change" se déclenche quand le champ perd le focus ou après Entrée : on ne
  // redessine donc pas le tableau pendant que le visiteur tape.
  quantityInput.addEventListener("change", async () => {
    try {
      // "set" fixe la quantité au serveur, qui refuse un stock dépassé (409).
      await updateQuantity(line.id, quantityInput.value);
      hideMessage(message);
    } catch (error) {
      // Stock insuffisant, ou quantité refusée : le message vient de l'API.
      showMessage(message, error.message, "error");
    }
    refreshCartBadge();
    render();
  });
  quantityCell.append(quantityInput);

  // --- Sous-total : recalculé ici à partir du prix renvoyé par le serveur ---
  const subtotalCell = document.createElement("td");
  subtotalCell.className = "num";
  subtotalCell.textContent = formatPrice(line.price * line.quantity);

  // --- Suppression ---
  const actionCell = document.createElement("td");
  const removeButton = document.createElement("button");
  removeButton.type = "button";
  removeButton.className = "btn btn-link";
  removeButton.textContent = "Supprimer";
  removeButton.addEventListener("click", async () => {
    try {
      await removeFromCart(line.id);
      hideMessage(message);
    } catch (error) {
      showMessage(message, error.message, "error");
    }
    refreshCartBadge();
    render();
  });
  actionCell.append(removeButton);

  row.append(productCell, priceCell, quantityCell, subtotalCell, actionCell);
  return row;
}

clearButton.addEventListener("click", async () => {
  // Le confirm() du navigateur suffit ici : pas de fenêtre modale à écrire.
  if (!window.confirm("Vider entièrement le panier ?")) {
    return;
  }

  try {
    await clearCart();
    hideMessage(message);
  } catch (error) {
    showMessage(message, error.message, "error");
  }
  refreshCartBadge();
  render();
});

/** Démarrage de la page. */
async function init() {
  refreshCartBadge();
  initHeaderNav();

  // initAuth charge aussi le panier serveur quand un compte est connecté : on
  // attend sa réponse avant de rendre la page, sinon le tableau apparaîtrait
  // puis disparaîtrait.
  const user = await initAuth();

  if (user === null) {
    // Le panier est réservé aux comptes : un visiteur est invité à se
    // connecter au lieu de voir un tableau vide sans explication.
    loginState.hidden = false;
    return;
  }

  render();
}

init();