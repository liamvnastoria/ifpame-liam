/**
 * Page d'accueil — index.html
 *
 * Le rôle de cette page est de montrer la STRUCTURE du catalogue : des
 * départements, leurs sous-catégories, et quatre points d'entrée différents
 * dans le même catalogue. Elle ne sert presque aucun contenu statique.
 *
 * Flux : la page se charge → un appel pour les catégories (tuiles, en-tête,
 * pied de page) → quatre appels produits en parallèle pour les rangées.
 *
 * Dépend de : cart-storage.js, api.js, ui.js.
 */

const message = document.getElementById("message");
const tiles = document.getElementById("category-tiles");
const footerLinks = document.getElementById("footer-links");

// Les quatre rangées sont décrites par des données, pas par du code répété
// quatre fois : le même loadRow() les affiche toutes.
// Chaque requête réutilise l'endpoint api/products.php existant.
const ROWS = [
  { id: "row-new",     query: "sort=id&limit=8" },
  { id: "row-cheap",   query: "sort=price&limit=8" },
  { id: "row-promo",   query: "promo=1&limit=8" },
  { id: "row-popular", query: "sort=popular&limit=8" },
];

/** Tuiles des départements, avec le nombre de produits et les sous-catégories. */
function renderTiles(categories) {
  const cards = categories.map((department) => {
    const link = el(
      "a",
      "group flex flex-col rounded-xl border border-slate-200 bg-white p-5 transition hover:border-brand hover:shadow-md"
    );
    link.href = "products.html?category=" + department.id;

    // Le nombre vient de SQL (COUNT + GROUP BY) et non d'un comptage en
    // JavaScript : la base sait déjà combien de produits elle contient.
    link.append(
      el("span", "font-semibold text-slate-900 group-hover:text-brand", department.name),
      el("span", "mt-1 text-sm text-slate-500", department.product_count + " produits"),
      el(
        "span",
        "mt-3 text-xs leading-relaxed text-slate-400",
        department.children.map((child) => child.name).join(" · ")
      )
    );

    return link;
  });

  tiles.replaceChildren(...cards);
}

/** Colonnes du pied de page : un département par colonne. */
function renderFooterLinks(categories) {
  const columns = categories.map((department) => {
    const column = el("div");
    const list = el("ul", "mt-2 space-y-1 text-sm text-slate-500");

    for (const child of department.children) {
      const link = el("a", "hover:text-brand", child.name);
      link.href = "products.html?category=" + child.id;
      const item = el("li");
      item.append(link);
      list.append(item);
    }

    column.append(el("h3", "text-sm font-semibold text-slate-900", department.name), list);
    return column;
  });

  footerLinks.replaceChildren(...columns);
}

/** Charge une rangée de produits. */
async function loadRow(row) {
  const section = document.getElementById(row.id);
  const container = section.querySelector("[data-row]");
  const rowMessage = section.querySelector("[data-message]");

  try {
    const products = await fetchJson("api/products.php?" + row.query);

    if (products.length === 0) {
      // Une rangée vide est masquée entièrement : un cadre « Promotions »
      // sans produit ressemblerait à un bug, alors qu'il signifie simplement
      // qu'il n'y a rien à montrer aujourd'hui.
      section.hidden = true;
      return;
    }

    container.replaceChildren(...products.map(createProductCard));
  } catch (error) {
    // Chaque rangée gère son erreur toute seule : une rangée en panne
    // n'empêche pas les trois autres de s'afficher.
    showMessage(rowMessage, error.message, "error");
  }
}

async function init() {
  try {
    // Un seul appel pour les trois endroits qui ont besoin de la structure du
    // catalogue : la barre de l'en-tête, les tuiles et le pied de page.
    const categories = await fetchJson("api/categories.php");
    renderDepartmentNav(categories);
    renderTiles(categories);
    renderFooterLinks(categories);
  } catch (error) {
    showMessage(message, "Impossible de charger le catalogue : " + error.message, "error");
  }

  // Les quatre rangées sont indépendantes : Promise.all les lance EN MÊME
  // TEMPS au lieu de les enchaîner. Quatre requêtes simultanées coûtent le
  // temps d'une seule, alors qu'un await l'un après l'autre les additionne.
  await Promise.all(ROWS.map(loadRow));
}

refreshCartBadge();
initAuth();
init();
