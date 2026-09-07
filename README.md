# 🎲 Pause Jeux

Application web pour les pauses jeux de société d'équipe : tirage du jeu du jour,
enregistrement des parties en moins d'une minute, classements par semaine / mois / année
et par jeu, fiche joueur avec stats.

**Zéro dépendance, zéro build** : il suffit de Node.js ≥ 18.

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
node scripts/smoke-test.mjs 3000
```

---

## 📁 Structure

```
server.js            Serveur HTTP (API + fichiers statiques), Node pur
lib/store.js         Persistance JSON (écriture atomique + .bak), validations, points
public/              Frontend vanilla JS (SPA, ES modules, aucun build)
  js/views/          dashboard, jeux, joueurs, parties, classements, réglages
data/db.json         Les données (créé au premier lancement, non versionné)
scripts/             Test de fumée de l'API
deploy/              Exemples systemd + Nginx pour la production
```

## 🎮 Fonctionnement

- **Accueil** : « Tirer le jeu du jour » (animation + confettis) ou choix manuel.
  Le tirage ne propose que les jeux **actifs** tenant dans le temps disponible
  et adaptés aux **présents** cochés. Les gagnants de la journée gardent leur place jusqu'au lendemain.
- **Enregistrer une partie** : cocher les présents → toucher les joueurs dans l'ordre
  d'arrivée → Enregistrer. Modes spéciaux : **⚔️ Plusieurs gagnants** (jeux à factions
  : pirates, mutins, loups-garous…), **🤝 Coop** (tout le monde gagne) et
  **💀 Un seul perdant** (pilipili : personne ne gagne, chacun marque juste son point
  de participation, le perdant **perd 1 point** et est compté en défaite).
- **Points** : barème par rang (défaut 5/3/2/1 puis 0) + participation (+1),
  modifiable dans Réglages. Les points sont **figés à l'enregistrement** :
  changer le barème ne réécrit jamais le passé.
- **Classements** : par semaine, mois, année (navigation dans toutes les périodes passées,
  flèches de tendance ▲▼ vs période précédente : parties, victoires, défaites, taux, points)
  et **par jeu** (les plus joués, meilleur joueur). Une partie sans gagnant (pilipili)
  ne distribue que les points de participation.
- **Fiche joueur** : cliquer sur n'importe quel joueur (podium, tableau, puces de
  résultats) ouvre son palmarès, sa courbe de points sur 8 semaines, ses jeux préférés.
- **Intégrité** : un joueur ou un jeu ayant servi à une partie ne se supprime pas,
  il se **désactive** (historique intact).
- **Sauvegarde** : tout vit dans `data/db.json`, avec une copie `.bak` automatique
  avant chaque modification. Export/import JSON dans Réglages.
- **Mobile** : interface responsive (barre de navigation en bas sur téléphone).

## 🚢 Déployer en production

Outil prévu pour un **LAN de confiance** (bureau) : pas d'authentification.
Pour l'exposer, ajoutez au minimum une *basic auth* Nginx.

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
