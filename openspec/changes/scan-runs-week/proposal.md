# Proposal — Carte « Scans de la semaine »

## Pourquoi

L'utilisateur n'a aucune vue agrégée des runs de scan de la semaine : il faut ouvrir le panneau connecteurs ou attendre une notification. La carte « Scans de la semaine » affiche, par connecteur actif, l'état du dernier run, le nombre de missions récupérées et l'heure du scan — dans une seule carte compacte du feed (inspiration : carte « Payment runs »).

## Quoi

- **Core pur** : `src/lib/core/scan/scan-runs-presentation.ts` — `buildScanRunSummaries(records, weekStart, now)` projette les statuts fusionnés (live gagne sur persisté) en items de présentation `{connectorId, name, state, missionsCount, runAt, progress, tone}`. `getWeekStart(now)` définit la borne lundi 00:00 local. Projection pure : aucune transition d'état, aucune écriture.
- **State** : `src/lib/state/scan-runs.svelte.ts` — factory runes dérivant les items des statuts du feed controller (`Date.now()` côté shell uniquement).
- **UI** : `ScanRunsPanel` (organism) + `ScanRunItem` (molecule, props uniquement), intégrés au-dessus du récit opérationnel dans le hero du FeedPage. Icônes/barre segmentée = projection de présentation (modèle : `src/models/scan-runs-week.model.md`).
- **Tests** : unitaires purs sans mocks (états, tri, progression, bornes de semaine, fusion live/persisté).

## Hors périmètre

- Historisation des runs par semaine (un seul run par connecteur est visible — limite documentée dans le modèle).
- Toute mutation de statut, notification ou décision d'état ; le scanner reste seul propriétaire des transitions.
- Interactions (clic, re-scan par item) — lecture seule.
