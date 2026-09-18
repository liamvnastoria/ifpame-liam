/**
 * Fiche produit — partie sociale : wishlist et avis clients.
 *
 * Deux blocs indépendants qui partagent le produit affiché par product.js :
 *   - la wishlist (« plus tard »), réservée aux comptes connectés ;
 *   - les avis clients, lisibles par tous mais déposés uniquement par les
 *     comptes connectés (un avis par compte et par produit).
 *
 * Dépend de : api.js, ui.js, auth.js (chargés avant ce fichier).
 */

const message = document.getElementById("message");

/** Lit l'id du produit depuis l'URL. */
function readProductId() {
  const id = new URLSearchParams(window.location.search).get("id");
  return id !== null && /^\d+$/.test(id) ? id : null;
}

// ----------------------------------------------------------------------
// Wishlist
// ----------------------------------------------------------------------

function renderWishlistButton(button, inList) {
  button.textContent = inList ? "Retirer de ma liste d'envies" : "Ajouter à ma liste d'envies";
  // Deux classes Tailwind utilitaires pour marquer visuellement l'état.
  button.classList.toggle("bg-brand", inList);
  button.classList.toggle("text-white", inList);
  button.classList.toggle("btn-ghost", !inList);
}

/** Met en place le bouton wishlist pour le produit courant. */
async function initWishlist(productId, user) {
  const button = document.getElementById("wishlist-toggle");
  if (button === null) {
    return;
  }

  // La wishlist est liée au compte : sans connexion, le bouton n'apparaît pas.
  if (user === null) {
    button.hidden = true;
    return;
  }

  button.hidden = false;

  let inList = false;
  try {
    const items = await fetchJson("api/wishlist.php");
    inList = items.some((item) => item.id === productId);
  } catch (error) {
    // Wishlist indisponible : on garde un bouton neutre plutôt que de bloquer
    // la fiche produit.
    console.warn("Wishlist indisponible :", error.message);
  }

  renderWishlistButton(button, inList);

  button.addEventListener("click", async () => {
    button.disabled = true;

    try {
      if (inList) {
        await fetchJson("api/wishlist.php", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ product_id: productId }),
        });
        inList = false;
        showMessage(message, "Retiré de votre liste d'envies.", "info");
      } else {
        await fetchJson("api/wishlist.php", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ product_id: productId }),
        });
        inList = true;
        showMessage(message, "Ajouté à votre liste d'envies.", "success");
      }

      renderWishlistButton(button, inList);
    } catch (error) {
      showMessage(message, error.message, "error");
    }

    button.disabled = false;
  });
}

// ----------------------------------------------------------------------
// Avis clients
// ----------------------------------------------------------------------

/** Construit le bloc d'un avis. */
function createReviewBlock(review) {
  const block = el("li", "rounded-xl border border-slate-200 bg-white p-4");

  const header = el("div", "flex flex-wrap items-baseline justify-between gap-2");
  header.append(
    el("span", "font-semibold text-slate-900", review.author_name),
    el("span", "text-sm text-slate-500", "★ ".repeat(review.rating).trim()),
    el("span", "text-sm text-slate-400", formatOrderDate(review.created_at))
  );

  block.append(header);
  if (review.comment !== null && review.comment !== "") {
    block.append(el("p", "mt-2 text-sm text-slate-600", review.comment));
  }
  return block;
}

/** Remplit le résumé (note moyenne) et la liste des avis. */
function renderReviews(data) {
  const summary = document.getElementById("reviews-summary");
  const list = document.getElementById("reviews-list");
  const empty = document.getElementById("reviews-empty");

  if (data.count === 0) {
    summary.textContent = "Aucun avis pour le moment.";
    empty.hidden = false;
    return;
  }

  summary.textContent = "★ ".repeat(Math.round(data.average)).trim() +
    " " + data.average.toLocaleString("fr-BE") + " / 5 · " + data.count + " avis";
  list.replaceChildren(...data.reviews.map(createReviewBlock));
}

/** Met en place la section des avis pour le produit courant. */
async function initReviews(productId, user) {
  const section = document.getElementById("reviews-section");
  if (section === null) {
    return;
  }

  const formBox = document.getElementById("review-form-box");
  const loginPrompt = document.getElementById("review-login");

  try {
    const data = await fetchJson("api/reviews.php?product_id=" + encodeURIComponent(productId));
    renderReviews(data);
  } catch (error) {
    showMessage(message, "Impossible de charger les avis : " + error.message, "error");
  }

  // Seuls les comptes connectés peuvent laisser un avis.
  if (user === null) {
    loginPrompt.hidden = false;
    return;
  }

  formBox.hidden = false;
  const form = document.getElementById("review-form");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    hideMessage(message);

    const rating = Number(form.elements.rating.value);
    const comment = form.elements.comment.value.trim();

    if (!(rating >= 1 && rating <= 5)) {
      showMessage(message, "Choisissez une note entre 1 et 5.", "error");
      return;
    }
    if (comment.length > 1000) {
      showMessage(message, "Le commentaire ne peut pas dépasser 1000 caractères.", "error");
      return;
    }

    const submitButton = form.querySelector("button[type=submit]");
    submitButton.disabled = true;
    submitButton.textContent = "Publication…";

    try {
      await fetchJson("api/reviews.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_id: productId, rating: rating, comment: comment }),
      });

      showMessage(message, "Merci, votre avis a été publié.", "success");
      formBox.hidden = true;

      // On recharge les avis pour afficher le nouveau et la nouvelle moyenne.
      const data = await fetchJson("api/reviews.php?product_id=" + encodeURIComponent(productId));
      renderReviews(data);
    } catch (error) {
      // 409 : ce compte a déjà donné son avis sur ce produit.
      showMessage(message, error.message, "error");
      submitButton.disabled = false;
      submitButton.textContent = "Publier mon avis";
    }
  });
}

// ----------------------------------------------------------------------
// Démarrage
// ----------------------------------------------------------------------

async function init() {
  const productId = readProductId();
  if (productId === null) {
    return;
  }

  // getCurrentUser() partage la même requête que celle déjà lancée par
  // product.js : aucun appel supplémentaire au serveur.
  const user = await getCurrentUser().catch(() => null);

  initWishlist(Number(productId), user);
  initReviews(Number(productId), user);
}

init();