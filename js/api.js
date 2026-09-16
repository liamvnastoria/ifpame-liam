/**
 * La couche d'accès à l'API PHP.
 *
 * Une seule fonction, fetchJson(), utilisée par les trois appels du site :
 * liste des produits, fiche produit, envoi de la commande. La gestion des
 * erreurs est ainsi écrite une seule fois, et les trois pages se comportent
 * de la même façon en cas de problème.
 */

/**
 * Appelle une URL et renvoie le contenu de "data" en cas de succès.
 *
 * Rappel du format imposé par toute l'API :
 *   succès : {"success": true,  "data": ...}
 *   erreur : {"success": false, "error": "message"}
 *
 * @param {string} url        Adresse relative, ex. "api/product.php?id=3".
 * @param {object} [options]  Options de fetch, ex. { method: "POST", body: "..." }.
 * @returns {Promise<any>}    La valeur de "data".
 * @throws {Error}            Un message lisible, prêt à être affiché.
 */
async function fetchJson(url, options) {
  // Le chemin est relatif ("api/..." et non "/api/...") : le site fonctionne
  // aussi bien servi depuis la racine que depuis un sous-dossier de XAMPP.
  const response = await fetch(url, options);

  let payload;
  try {
    payload = await response.json();
  } catch (error) {
    // fetch() ne rejette sa promesse que sur une erreur réseau. Un PHP qui
    // plante renvoie souvent une page HTML : on préfère un message clair à
    // l'erreur incompréhensible « Unexpected token < in JSON ».
    throw new Error("Réponse illisible du serveur (HTTP " + response.status + ").");
  }

  // response.ok est faux pour 400, 404, 405, 409 ou 500. Dans ce cas l'API
  // fournit toujours un message "error" explicite, qu'on affiche tel quel.
  if (!response.ok || payload.success !== true) {
    throw new Error(payload.error || "Erreur inconnue (HTTP " + response.status + ").");
  }

  return payload.data;
}
