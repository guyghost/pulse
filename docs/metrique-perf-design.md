# Contrat de métrique — série `pulse-perf-design`

> Référence du contrat déclaré dans `.dao/improvement.json` (section `metric`,
> name `pulse-perf-design-v1`). Ce document est la définition stable vers
> laquelle pointe le champ `evidence` : les prompts des workers capteurs
> intègrent la commande verbatim, ce document explique le pourquoi.

## Portée

Série d'amélioration continue `pulse-perf-design`, scope `performance-design`,
sur le package `@pulse/extension`. Deux axes mesurés en échantillons appariés
à chaque cycle :

| Axe    | Métrique                                | Direction      | Baseline (2026-09-13, HEAD `70d89d6`) |
| ------ | --------------------------------------- | -------------- | ------------------------------------- |
| PERF   | Poids total du build de l'extension     | plus bas mieux | 1 463 832 octets                      |
| DESIGN | Littéraux de couleur hors design tokens | plus bas mieux | 101 (29 hex + 72 rgba)                |

## PERF — poids du bundle

Taille sur disque, en octets, de tous les fichiers émis par le build de
production de l'extension (`pnpm --filter @pulse/extension build`), hors
sourcemaps `*.map`. Commande exacte, exécutée depuis la racine du dépôt :

```sh
find apps/extension/dist -type f ! -name '*.map' -print0 \
  | xargs -0 stat -f%z | awk '{s+=$1} END {print s}'
```

Rationale : le poids du bundle conditionne le temps d'installation et
d'injection de l'extension (Chrome Web Store, service worker MV3). C'est un
proxy déterministe de la performance perçue, samplable sans environnement
exotique.

## DESIGN — conformité aux tokens

Nombre de littéraux de couleur codés en dur dans `apps/extension/src` en
dehors du fichier de tokens `src/ui/design-tokens.css`. Somme de deux comptages :

```sh
grep -rEo '#[0-9a-fA-F]{6}\b' apps/extension/src \
  --include='*.svelte' --include='*.ts' --include='*.css' \
  | grep -v 'design-tokens.css' | wc -l

grep -rEo 'rgba?\(' apps/extension/src \
  --include='*.svelte' --include='*.css' \
  | grep -v 'design-tokens.css' | wc -l
```

Rationale : la source de vérité du design system est `packages/design`
(`tokens.json`, `theme.css`), reprise dans `src/ui/design-tokens.css`. Tout
littéral de couleur en dehors de ce fichier contourne le thème (risque de
divergence visuelle, empêche les changements de thème centralisés). Les
valeurs arbitraires Tailwind (`bg-[#…]`) sont déjà à zéro ; l'axe restant est
l'hex/rgba brut dans les composants.

## Règles d'échantillonnage

- Les deux mesures sont **appariées** : même worker, même checkout (worktree
  de la série), mêmes commandes — sinon les échantillons ne sont pas
  comparables entre workers et cycles (issue #142 du swarm-dao).
- Les workers doivent reporter les deux nombres bruts et les commandes
  utilisées, verbatim, dans leur preuve.
- Toute amélioration PERF ne doit pas dégrader DESIGN, et inversement :
  l'arbitrage examine les deux axes ensemble.

## Évolution du contrat

Toute modification de la définition (nouvelles commandes, périmètre)
constitue un nouveau contrat : incrémenter le suffixe (`-v2`, …) pour ne pas
comparer des échantillons mesurés sous des définitions différentes.
