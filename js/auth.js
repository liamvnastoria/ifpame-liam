/**
 * Comptes : état de connexion, en-tête, formulaires, garde des pages.
 *
 * Ce fichier est chargé sur toutes les pages. Il ne s'exécute pas tout seul :
 * chaque page appelle la fonction dont elle a besoin (initAuth() partout,
 * puis initLoginForm(), initRegisterForm() ou initAccountPage()).
 *
 * Point important : ce fichier ne décide jamais de ce qui est permis. Il
 * améliore l'expérience (afficher le bon bouton, ne pas montrer un formulaire
 * inutile), mais c'est PHP qui refuse vraiment. Masquer un formulaire en
 * JavaScript n'a jamais empêché personne d'appeler l'API avec curl.
 *
 * Dépend de : api.js (fetchJson) et ui.js (el, formatPrice), chargés avant.
 */

// Réponse mémorisée à la question « qui est connecté ? ».
// On garde la PROMESSE, pas le résultat : l'en-tête et la page peuvent poser
// la question en même temps, et ils partagent alors une seule requête.
let currentUserPromise = null;

/**
 * Renvoie l'utilisateur connecté ({id, name, email}) ou null.
 * api/me.php répond 200 avec data:null quand personne n'est connecté : ce
 * n'est pas une erreur, donc pas de try/catch obligatoire ici.
 */
function getCurrentUser() {
  if (currentUserPromise === null) {
    currentUserPromise = fetchJson("api/me.php");
  }
  return currentUserPromise;
}

/**
 * Oublie la réponse mémorisée. À appeler après une connexion ou une
 * déconnexion : sinon la page continuerait d'afficher l'ancien état.
 */
function forgetCurrentUser() {
  currentUserPromise = null;
}

/** Remplit la zone de compte de l'en-tête (présente sur toutes les pages). */
function renderAccountNav(user) {
  const nav = document.querySelector("[data-account]");
  if (nav === null) {
    return;
  }

  if (user === null) {
    const login = el("a", "text-slate-600 hover:text-brand", "Connexion");
    login.href = "login.html";
    nav.replaceChildren(login);
    return;
  }

  // Seulement le prénom : l'en-tête doit tenir sur une ligne sur un téléphone.
  const firstName = user.name.split(" ")[0];

  const account = el("a", "text-slate-600 hover:text-brand", firstName);
  account.href = "account.html";

  const logoutButton = el("button", "cursor-pointer text-slate-500 hover:text-brand", "Déconnexion");
  logoutButton.type = "button";
  logoutButton.addEventListener("click", logout);

  nav.replaceChildren(account, logoutButton);
}

/**
 * Charge l'utilisateur et met l'en-tête à jour. Quand un compte est connecté,
 * son panier serveur est chargé en même temps : le badge de l'en-tête reflète
 * alors son vrai contenu.
 * @returns {Promise<object|null>} L'utilisateur, pour que la page puisse s'en servir.
 */
function initAuth() {
  return getCurrentUser()
    .then((user) => {
      renderAccountNav(user);

      if (user === null) {
        // Visiteur sans compte : pas de panier serveur, le badge reste vide.
        resetCartCache();
        refreshCartBadge();
      } else {
        loadCart()
          .then(refreshCartBadge)
          .catch((error) => {
            // Panier indisponible : la page reste utilisable, le badge reste
            // simplement vide.
            console.warn("Panier indisponible :", error.message);
            refreshCartBadge();
          });
      }

      return user;
    })
    .catch(() => {
      // Erreur réseau : la page reste utilisable, l'en-tête affiche
      // simplement « Connexion ».
      renderAccountNav(null);
      resetCartCache();
      refreshCartBadge();
      return null;
    });
}

/** Ferme la session côté serveur puis revient à l'accueil. */
async function logout() {
  try {
    await fetchJson("api/logout.php", { method: "POST" });
  } catch (error) {
    // Même si l'appel échoue, on vide la mémoire locale et on recharge : la
    // session sera vérifiée à nouveau à l'arrivée.
    console.warn("Déconnexion :", error.message);
  }

  forgetCurrentUser();
  // Le panier du compte ne doit pas survivre à la déconnexion dans l'écran.
  resetCartCache();
  refreshCartBadge();
  window.location.href = "index.html";
}

/**
 * Lit le paramètre "next" de l'URL, qui permet de revenir à la page d'où l'on
 * vient (par exemple checkout.html).
 *
 * Le format est vérifié avant utilisation : un lien
 * login.html?next=https://autre-site.example utiliserait notre nom de domaine
 * comme appât pour envoyer le visiteur ailleurs juste après sa connexion.
 * Seul un nom de page simple de ce dossier est accepté.
 */
function safeNextPage() {
  const next = new URLSearchParams(window.location.search).get("next");

  if (next !== null && /^[a-z-]+\.html$/.test(next)) {
    return next;
  }

  return null;
}

/** Formulaire de connexion (login.html). */
function initLoginForm() {
  const form = document.getElementById("login-form");
  if (form === null) {
    return;
  }

  const message = document.getElementById("message");
  const submitButton = document.getElementById("submit-login");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    hideMessage(message);

    const email = form.elements.email.value.trim();
    const password = form.elements.password.value;

    if (email === "" || password === "") {
      showMessage(message, "Renseignez votre adresse e-mail et votre mot de passe.", "error");
      return;
    }

    submitButton.disabled = true;
    submitButton.textContent = "Connexion…";

    try {
      await fetchJson("api/login.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email, password: password }),
      });

      forgetCurrentUser();
      window.location.href = safeNextPage() || "account.html";
    } catch (error) {
      // Le message vient de l'API : « E-mail address or password is
      // incorrect. » avec le code HTTP 401.
      showMessage(message, error.message, "error");
      submitButton.disabled = false;
      submitButton.textContent = "Se connecter";
    }
  });
}

/**
 * Vérifie les champs du formulaire d'inscription.
 * Mêmes règles que api/register.php : ici c'est pour répondre vite et en
 * français, là-bas c'est ce qui protège réellement la base.
 */
function validateRegistration(name, email, password, confirmation) {
  if (name.length < 2 || name.length > 100) {
    return "Le nom doit contenir entre 2 et 100 caractères.";
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return "L'adresse e-mail n'est pas valide.";
  }
  if (email.length > 150) {
    return "L'adresse e-mail ne peut pas dépasser 150 caractères.";
  }
  if (password.length < 8) {
    return "Le mot de passe doit contenir au moins 8 caractères.";
  }
  // 72 caractères : bcrypt n'utilise que les 72 premiers octets, le reste est
  // ignoré sans avertissement. Autant le dire au visiteur tout de suite.
  if (password.length > 72) {
    return "Le mot de passe ne peut pas dépasser 72 caractères.";
  }
  if (password !== confirmation) {
    return "Les deux mots de passe ne correspondent pas.";
  }
  return null;
}

/** Formulaire d'inscription (register.html). */
function initRegisterForm() {
  const form = document.getElementById("register-form");
  if (form === null) {
    return;
  }

  const message = document.getElementById("message");
  const submitButton = document.getElementById("submit-register");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    hideMessage(message);

    const name = form.elements.name.value.trim();
    const email = form.elements.email.value.trim();
    const password = form.elements.password.value;
    const confirmation = form.elements.confirmation.value;

    const problem = validateRegistration(name, email, password, confirmation);
    if (problem !== null) {
      showMessage(message, problem, "error");
      return;
    }

    submitButton.disabled = true;
    submitButton.textContent = "Création…";

    try {
      // api/register.php connecte le compte juste après l'avoir créé : il n'y
      // a donc pas de formulaire de connexion à repasser.
      await fetchJson("api/register.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name, email: email, password: password }),
      });

      forgetCurrentUser();
      window.location.href = "account.html";
    } catch (error) {
      // Ici le message le plus fréquent est le 409 : « This e-mail address is
      // already registered. »
      showMessage(message, error.message, "error");
      submitButton.disabled = false;
      submitButton.textContent = "Créer mon compte";
    }
  });
}

/**
 * Formate une date envoyée par MySQL ("2026-09-16 18:35:00").
 * L'espace est remplacé par un « T » avant l'analyse : sous Safari, la forme
 * d'origine n'est pas reconnue et la page afficherait « Invalid Date ».
 */
function formatOrderDate(value) {
  const date = new Date(String(value).replace(" ", "T"));

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleDateString("fr-BE", { day: "numeric", month: "long", year: "numeric" });
}
