/**
 * Page panier — cart.html
 *
 * Flux : localStorage → tableau HTML → modification des quantités → localStorage.
 *
 * Particularité : cette page ne fait AUCUN appel à l'API. Tant que le visiteur
 * ne valide pas sa commande, tout se passe dans son navigateur. C'est le prix
 * à payer pour ne pas avoir de panier côté serveur (pas de compte, pas de
 * session). Conséquence assumée : un panier n'est visible que dans le
 * navigateur où il a été rempli.
 *
 * Dépend de : cart-storage.js, ui.js.
 */

const tableWrapper = document.getElementById("cart-table-wrapper");
const tbody = document.getElementById("cart-items");
const emptyState = document.getElementById("cart-empty");
const summary = document.getElementById("cart-summary");
const totalEl = document.getElementById("cart-total");
const clearButton = document.getElementById("clear-cart");

/** Redessine entièrement la page à partir du panier enregistré. */
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

  // --- Prix unitaire ---
  const priceCell = document.createElement("td");
  priceCell.className = "num";
  priceCell.textContent = formatPrice(line.price);

  // --- Quantité ---
  const quantityCell = document.createElement("td");
  const quantityInput = document.createElement("input");
  quantityInput.type = "number";
  quantityInput.className = "qty-input";
  quantityInput.min = "1";
  // La limite haute vient du stock mémorisé lors de l'ajout au panier. Elle
  // guide la saisie, elle ne la garantit pas : le stock peut avoir changé.
  quantityInput.max = String(line.stock);
  quantityInput.value = String(line.quantity);
  quantityInput.setAttribute("aria-label", "Quantité pour " + line.name);
  // "change" se déclenche quand le champ perd le focus ou après Entrée : on ne
  // redessine donc pas le tableau pendant que le visiteur tape.
  quantityInput.addEventListener("change", () => {
    updateQuantity(line.id, quantityInput.value);
    refreshCartBadge();
    render();
  });
  quantityCell.append(quantityInput);

  // --- Sous-total : recalculé ici à partir du prix mémorisé ---
  const subtotalCell = document.createElement("td");
  subtotalCell.className = "num";
  subtotalCell.textContent = formatPrice(line.price * line.quantity);

  // --- Suppression ---
  const actionCell = document.createElement("td");
  const removeButton = document.createElement("button");
  removeButton.type = "button";
  removeButton.className = "btn btn--link";
  removeButton.textContent = "Supprimer";
  removeButton.addEventListener("click", () => {
    removeFromCart(line.id);
    refreshCartBadge();
    render();
  });
  actionCell.append(removeButton);

  row.append(productCell, priceCell, quantityCell, subtotalCell, actionCell);
  return row;
}

clearButton.addEventListener("click", () => {
  // Le confirm() du navigateur suffit ici : pas de fenêtre modale à écrire.
  if (window.confirm("Vider entièrement le panier ?")) {
    clearCart();
    refreshCartBadge();
    render();
  }
});

// Démarrage : le badge de l'en-tête puis le contenu du panier.
refreshCartBadge();
render();
