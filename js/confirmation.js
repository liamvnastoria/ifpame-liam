/**
 * Page de confirmation — confirmation.html
 *
 * Cette page ne reçoit rien par l'URL : elle lit la commande que
 * js/checkout.js a placée dans sessionStorage juste avant la redirection.
 * Le panier, lui, a déjà été vidé par le serveur pendant la transaction :
 * il ne reste qu'à oublier notre copie locale.
 *
 * Dépend de : cart-storage.js, ui.js.
 */

const content = document.getElementById("confirmation-content");
const emptyState = document.getElementById("confirmation-empty");
const orderRef = document.getElementById("order-ref");
const orderTotal = document.getElementById("order-total");
const orderSubtotal = document.getElementById("order-subtotal");
const orderShipping = document.getElementById("order-shipping");
const orderVat = document.getElementById("order-vat");

const raw = sessionStorage.getItem("lastOrder");

if (raw === null) {
  // Aucune commande dans cet onglet : visite directe, ou onglet fermé puis
  // rouvert (sessionStorage ne survit pas à la fermeture de l'onglet).
  emptyState.hidden = false;
} else {
  let order = null;
  try {
    order = JSON.parse(raw);
  } catch (error) {
    // Valeur corrompue : on préfère ne rien afficher plutôt qu'un texte vide.
    console.warn("Commande illisible dans sessionStorage.", error);
  }

  if (order === null) {
    emptyState.hidden = false;
  } else {
    orderRef.textContent = "#" + order.order_id;
    // order.total vient de la réponse de PHP : c'est le montant que le serveur
    // a calculé et enregistré, pas une estimation du navigateur.
    orderTotal.textContent = formatPrice(order.total);
    orderSubtotal.textContent = formatPrice(order.subtotal);
    orderShipping.textContent = order.shipping === 0 ? "Offerts" : formatPrice(order.shipping);
    // TVA incluse : total x 21/121, la même règle que sur la page de commande.
    orderVat.textContent = formatPrice(order.total * (0.21 / 1.21));
    content.hidden = false;
  }

  // Le panier a été vidé PAR LE SERVEUR dans la transaction de la commande.
  // On ne réappelle pas l'API ici : on oublie seulement la copie locale, sinon
  // le badge de l'en-tête garderait un compte périmé.
  resetCartCache();
}

refreshCartBadge();
initHeaderNav();
initAuth();