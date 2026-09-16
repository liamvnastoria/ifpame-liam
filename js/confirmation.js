/**
 * Page de confirmation — confirmation.html
 *
 * Cette page ne reçoit rien par l'URL : elle lit la commande que
 * js/checkout.js a placée dans sessionStorage juste avant la redirection.
 * C'est aussi ici, et pas dans le checkout, que le panier est vidé.
 *
 * Dépend de : cart-storage.js, ui.js.
 */

const content = document.getElementById("confirmation-content");
const emptyState = document.getElementById("confirmation-empty");
const orderRef = document.getElementById("order-ref");
const orderTotal = document.getElementById("order-total");

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
    content.hidden = false;
  }

  // Le panier est vidé ICI et non dans checkout.js : si l'envoi de la commande
  // avait échoué, le visiteur devait retrouver ses articles pour réessayer.
  // On n'atteint cette page qu'après un succès confirmé par le serveur.
  clearCart();
}

refreshCartBadge();
initHeaderNav();
initAuth();
