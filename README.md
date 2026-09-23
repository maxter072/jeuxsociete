# 🎲 Pause Jeux

Application web pour les pauses jeux de société d'équipe : tirage du jeu du jour,
enregistrement des parties en moins d'une minute, classements par semaine / mois / année
et par jeu, fiches joueur et jeu avec stats détaillées.

**Zéro dépendance, zéro build** : il suffit de Node.js ≥ 20.

---

## 🚀 Démarrer le projet

```bash
# 1. Récupérer le code
git clone https://github.com/maxter072/jeuxsociete.git
cd jeuxsociete

# 2. Lancer le serveur
node server.js

# 3. Ouvrir dans le navigateur
# → http://localhost:3000
```

C'est tout. Au premier lancement, le serveur crée `data/db.json` et le rempli
avec 10 joueurs et 8 jeux d'exemple (modifiables ensuite dans l'interface).

### Options utiles

| Variable   | Défaut    | Rôle                                       |
|------------|-----------|--------------------------------------------|
| `PORT`     | `3000`    | Port d'écoute                              |
| `HOST`     | `0.0.0.0` | Interface d'écoute (`127.0.0.1` derrière Nginx) |
| `DATA_DIR` | `./data`  | Dossier du fichier de données              |

Exemple pour tester sans toucher ses données :

```bash
PORT=3001 DATA_DIR=/tmp/pj-test node server.js
```

### Vérifier que tout marche (test de fumée)

```bash
node server.js &        # puis :
npm test                # équivalent à : node scripts/smoke-test.mjs 3000
```

---

## 📁 Structure

```
server.js            Serveur HTTP (API + fichiers statiques), Node pur
lib/store.js         Persistance JSON (écriture atomique + .bak), validations, points
public/              Frontend vanilla JS (SPA, ES modules, aucun build)
  js/                Helpers (ui, stats, api) + modales (partie, fiche joueur, fiche jeu)
  js/views/          dashboard, jeux, joueurs, parties, classements, réglages
data/db.json         Les données (créé au premier lancement, non versionné)
scripts/             Test de fumée de l'API
deploy/              Exemples systemd + Nginx pour la production
```

## 🎮 Fonctionnement

- **Accueil** : « Tirer le jeu du jour » (animation + confettis) ou choix manuel.
  Le tirage ne propose que les jeux **actifs** adaptés aux **présents** cochés.
  Les gagnants de la journée gardent leur place jusqu'au lendemain.
  Une tuile de stats affiche le total de parties et le **temps de pause cumulé** depuis la première.
- **Enregistrer une partie** : cocher les présents → toucher les joueurs dans l'ordre
  d'arrivée → Enregistrer. Modes spéciaux : **⚔️ Plusieurs gagnants** (jeux à factions
  : pirates, mutins, loups-garous…), **🤝 Coop** (tout le monde gagne) et
  **💀 Perdants** (pilipili, Traître à bord… : personne ne gagne, un ou plusieurs
  perdants **perdent 1 point** et sont comptés en défaites, les rescapés marquent
  leur point de participation). Un **garde-fou** signale une date dans le futur
  (faute de frappe fréquente) avant l'enregistrement.
- **Points** : barème par rang (défaut 5/3/2/1 puis 0) + participation (+1),
  modifiable dans Réglages. Les points sont **figés à l'enregistrement** :
  changer le barème ne réécrit jamais le passé.
- **♻️ Rejouer en un clic** : bouton sur la fiche d'un jeu et sur chaque partie
  (Accueil, Parties) — rouvre le formulaire avec le même jeu et le même groupe présélectionnés.
- **Classements** : par semaine, mois, année (navigation dans toutes les périodes passées,
  flèches de tendance ▲▼ vs période précédente : parties, victoires, défaites, taux, points)
  et **par jeu** (les plus joués, meilleur joueur — touchez un jeu pour son
  classement détaillé). Un compteur annonce le nombre de parties de la période.
  Une 🔥 flamme marque les séries de victoires en cours (2 ou plus — survolez-la
  pour le détail). En fin de mois : **trophées du mois** — ⏰ Assidu (le plus de parties),
  🧭 Explorateur (le plus de jeux différents), 💀 Zagred du pilipili (le plus de défaites) ;
  en cas d'égalité, pas de trophée. Une partie sans gagnant (pilipili)
  ne distribue que les points de participation.
- **🖼️ Podium en PNG** : bouton sur le classement mensuel — génère l'image du podium
  (flammes et trophées compris) à partager dans le canal de l'équipe, copier,
  **copier en texte** (version 📝 à coller dans un message) ou télécharger.
- **🔍 Recherche** : dans l'historique des Parties, filtrez par jeu, joueur ou note —
  insensible à la casse et aux accents.
- **🎲 Vue Jeux** : recherche, filtres par catégorie, tri « 🔤 A→Z » ou « 🔥 Plus joués »,
  et pastille « 🌱 Jamais joué » sur les jeux qui attendent leur tour.
  Le titre de l'onglet suit la vue affichée.
- **🥊 Duel** : depuis l'onglet Joueurs ou une fiche joueur — face-à-face entre deux
  joueurs : score, ex æquo, série en cours, détail par jeu et dernières confrontations.
- **Fiches joueur & jeu** : cliquer sur n'importe quel joueur (podium, tableau, puces de
  résultats) ouvre son palmarès, sa série de victoires en cours et son record, son record
  de points en une partie, sa date de première partie, sa courbe de points sur 8 semaines,
  ses jeux préférés. Le titre d'un jeu dans l'historique ouvre sa fiche.
  Dans « Par jeu », cliquer un jeu ouvre son classement détaillé et ses dernières parties.
- **Intégrité** : un joueur ou un jeu ayant servi à une partie ne se supprime pas,
  il se **désactive** (historique intact).
- **Sauvegarde** : tout vit dans `data/db.json`, avec une copie `.bak` automatique
  avant chaque modification. Export/import JSON et export CSV dans Réglages.
- **Mobile** : interface responsive (barre de navigation en bas sur téléphone),
  installable sur l'écran d'accueil (« Ajouter à l'écran d'accueil »).

## 🚢 Déployer en production

Outil prévu pour un **LAN de confiance** (bureau) : pas d'authentification.
Pour l'exposer, ajoutez au minimum une *basic auth* Nginx.

Protections intégrées côté serveur : mutations réservées au JSON d'une origine
identique (anti-CSRF, `Origin: null` refusé), limite de débit par IP, en-têtes
de sécurité (CSP stricte avec `object-src`/`base-uri`, nosniff, anti-iframe),
import de sauvegarde entièrement revalidé (entités, volumes, points recalculés),
chemin disque jamais exposé, plafond de 10 000 parties, corps de requête limité
à 2 Mo (le client reçoit bien l'erreur 413), journal des mutations (date, IP,
méthode, route), et réparation automatique au démarrage : si `db.json` est
corrompu, le serveur repart de la copie `.bak` (le fichier illisible est mis de
côté, jamais écrasé).

Variables d'environnement supplémentaires pour la production :

| Variable         | Rôle                                                                   |
|------------------|------------------------------------------------------------------------|
| `TRUST_PROXY=1`  | Derrière Nginx en local : l'IP client est lue dans `X-Real-IP` (limite de débit, journal) |
| `ALLOWED_HOSTS`  | Hosts acceptés, séparés par des virgules (anti DNS-rebinding ; 421 sinon). Vide = désactivé |

```bash
# 1. Installer
mkdir -p /opt/pause-jeux && cp -r server.js lib public package.json /opt/pause-jeux/
useradd -r -s /usr/sbin/nologin pausejeux 2>/dev/null || true
chown -R pausejeux:pausejeux /opt/pause-jeux

# 2. Service systemd
cp deploy/pause-jeux.service /etc/systemd/system/
systemctl daemon-reload && systemctl enable --now pause-jeux

# 3. Reverse proxy Nginx (adapter le domaine dans la conf)
cp deploy/nginx-pause-jeux.conf /etc/nginx/sites-available/pause-jeux.conf
ln -s /etc/nginx/sites-available/pause-jeux.conf /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

# 4. Sauvegarde quotidienne (cron)
# 30 23 * * * cp /opt/pause-jeux/data/db.json /opt/pause-jeux/data/db-$(date +\%Y\%m\%d).json
```
