/**
 * Page de commande — checkout.html
 *
 * C'est ici que le frontend et le backend se rencontrent :
 *
 *   panier (localStorage) → validation → POST api/orders.php
 *   → PHP recalcule les prix → {"success": true, "data": {order_id, total}}
 *   → confirmation.html
 *
 * Dépend de : cart-storage.js, api.js, ui.js.
 */

const message = document.getElementById("message");
const emptyState = document.getElementById("checkout-empty");
const content = document.getElementById("checkout-content");
const form = document.getElementById("checkout-form");
const summaryItems = document.getElementById("summary-items");
const summaryTotal = document.getElementById("summary-total");
const submitButton = document.getElementById("submit-order");

/** Affiche le récapitulatif de ce qui va être envoyé. */
function renderSummary() {
  const items = getCart().map((line) => {
    const row = document.createElement("li");

    const label = document.createElement("span");
    label.textContent = line.quantity + " × " + line.name;

    const amount = document.createElement("span");
    amount.textContent = formatPrice(line.price * line.quantity);

    row.append(label, amount);
    return row;
  });

  summaryItems.replaceChildren(...items);
  summaryTotal.textContent = formatPrice(getCartTotal());
}

/**
 * Vérifie les coordonnées saisies.
 *
 * Cette validation existe pour répondre VITE au visiteur, dans sa langue et au
 * bon endroit. Elle ne protège rien : n'importe qui peut la contourner avec les
 * outils du navigateur ou en appelant l'API directement. PHP revalide donc
 * exactement les mêmes règles.
 *
 * @returns {string|null} Le premier problème trouvé, ou null si tout est bon.
 */
function validateCustomer(customer) {
  // Les limites de longueur reprennent celles du schéma SQL (VARCHAR).
  // Une valeur plus longue serait tronquée ou refusée par MySQL.
  if (customer.name.length < 2) {
    return "Le nom doit contenir au moins 2 caractères.";
  }
  if (customer.name.length > 100) {
    return "Le nom ne peut pas dépasser 100 caractères.";
  }

  // Contrôle volontairement simple : quelque chose, un @, quelque chose,
  // un point, quelque chose. Une adresse e-mail réellement valide ne peut de
  // toute façon être confirmée qu'en y envoyant un message.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email)) {
    return "L'adresse e-mail n'est pas valide.";
  }
  if (customer.email.length > 150) {
    return "L'adresse e-mail ne peut pas dépasser 150 caractères.";
  }

  if (customer.address.length < 5) {
    return "L'adresse de livraison doit contenir au moins 5 caractères.";
  }
  if (customer.address.length > 255) {
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
  const customer = {
    name: form.elements.name.value.trim(),
    email: form.elements.email.value.trim(),
    address: form.elements.address.value.trim(),
  };

  const problem = validateCustomer(customer);
  if (problem !== null) {
    showMessage(message, problem, "error");
    return;
  }

  const payload = {
    customer: customer,
    // Seuls l'identifiant et la quantité sont transmis. Les prix stockés dans
    // localStorage sont volontairement absents : le navigateur propose, le
    // serveur décide. PHP relira les prix et le stock en base.
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
      // Sans cet en-tête, PHP ne sait pas que le corps contient du JSON.
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    // La commande créée est transmise à la page suivante par sessionStorage :
    // cet espace survit au changement de page mais se vide à la fermeture de
    // l'onglet. Le total affiché sera celui calculé par PHP, pas le nôtre.
    sessionStorage.setItem("lastOrder", JSON.stringify(data));
    window.location.href = "confirmation.html";
  } catch (error) {
    // Cas typiques : stock insuffisant (409), coordonnées refusées (400), ou
    // base de données indisponible (500). Dans tous les cas le panier est
    // intact, le visiteur peut corriger et réessayer.
    showMessage(message, error.message, "error");
    submitButton.disabled = false;
    submitButton.textContent = "Valider la commande";
  }
}

// Démarrage : un panier vide est possible si l'adresse de la page est saisie
// à la main. On masque alors le formulaire au lieu de laisser commander du vide.
refreshCartBadge();

if (getCart().length === 0) {
  emptyState.hidden = false;
} else {
  renderSummary();
  content.hidden = false;
  form.addEventListener("submit", submitOrder);
}
