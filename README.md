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

## GitHub Pages : vitrine statique

Le dossier `.github/workflows/pages.yml` publie une **vitrine** du site sur
GitHub Pages à chaque push sur `main`. GitHub Pages ne pouvant exécuter ni
PHP ni MySQL, cette version ne montre que le design : les données dynamiques
(comptes, panier, commandes) y afficheront des erreurs, car elles viennent de
l'API PHP.

Avant de publier, le workflow démarre le vrai site via `docker-compose.yml`
(MySQL + PHP/Apache) et vérifie que la pile répond (page d'accueil + endpoint
API qui lit en base) : un push qui casse la pile Docker ne publie rien. On ne
publie ensuite que les fichiers statiques (`*.html`, `css/`, `js/`).

Activation (une seule fois) : **Settings → Pages → Build and deployment →
Source : GitHub Actions**. Le site apparaît alors sur
`https://<utilisateur>.github.io/<repo>/`.

## Déploiement continu du site fonctionnel (push → production)

Le site (PHP + MySQL) s'exécute dans Docker ; il faut donc une plateforme qui
lance des conteneurs (GitHub Pages et Vercel ne le peuvent pas).

1. Connecte le dépôt GitHub à une plateforme Docker (Railway, Render, Koyeb…
   ou un VPS avec Dokploy).
2. Provisionne une base MySQL (ou le service MySQL de la plateforme) et
   importe `database/schema.sql` + `database/init-docker.sql`.
3. Renseigne les variables d'environnement du service web : `DB_HOST`,
   `DB_NAME`, `DB_USER`, `DB_PASS` (par exemple `DB_HOST=db` avec
   docker-compose, ou l'hôte fourni par la plateforme).
4. Chaque push sur la branche connectée redéploie automatiquement.