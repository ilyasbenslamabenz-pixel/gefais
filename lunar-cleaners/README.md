# 🌕 Lunar Cleaners

Jeu vidéo 3D **multijoueur coopératif** jouable directement dans le navigateur : jusqu'à 16 joueurs nettoient ensemble la surface de la Lune, récoltent des ressources, les revendent et développent leur entreprise de nettoyage lunaire.

- **Frontend** : React 19, TypeScript, Three.js, React Three Fiber, Zustand, Vite
- **Backend** : Node.js, Express, Socket.IO (serveur autoritaire)
- **Base de données** : SQLite (module natif `node:sqlite`, aucune compilation requise)

---

## 🚀 Installation et lancement

Prérequis : **Node.js 22.13 ou plus récent** (pour `node:sqlite`).

```bash
cd lunar-cleaners
npm install
```

### Mode développement (rechargement à chaud)

```bash
npm run dev
```

- Client : http://localhost:5173 (Vite, proxifie `/socket.io` et `/api` vers le serveur)
- Serveur : http://localhost:3001

Ouvrez plusieurs onglets ou navigateurs (ou d'autres PC du réseau local via `http://<ip-de-votre-pc>:5173`) pour jouer à plusieurs.

> Chaque onglet d'un même navigateur partage le même profil (stocké dans `localStorage`). Pour tester à plusieurs sur un seul PC, utilisez des navigateurs différents ou une fenêtre de navigation privée.

### Mode production (une seule adresse)

```bash
npm run build     # construit le client dans client/dist
npm start         # le serveur sert le jeu + le temps réel sur http://localhost:3001
```

Variables d'environnement :

| Variable | Défaut | Rôle |
|---|---|---|
| `PORT` | `3001` | Port HTTP du serveur |
| `DATA_DIR` | `server/data` | Dossier de la base SQLite (`lunar.db`) |
| `CORS_ORIGIN` | toutes | Origines autorisées (séparées par des virgules) si le client est hébergé ailleurs |
| `VITE_SERVER_URL` | même origine | (build client) URL du serveur si le client est hébergé séparément |

### Docker / mise en ligne

```bash
docker build -t lunar-cleaners .
docker run -p 3001:3001 -v lunar-data:/app/server/data lunar-cleaners
```

Pour rendre le jeu accessible depuis une simple adresse Internet, déployez ce conteneur (ou `npm run build && npm start`) sur n'importe quel hébergeur Node supportant les WebSockets (Render, Railway, Fly.io, un VPS…). Montez un volume persistant sur `DATA_DIR` pour conserver les sauvegardes.

---

## 🎮 Commandes

| Touche | Action |
|---|---|
| ZQSD / WASD (ou flèches) | Se déplacer / conduire |
| Souris | Caméra (cliquez sur le jeu pour verrouiller le curseur) |
| Molette | Zoom |
| Clic gauche maintenu | Utiliser l'outil (nettoyer, casser les débris) |
| Maj | Courir |
| Espace | Sauter (gravité lunaire !) |
| E | Interagir : vendre au Collecteur, boutique, garage |
| V | Monter / descendre du véhicule sélectionné |
| F | Brosses du véhicule on/off |
| R | Pilote automatique (Robot autonome géant) |
| 1 – 7 | Changer d'outil |
| B / I / M / L | Boutique / Inventaire / Missions / Classement |
| Entrée | Chat d'équipe |
| Échap | Menu pause |

Sur tablette/mobile, un joystick virtuel, la caméra au doigt et des boutons d'action s'affichent automatiquement.

---

## 🧹 Contenu du jeu

### Boucle de jeu
1. Nettoyez la poussière (clic gauche) : elle disparaît du sol en temps réel et remplit votre **soute**.
2. Cassez les **débris** (rochers, déchets spatiaux, amas de cristaux, capsules extraterrestres) pour obtenir des ressources rares.
3. Revenez au **Collecteur** (borne jaune de la station) et appuyez sur **E** pour vendre.
4. Achetez outils, véhicules et améliorations ; montez de niveau ; attaquez des zones plus difficiles.

### Outils (7 niveaux)
Brosse manuelle → Balai lunaire → Aspirateur portatif → Aspirateur industriel → Machine motorisée → Robot autonome (drone qui nettoie seul en orbite autour de vous) → Véhicule industriel de nettoyage (plateforme flottante pilotée debout). Chacun a sa puissance, son rayon, sa portée, sa capacité, sa vitesse, son prix et son niveau requis.

### Véhicules conduisibles
Petit robot aspirateur, Mini-tracteur lunaire, Véhicule industriel, Camion de collecte (énorme soute), Robot autonome géant (pilote automatique). Chacun a sa vitesse, sa maniabilité, son rayon/puissance de nettoyage et son bonus de soute.

### Ressources
Poussière lunaire, Minéraux, Débris métalliques, Cristaux rares, Xénolite — chacune avec sa valeur marchande.

### Zones
Zone de départ, Ancienne base spatiale, Cratère des débris, Zone industrielle, Station abandonnée, Gisement de minéraux rares. Chaque zone a une dureté (puissance nécessaire), un rendement, des ressources spécifiques et une **prime de certification coopérative** versée à tous les participants quand la zone atteint 60 % de propreté. Une tempête de poussière la re-salit ensuite (5 min) pour relancer l'objectif.

### Progression
- Portefeuille, inventaire, XP et niveaux
- Améliorations de la base : soute, raffinerie (prix de vente), propulseurs, moteur de nettoyage, scanner géologique
- 11 missions de carrière enchaînées, 3 objectifs quotidiens générés chaque jour
- Classement mondial (gains totaux), profil personnalisable (couleurs, visière, accessoire)
- Sauvegarde automatique côté serveur (SQLite)

### Multijoueur
- Parties publiques ou privées (code à 5 caractères), jusqu'à 16 joueurs, partie publique permanente « Base Alpha »
- Chaque partie possède sa propre Lune partagée : poussière, débris et zones synchronisés en temps réel
- Déplacements, véhicules, outils et actions de nettoyage des coéquipiers visibles
- Liste des joueurs, chat textuel, mini-carte avec positions de l'équipe

---

## 🏗️ Architecture

```
lunar-cleaners/
├── shared/            Code partagé client/serveur (déterministe)
│   ├── data.ts        Équilibrage : ressources, outils, véhicules, améliorations, missions, quotidiennes
│   ├── world.ts       Relief procédural, zones, décors, grille de poussière, algorithme de nettoyage
│   ├── noise.ts       Bruit procédural déterministe
│   └── protocol.ts    Types des messages réseau
├── server/src/
│   ├── index.ts       Express + Socket.IO : sessions, parties, achats, ventes, chat
│   ├── room.ts        Simulation d'une partie (poussière, débris, zones, tempêtes, diffusion)
│   ├── profiles.ts    Économie et progression des joueurs
│   └── db.ts          Persistance SQLite
└── client/src/
    ├── game/          Scène 3D (terrain + shader de poussière, ciel, décors, modèles, joueurs, particules)
    ├── ui/            Menu, HUD, panneaux, contrôles clavier/souris/tactile
    ├── net/socket.ts  Client temps réel
    ├── store.ts       État UI (Zustand)
    └── audio.ts       Sons synthétisés (Web Audio)
```

**Réseau** — Le serveur est autoritaire : il possède la grille de poussière (512×512 cellules de 50 cm) de chaque partie, valide chaque coup de nettoyage (distance, outil, capacité), calcule les gains et diffuse à 15 Hz des snapshots des joueurs et des différentiels binaires de poussière. Le client prédit localement le nettoyage pour une réponse instantanée, puis se cale sur l'état du serveur.

**Rendu** — Le sol est un maillage procédural dont le shader mélange régolithe propre et poussière selon une texture mise à jour en temps réel. Tous les modèles (astronautes, outils, véhicules, bâtiments) sont générés procéduralement : aucun fichier 3D à télécharger, chargement quasi instantané. Trois niveaux de qualité (ombres, résolution, densité du terrain et des particules).

**Navigateurs** — Chrome, Firefox, Edge et Safari récents (WebGL 2).
