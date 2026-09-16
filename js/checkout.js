/**
 * Page de commande — checkout.html
 *
 * C'est ici que le frontend et le backend se rencontrent :
 *
 *   panier (localStorage) + compte connecté → validation → POST api/orders.php
 *   → PHP relit les prix en base → {"success": true, "data": {order_id, total}}
 *   → confirmation.html
 *
 * Depuis l'ajout des comptes, cette page attend la réponse de api/me.php
 * avant d'afficher quoi que ce soit : sans compte, il n'y a pas de commande à
 * préparer.
 *
 * Dépend de : cart-storage.js, api.js, ui.js, auth.js.
 */

const message = document.getElementById("message");
const emptyState = document.getElementById("checkout-empty");
const loginState = document.getElementById("checkout-login");
const content = document.getElementById("checkout-content");
const form = document.getElementById("checkout-form");
const customerLabel = document.getElementById("checkout-customer");
const summaryItems = document.getElementById("summary-items");
const summaryTotal = document.getElementById("summary-total");
const submitButton = document.getElementById("submit-order");

/** Affiche le récapitulatif de ce qui va être envoyé. */
function renderSummary() {
  const rows = getCart().map((line) => {
    const row = document.createElement("li");

    const label = document.createElement("span");
    label.textContent = line.quantity + " × " + line.name;

    const amount = document.createElement("span");
    amount.textContent = formatPrice(line.price * line.quantity);

    row.append(label, amount);
    return row;
  });

  summaryItems.replaceChildren(...rows);
  summaryTotal.textContent = formatPrice(getCartTotal());
}

/**
 * Vérifie l'adresse de livraison.
 * Mêmes règles que dans api/orders.php : ce contrôle répond vite et en
 * français, l'autre est celui qui protège la base de données.
 */
function validateAddress(address) {
  if (address.length < 5) {
    return "L'adresse de livraison doit contenir au moins 5 caractères.";
  }
  if (address.length > 255) {
    return "L'adresse ne peut pas dépasser 255 caractères.";
  }
  return null;
}

/** Envoie la commande à l'API. */
async function submitOrder(event) {
  // Sans preventDefault, le navigateur enverrait le formulaire lui-même et
  // quitterait la page : c'est fetch() qui doit faire l'envoi.
  event.preventDefault();
  hideMessage(message);

  // Le formulaire s'appelle "checkout-form" : attention, form.name renverrait
  // l'attribut name du <form> lui-même et non le champ. On passe donc par
  // form.elements pour récupérer les champs par leur nom.
  const address = form.elements.address.value.trim();

  const problem = validateAddress(address);
  if (problem !== null) {
    showMessage(message, problem, "error");
    return;
  }

  const payload = {
    address: address,
    // Seuls l'identifiant et la quantité sont transmis. Ni le prix, ni le
    // nom du client : les deux sont relus en base par PHP (le prix depuis
    // products, le client depuis la session).
    items: getCart().map((line) => ({
      product_id: line.id,
      quantity: line.quantity,
    })),
  };

  if (payload.items.length === 0) {
    showMessage(message, "Votre panier est vide.", "error");
    return;
  }

  // Un double clic rapide enverrait deux commandes : on verrouille le bouton
  // jusqu'à la réponse du serveur.
  submitButton.disabled = true;
  submitButton.textContent = "Envoi en cours…";

  try {
    const data = await fetchJson("api/orders.php", {
      method: "POST",
      // Sans cet en-tête, PHP ne saurait pas que le corps contient du JSON :
      // c'est ce qui fait que $_POST reste vide et qu'on lit php://input.
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    // La commande créée est transmise à la page suivante par sessionStorage :
    // cet espace survit au changement de page mais se vide à la fermeture de
    // l'onglet. Le total affiché sera celui calculé par PHP, pas le nôtre.
    sessionStorage.setItem("lastOrder", JSON.stringify(data));
    window.location.href = "confirmation.html";
  } catch (error) {
    // Cas rencontrés ici : session expirée (401), stock insuffisant (409),
    // adresse refusée (400), base indisponible (500). Dans tous les cas le
    // panier est intact, le visiteur peut corriger et réessayer.
    showMessage(message, error.message, "error");
    submitButton.disabled = false;
    submitButton.textContent = "Valider la commande";
  }
}

async function init() {
  refreshCartBadge();
  initHeaderNav();

  // On attend de savoir qui est connecté AVANT d'afficher : sinon un visiteur
  // non connecté verrait apparaître un formulaire... puis disparaître.
  const user = await initAuth();

  if (getCart().length === 0) {
    emptyState.hidden = false;
    return;
  }

  if (user === null) {
    loginState.hidden = false;
    return;
  }

  // Le nom affiché vient de la session (via api/me.php) et non d'un champ de
  // formulaire : personne ne peut commander au nom d'un autre en modifiant la
  // page, puisque ce texte n'est jamais envoyé au serveur.
  customerLabel.textContent = user.name;
  renderSummary();
  content.hidden = false;
  form.addEventListener("submit", submitOrder);
}

init();
