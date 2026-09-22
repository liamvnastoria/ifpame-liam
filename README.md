# Octet — boutique informatique fictive

Projet pédagogique IFAPME : une boutique en ligne **sans paiement réel**.
Comptes individuels, panier par compte, liste d'envies, avis produits et
commandes — le tout en **PHP 8 / MySQL** côté serveur et **JavaScript +
Tailwind** côté navigateur.

## Fonctionnalités

- Catalogue à deux niveaux (départements → sous-catégories), recherche, tri,
  promotions et meilleures ventes.
- Comptes individuels : inscription, connexion, édition du profil et du mot
  de passe.
- Panier **par compte**, stocké en base (identique sur tous les appareils),
  et liste d'envies.
- Avis et notes produits, un avis par compte et par produit.
- Commande avec frais de port (4,95 € sous 75 €, offerts au-delà) et montant
  de TVA 21 % affiché.
- Historique détaillé des commandes (adresse, frais de port, lignes).

## Démarrer en local (sans Docker)

Prérequis : PHP 8.1+, MySQL ou MariaDB, Node 20+.

1. Importer la base : `sudo mysql < database/schema.sql`
2. `npm install`
3. `npm run dev` → http://127.0.0.1:8000

Comptes de démonstration : `marie.dupont@example.com` et
`karim.benali@example.com`, mot de passe `demo1234`.

## Démarrer avec Docker (recommandé)

Prérequis : Docker + Docker Compose.

```bash
docker compose up --build
```

Le site est sur http://127.0.0.1:8080. Au premier démarrage, la base est
importée automatiquement : `database/schema.sql` crée les tables et les
comptes locaux, `database/init-docker.sql` ajoute le compte autorisé à se
connecter depuis le conteneur web (`shop`@`%`).

- `docker compose down` arrête les conteneurs (données conservées).
- `docker compose down -v` efface aussi les données, le schéma est réimporté
  au redémarrage suivant.

La configuration se lit dans l'environnement : `config/database.php` utilise
`getenv()` avec un repli local, donc le même code tourne sur XAMPP/MAMP, en
Docker, et en production sans modification.

## GitHub Pages : vitrine statique (abandonné)

Anciennement, `.github/workflows/pages.yml` publiait une **vitrine** statique
sur GitHub Pages à chaque push sur `main`. GitHub Pages ne pouvant exécuter ni
PHP ni MySQL, cette version ne montrait que le design, sans données dynamiques.
Ce workflow a été retiré : le déploiement passe désormais par Vercel (ci-dessous),
où le site complet — API comprise — est fonctionnel.

## Déploiement sur Vercel (site complet)

Vercel ne lit pas `docker-compose.yml` (Vercel n'a pas de cible de déploiement
Compose ; il déploie des images Docker uniques, traduites de la main de
l'homme). Le plan ci-dessous traduit chaque morceau de la pile :

1. **Le service `web` → image Vercel.** `Dockerfile.vercel` à la racine est
   détecté automatiquement : c'est la traduction du service `web` de
   `docker-compose.yml` (même image PHP + Apache + `pdo_mysql`). Le conteneur
   sert le frontend ET l'API, comme en local, donc les URLs relatives de
   `js/api.js` restent inchangées. `docker-compose.yml` continue de servir au
   développement local (`docker compose up --build`).
2. **Le service `db` → base MySQL externe.** Vercel n'héberge ni MySQL ni
   MariaDB (son système de fichiers est éphémère, sans volume persistant).
   Provisionne une base MySQL/MariaDB chez un fournisseur (Aiven, Railway,
   Clever Cloud…) et importe une seule fois `database/schema.sql`.
3. **Variables d'environnement du projet Vercel** (secrets) :
   `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASS` —
   `config/database.php` les lit déjà via `getenv()`. Quel que soit le
   fournisseur, autorise les connexions depuis Vercel (accès public, IP
   autorisées…).
4. **Limite à connaître : les sessions.** Elles sont stockées en fichiers par
   PHP, or sur Vercel chaque instance a un stockage éphémère et peut redémarrer
   à zéro pendant l'inactivité : un visiteur peut perdre sa connexion. Acceptable
   pour une démo ; pour un vrai site, déplacer les sessions vers Redis (Vercel
   KV) et les gérer via un cookie persistant.
5. Chaque push sur la branche connectée redéploie : Vercel reconstruit l'image
   du `Dockerfile.vercel` et republie. Le site (frontend + API + base) est alors
   fonctionnel sur `https://<projet>.vercel.app`.