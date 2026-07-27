# Scan completion delight — model

> Modèle de présentation pour le moment de **fin de scan**. Calme, précis, fiable.
> Source de vérité pour toute UI qui réagit à la fin d'un scan.

## Statut

Ce modèle est un **projection de présentation pure**. Il ne définit **aucune
nouvelle transition produit**. L'état canonique du scan reste
[`scan-lifecycle.model.md`](./scan-lifecycle.model.md). `buildScanSummary()` ne
fait que projeter ces faits en copie/ton/preuves. **Le modèle décide ; la
présentation reflète.**

Règle courte du projet respectée : _le LLM produit des signaux, le modèle
décide_. Aucune décision de transition ne vit ici.

## Périmètre

Résumé transitoire affiché au moment où un scan se termine avec succès
(`completed`) ou partiellement (`partial`). **Jamais** sur `failed` ou
`cancelled` (le contrôleur ne met `lastScanAt` à jour que sur le chemin de
succès — invariant réutilisé comme déclencheur).

## États de présentation

Trois tons, dérivés uniquement des agrégats existants (aucun I/O) :

| Tone      | Condition (sur succès)                                  | Intention                                              |
| --------- | ------------------------------------------------------- | ------------------------------------------------------ |
| `nominal` | `newCount > 0` OU `highScoreCount > 0`, 0 source cassée | Confirmer, orienter vers les priorités                 |
| `quiet`   | `newCount = 0` ET `highScoreCount = 0`, 0 source cassée | Rassurer : la file est à jour                          |
| `partial` | ≥ 1 source cassée (`brokenConnectorCount > 0`)          | Transparent, pas alarmiste ; la preuve porte la nuance |

**Précédence** : `partial` l'emporte sur `nominal`/`quiet`. Un scan fini avec
des sources en erreur est fini — on ne crie pas, on signale.

## Entrées (pures)

```ts
interface ScanSummaryInput {
  newCount: number; // missions nouvelles depuis dernier scan
  highScoreCount: number; // missions ≥ seuil d'alerte (alertMatchCount)
  brokenConnectorCount: number; // sources en erreur après scan
  alertScoreThreshold: number; // seuil d'alerte (pour le label "Prioritaires N+")
}
```

Toutes les entrées sont **bornées à ≥ 0 et tronquées** (défense en profondeur,
même si les appelants fournissent déjà des valeurs saines).

## Sorties

```ts
interface ScanSummary {
  tone: 'nominal' | 'quiet' | 'partial';
  headline: string;
  caption: string;
  evidence: readonly ScanSummaryEvidence[];
}
interface ScanSummaryEvidence {
  label: string;
  value: number;
  tone: 'accent' | 'success' | 'critical';
}
```

### Matrice de copie (FR, sobre)

| Tone    | headline       | caption                                                                                      | evidence                                                                                            |
| ------- | -------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| nominal | `Scan terminé` | high>0 → `{high} mission(s) prioritaire(s) ({thr}+)`<br>sinon `{new} nouvelle(s) mission(s)` | `Nouvelles = new` (accent) ; `Prioritaires {thr}+ = high` (success, si high>0)                      |
| quiet   | `File à jour`  | `Aucune nouvelle mission depuis le dernier scan.`                                            | _(aucune — minimalisme calme)_                                                                      |
| partial | `Scan terminé` | `{broken} source(s) à vérifier`                                                              | `Nouvelles = new` ; `Prioritaires {thr}+ = high` (si >0) ; `Sources à vérifier = broken` (critical) |

Label `Prioritaires {thr}+` → `Prioritaires` quand `threshold = 0`.

## Déclencheur (edge)

- **Front montant de `controller.lastScanAt`** (monotone, défini uniquement sur
  succès). À chaque changement détecté pendant `!isScanning`, on (re)calcule et
  on révèle.
- **Pas de révélation à l'ouverture** du panneau si un scan est déjà terminé :
  on initialise le seuil précédent à la valeur courante au montage.
- **Annulation / échec** : `lastScanAt` n'est pas mis à jour → pas de front →
  aucun résumé. Couverture naturelle par l'invariant du contrôleur.

## Effets de bord du shell (page)

- Révélation via `{#if}` ; transition `fly`/`fade` (~180ms, quart-out).
- **Auto-dismiss 4,5s** après révélation (timer nettoyé au démontage).
- **Dismissing** : bouton X discret, démarrage du scan suivant, ou timeout.
- **Reduced motion** : `matchMedia('(prefers-reduced-motion: reduce)')` →
  transition instantanée (durée ≈ 0).

## Invariants

1. Le résumé **ne bloque jamais** le feed ; il occupe le même slot que
   `ScanProgress` (mutuellement exclusifs dans le temps).
2. Aucune transition `scan-lifecycle` n'est créée/consommée ici.
3. Aucune I/O dans le résolveur (`buildScanSummary`) : il vit dans `core/`.
4. Jamais de mouvement célébratoire (confetti, rebond, gradient, emoji).
5. La couleur n'est jamais le seul signal : le ton est doublé par la copie +
   les libellés de preuve.
6. `partial` ne crie pas : l'icône d'en-tête reste calme ; la nuance vit dans
   la preuve `critical` (rouge) + le caption.

## Cas de test obligatoires

- nominal avec nouveaux + prioritaires
- nominal avec prioritaires seulement
- quiet (file à jour)
- partial avec nouveaux + sources cassées
- partial silencieux (0 nouveau, sources cassées)
- bornage des entrées négatives / NaN → 0
- libellé `Prioritaires` quand `threshold = 0`
