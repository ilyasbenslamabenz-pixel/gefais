# ECO NATION — Plan d'architecture

## 1. Analyse de l'existant

Le dépôt contient :

| Élément | Contenu | Décision |
|---|---|---|
| `index.html`, `adhesion.html` | Application web « GE-Fais » sans lien avec le jeu | Non modifiés |
| `lunar-cleaners/` | Jeu 3D multijoueur de nettoyage lunaire (React, R3F, Zustand, Node, Socket.IO, PostgreSQL/SQLite) | Conservé tel quel, sert de **socle technique** |

**Réutilisé** depuis Lunar Cleaners (adapté) :
- Chaîne d'outils : Vite + React 19 + TypeScript + Three.js / React Three Fiber + Zustand ; serveur Node + Express + Socket.IO lancé par `tsx`.
- Persistance double PostgreSQL (`DATABASE_URL`) / SQLite (repli de développement) : `server/src/db.ts`.
- Bruit procédural déterministe (`shared/noise.ts`), techniques de terrain par shader, instanciation de modèles, sons synthétisés, base de styles UI.

**Remplacé intégralement** (incompatible avec le concept) : boucle de nettoyage, économie de ressources, outils, véhicules pilotés, zones lunaires, salles multijoueur temps réel à 15 Hz, contrôleur à la troisième personne.

ECO NATION vit dans un dossier séparé `eco-nation/` pour ne rien casser de l'existant.

## 2. Principes

1. **Source de vérité unique côté serveur.** Toute la simulation tourne dans `shared/sim` (TypeScript pur, sans dépendance au navigateur) et est exécutée par le serveur. Le client ne calcule aucune statistique : il affiche des instantanés (`Snapshot`) produits par le moteur.
2. **Déterminisme.** Génération du pays et événements à partir d'une graine ; mêmes entrées → mêmes sorties (testable).
3. **Comptabilité cohérente.** Chaque euro est tracé : recettes = somme des impôts ; dépenses = somme des postes ; Δ dette = besoin de financement ; PIB = somme des valeurs ajoutées sectorielles. Ces identités sont vérifiées par des tests automatisés.
4. **Unités explicites.** Chaque indicateur a une définition, une unité et une période (`shared/sim/indicators.ts`).
5. **Délais et inerties.** Les politiques entrent en vigueur au mois suivant ; l'emploi, la qualité des services, les capacités et les émissions s'ajustent progressivement.

## 3. Pas de temps

- Pas de simulation : **1 mois**. Les montants annuels (budgets, salaires) sont divisés par 12.
- Vitesses : pause, ×1 (1 mois = 4 s), ×2, ×5, ×10.
- Historique mensuel conservé pour les graphiques (10, 20, 50 ans et plus).

## 4. Moteurs et flux de données

```
Policy (décisions du joueur)  ──►  tick(state, policy) ──►  nouvel état + Snapshot
                                     │
   démographie ─► marché du travail ─► revenus des ménages ─► fiscalité ─► consommation (TVA)
        ▲                │                                        │
        │                ▼                                        ▼
   satisfaction ◄── économie sectorielle (demande, production, emploi, profits, investissement,
        ▲            exportations, importations, prix, salaires, entreprises)
        │                                                         │
   services publics ◄── budget de l'État (recettes, dépenses, dette, intérêts, obligations)
```

| Moteur | Fichier | Rôle |
|---|---|---|
| Pays | `sim/country.ts` | Génération du territoire, villes, réseaux, infrastructures |
| Démographie | `sim/demography.ts` | Cohortes quinquennales, naissances, décès, migrations, catégories socio-économiques |
| Fiscal | `sim/fiscal.ts` | Barème progressif, IS, TVA par catégorie, patrimoine, immobilier, écotaxes, cotisations |
| Économie / emploi | `sim/economy.ts` | 12 secteurs, demande, production, emploi, salaires, profits, investissement, prix |
| Finances publiques | `sim/budget.ts` | Recettes, dépenses, solde, trésorerie, dette, obligations, taux |
| Social | `sim/social.ts` | Qualité des services, satisfaction par catégorie et par ville, confiance, risques |
| Orchestration | `sim/engine.ts` | Ordre des moteurs, historique, notifications |

Phases suivantes (même interface `tick`) : énergie, environnement, industrie, agriculture, transports, déchets, politique et parlement, relations internationales, crises, recherche, construction.

## 5. Modèle économique (résumé)

- **Revenus** : salaires sectoriels × emploi ; pensions = retraités × taux de remplacement × salaire moyen ; allocations chômage ; prestations familiales ; aides au logement ; revenus du capital.
- **Impôt sur le revenu** : chaque catégorie a une distribution log-normale des revenus, intégrée sur 20 quantiles ; le barème progressif s'applique au revenu imposable (brut − cotisations salariales − abattement), moins le crédit d'impôt.
- **Consommation** : propension à consommer × revenu disponible, répartie en 9 catégories de produits ; chaque catégorie est soumise au taux de TVA choisi (normal, réduit, spécial, exonéré). La TVA réduit le volume réel acheté et se répercute sur les prix.
- **Demande sectorielle** = consommation nette de TVA + achats publics + investissement + exportations − importations.
- **Emploi** : cible = production / productivité, corrigée par le coût du travail (salaire, cotisations patronales, aides à l'embauche) ; ajustement progressif borné par la population active.
- **Profits et IS** : valeur ajoutée − masse salariale chargée − énergie − amortissement ; IS sur bénéfices moins crédits d'investissement et crédits verts.
- **Investissement** : part des profits après impôt modulée par le taux d'IS, le taux d'intérêt et la confiance ; accroît la productivité.
- **Prix** : inflation = anticipations + écart de production + répercussion de la TVA et des taxes énergétiques + pression salariale ; banque centrale (règle de Taylor).
- **Exportations** : compétitivité (coût unitaire du travail, prix de l'énergie, fiscalité) à l'élasticité près.
- **Dette** : taux moyen convergeant lentement vers le taux de marché (taux directeur + prime de risque fonction de la dette/PIB).

L'état initial est **calibré** pour être à l'équilibre (exportations résiduelles), si bien que toute dynamique résulte des décisions du joueur et des chocs.

## 6. Serveur

- `POST /api/games` : nouvelle partie (configuration : nombre de villes, graine, nom du pays).
- `GET /api/games` : sauvegardes du joueur ; `GET /api/games/:id`.
- `POST /api/games/:id/save` (option « sauvegarder sous »), `DELETE /api/games/:id`.
- Socket.IO : `game:open`, `game:speed`, `game:policy`, `game:action` → `game:snapshot` à chaque mois simulé, `game:notice`.
- Sauvegarde automatique tous les 12 mois simulés et à la déconnexion. Une partie n'avance que lorsqu'elle est ouverte.

## 7. Client

- Carte 3D (1 unité = 1 km) : relief, mer, lacs, rivières, forêts, champs, villes instanciées, routes, autoroutes, voies ferrées, aéroports, ports, centrales ; voitures, trains, avions et bateaux animés ; cycle jour/nuit, saisons, météo.
- Caméra stratégique : panoramique, rotation, zoom, clavier ; sélection et inspection des villes et infrastructures.
- Interface : barre supérieure (date, trésorerie, population, PIB, chômage, inflation, satisfaction, solde), contrôle du temps, dock des ministères, panneaux détaillés, statistiques historiques, notifications.

## 8. Feuille de route

| Phase | Contenu | État |
|---|---|---|
| 1 | Carte 3D, pays construit, population, villes, bâtiments, caméra, interface | Livrée |
| 2 | Économie, fiscalité, budget, dette, entreprises, emploi, salaires | Livrée |
| 3 | Satisfaction (socle livré), santé, éducation, logement, services publics, démographie avancée | À venir |
| 4 | Énergie, environnement, industrie, agriculture, transports, déchets | À venir |
| 5 | Politique, parlement, lois, élections, international, crises | À venir |
| 6 | Recherche, événements, missions, progression | À venir |
| 7 | Optimisation, équilibrage, finitions graphiques | À venir |
