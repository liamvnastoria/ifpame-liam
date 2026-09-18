/**
 * Page de commande — checkout.html
 *
 * C'est ici que le frontend et le backend se rencontrent :
 *
 *   panier serveur + compte connecté → POST api/orders.php {address}
 *   → PHP relit les prix et le panier en base → {"success": true,
 *     "data": {order_id, subtotal, shipping, total}} → confirmation.html
 *
 * Le navigateur n'envoie QUE l'adresse : les articles viennent du panier du
 * compte, lus par PHP dans cart_items. Il est donc impossible d'inventer une
 * ligne ou un prix depuis la console du navigateur.
 *
 * Frais de port affichés : 4,95 € sous 75 €, gratuit à partir de 75 €. La
 * règle est la même ici (pour l'affichage) et dans api/orders.php (pour le
 * montant réel), qui reste la seule source de vérité.
 *
 * Dépend de : cart-storage.js, api.js, ui.js, auth.js.
 */

const message = document.getElementById("message");
const emptyState = document.getElementById("checkout-empty");
const loginState = document.getElementById("checkout-login");
const content = document.getElementById("checkout-content");
const form = document.getElementById("checkout-form");
const addressField = document.getElementById("address");
const customerLabel = document.getElementById("checkout-customer");
const summaryItems = document.getElementById("summary-items");
const summarySubtotal = document.getElementById("summary-subtotal");
const summaryShipping = document.getElementById("summary-shipping");
const summaryShippingValue = document.getElementById("summary-shipping-value");
const summaryVat = document.getElementById("summary-vat");
const summaryTotal = document.getElementById("summary-total");
const submitButton = document.getElementById("submit-order");

// Même règle de livraison que dans api/orders.php : affichée ici, appliquée
// là-bas. Un seul endroit à modifier pour les deux.
const FREE_SHIPPING_FROM = 75;
const SHIPPING_COST = 4.95;
const VAT_RATE = 0.21;

/** Règle des frais de port, utilisée aussi pour l'aperçu du récapitulatif. */
function shippingFor(subtotal) {
  return subtotal >= FREE_SHIPPING_FROM ? 0 : SHIPPING_COST;
}

/**
 * Montant de TVA contenu dans le total. Les prix sont affichés TVA comprise,
 * donc la TVA incluse est le total x 21/121 (et non x 21 %, qui donnerait le
 * montant hors TVA).
 */
function vatIncludedIn(total) {
  return total * (VAT_RATE / (1 + VAT_RATE));
}

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

  const subtotal = getCartTotal();
  const shipping = shippingFor(subtotal);
  const total = subtotal + shipping;

  summarySubtotal.textContent = formatPrice(subtotal);
  summaryShipping.textContent = shipping === 0 ? "Offerts" : formatPrice(shipping);
  // Le libellé garde la règle visible : « Offerts dès 75 € » aide à comprendre.
  summaryShippingValue.textContent =
    shipping === 0 ? "Livraison offerte dès " + FREE_SHIPPING_FROM + " €" : "Standard (gratuite dès " + FREE_SHIPPING_FROM + " €)";
  summaryVat.textContent = formatPrice(vatIncludedIn(total));
  summaryTotal.textContent = formatPrice(total);
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

  if (getCart().length === 0) {
    showMessage(message, "Votre panier est vide.", "error");
    return;
  }

  // Un double clic rapide enverrait deux commandes : on verrouille le bouton
  // jusqu'à la réponse du serveur.
  submitButton.disabled = true;
  submitButton.textContent = "Envoi en cours…";

  try {
    // SEULE l'adresse part dans le corps de la requête. Les articles sont lus
    // par PHP dans le panier du compte, et les prix dans la base.
    const data = await fetchJson("api/orders.php", {
      method: "POST",
      // Sans cet en-tête, PHP ne saurait pas que le corps contient du JSON :
      // c'est ce qui fait que $_POST reste vide et qu'on lit php://input.
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: address }),
    });

    // La commande créée est transmise à la page suivante par sessionStorage :
    // cet espace survit au changement de page mais se vide à la fermeture de
    // l'onglet. Le total affiché sera celui calculé par PHP, pas le nôtre.
    sessionStorage.setItem("lastOrder", JSON.stringify(data));
    // Le serveur a vidé le panier dans la transaction : on oublie notre copie
    // locale, sinon le badge garderait un vieux compte.
    resetCartCache();
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

  // L'adresse enregistrée dans le profil pré-remplit le champ : un confort,
  // jamais une obligation (l'adresse reste modifiable avant validation).
  if (user.address) {
    addressField.value = user.address;
  }

  renderSummary();
  content.hidden = false;
  form.addEventListener("submit", submitOrder);
}

init();