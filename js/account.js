/**
 * Page « Mon compte » — account.html
 *
 * Quatre blocs indépendants, tous liés au compte connecté :
 *   - l'identité et la déconnexion ;
 *   - l'édition du profil (nom, e-mail, adresse) et le changement de mot de
 *     passe (api/account.php) ;
 *   - la liste d'envies (api/wishlist.php) ;
 *   - l'historique détaillé des commandes (api/orders.php).
 *
 * Dépend de : cart-storage.js, api.js, ui.js, auth.js.
 */

/** Affiche un message d'erreur dans la zone commune de la page. */
function showError(text) {
  showMessage(document.getElementById("message"), text, "error");
}

/** Vérifie le formulaire de profil. Mêmes règles que api/account.php. */
function validateProfile(name, email, address) {
  if (name.length < 2 || name.length > 100) {
    return "Le nom doit contenir entre 2 et 100 caractères.";
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return "L'adresse e-mail n'est pas valide.";
  }
  if (email.length > 150) {
    return "L'adresse e-mail ne peut pas dépasser 150 caractères.";
  }
  if (address.length > 255) {
    return "L'adresse ne peut pas dépasser 255 caractères.";
  }
  return null;
}

/** Remplit et branche le formulaire d'édition du profil. */
function initProfileForm(user) {
  const form = document.getElementById("profile-form");
  if (form === null) {
    return;
  }

  form.elements.name.value = user.name;
  form.elements.email.value = user.email;
  form.elements.address.value = user.address || "";

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    hideMessage(document.getElementById("message"));

    const name = form.elements.name.value.trim();
    const email = form.elements.email.value.trim();
    const address = form.elements.address.value.trim();

    const problem = validateProfile(name, email, address);
    if (problem !== null) {
      showError(problem);
      return;
    }

    const submitButton = form.querySelector("button[type=submit]");
    submitButton.disabled = true;
    submitButton.textContent = "Enregistrement…";

    try {
      await fetchJson("api/account.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "profile", name: name, email: email, address: address }),
      });

      // Le profil a changé : l'identité affichée et l'en-tête doivent montrer
      // les nouvelles valeurs, donc on oublie l'ancienne réponse de me.php.
      forgetCurrentUser();
      const updated = await getCurrentUser();
      renderAccountNav(updated);
      document.getElementById("account-name").textContent = updated.name;
      document.getElementById("account-email").textContent = updated.email;
      showMessage(document.getElementById("message"), "Profil mis à jour.", "success");
    } catch (error) {
      showError(error.message);
    }

    submitButton.disabled = false;
    submitButton.textContent = "Enregistrer";
  });
}

/** Remplit et branche le formulaire de changement de mot de passe. */
function initPasswordForm() {
  const form = document.getElementById("password-form");
  if (form === null) {
    return;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    hideMessage(document.getElementById("message"));

    const current = form.elements.current_password.value;
    const next = form.elements.new_password.value;
    const confirmation = form.elements.confirmation.value;

    if (next.length < 8 || next.length > 72) {
      showError("Le nouveau mot de passe doit contenir entre 8 et 72 caractères.");
      return;
    }
    if (next !== confirmation) {
      showError("Les deux mots de passe ne correspondent pas.");
      return;
    }

    const submitButton = form.querySelector("button[type=submit]");
    submitButton.disabled = true;
    submitButton.textContent = "Changement…";

    try {
      await fetchJson("api/account.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "password", current_password: current, new_password: next }),
      });

      showMessage(document.getElementById("message"), "Mot de passe modifié.", "success");
      form.reset();
    } catch (error) {
      // 401 : le mot de passe actuel est incorrect.
      showError(error.message);
    }

    submitButton.disabled = false;
    submitButton.textContent = "Changer le mot de passe";
  });
}

/** Construit la carte d'un produit de la liste d'envies, avec un bouton « Retirer ». */
function createWishlistCard(product) {
  const card = el("div", "product-card relative");

  const mediaLink = el("a", "block");
  mediaLink.href = "product.html?id=" + product.id;
  mediaLink.append(createThumbnail(product));

  const body = el("div", "product-card-body");
  const title = el("h2", "product-card-name");
  const titleLink = el("a", null, product.name);
  titleLink.href = "product.html?id=" + product.id;
  title.append(titleLink);

  body.append(
    el("p", "product-card-category", product.category_name),
    title,
    createPriceLine(product)
  );

  const removeButton = el("button", "btn btn-link", "Retirer");
  removeButton.type = "button";
  removeButton.addEventListener("click", async () => {
    try {
      await fetchJson("api/wishlist.php", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_id: product.id }),
      });
      renderWishlist();
    } catch (error) {
      showError(error.message);
    }
  });

  card.append(mediaLink, body, removeButton);
  return card;
}

/** Remplit la liste d'envies. */
async function renderWishlist() {
  const grid = document.getElementById("wishlist-grid");
  const empty = document.getElementById("wishlist-empty");

  try {
    const items = await fetchJson("api/wishlist.php");

    empty.hidden = items.length !== 0;
    grid.hidden = items.length === 0;
    grid.replaceChildren(...items.map(createWishlistCard));
  } catch (error) {
    showError("Impossible de charger la liste d'envies : " + error.message);
  }
}

/** Construit le bloc d'une commande dans l'historique. */
function createOrderBlock(order) {
  const block = el("li", "rounded-xl border border-slate-200 bg-white p-5");

  const header = el("div", "flex flex-wrap items-baseline justify-between gap-2");
  header.append(
    el("span", "font-semibold text-slate-900", "Commande #" + order.id),
    el("span", "text-sm text-slate-500", formatOrderDate(order.created_at)),
    el("span", "font-bold", formatPrice(order.total))
  );

  // L'adresse de livraison, recopiée au moment de la commande.
  const address = el("p", "mt-2 text-sm text-slate-500", "Livré à : " + order.address);

  const lines = el("ul", "mt-3 space-y-1 border-t border-slate-200 pt-3 text-sm text-slate-600");
  for (const line of order.items) {
    lines.append(
      el("li", null, line.quantity + " × " + line.name + " — " + formatPrice(line.unit_price))
    );
  }

  const shipping = el("p", "mt-2 text-sm text-slate-500", "Livraison : " + (order.shipping === 0 ? "Offerte" : formatPrice(order.shipping)));

  block.append(header, address, lines, shipping);
  return block;
}

/** Remplit l'historique des commandes. */
async function renderOrders() {
  const list = document.getElementById("order-history");
  const message = document.getElementById("message");

  try {
    // GET api/orders.php ne prend aucun paramètre : l'API filtre sur le
    // compte de la session et ne renvoie que SES commandes.
    const orders = await fetchJson("api/orders.php");

    if (orders.length === 0) {
      list.append(el("li", "py-3 text-slate-500", "Vous n'avez pas encore passé de commande."));
      return;
    }

    list.replaceChildren(...orders.map(createOrderBlock));
  } catch (error) {
    showMessage(message, error.message, "error");
  }
}

/** Démarrage de la page « Mon compte ». */
async function initAccountPage() {
  refreshCartBadge();
  initHeaderNav();
  const user = await initAuth();

  const page = document.getElementById("account-page");

  if (user === null) {
    // La page est accessible en tapant son adresse : un visiteur sans compte
    // est envoyé vers le formulaire de connexion, plutôt que de voir une page
    // vide sans explication.
    window.location.href = "login.html?next=account.html";
    return;
  }

  document.getElementById("account-name").textContent = user.name;
  document.getElementById("account-email").textContent = user.email;
  document.getElementById("account-logout").addEventListener("click", logout);
  page.hidden = false;

  initProfileForm(user);
  initPasswordForm();
  renderWishlist();
  renderOrders();
}

initAccountPage();