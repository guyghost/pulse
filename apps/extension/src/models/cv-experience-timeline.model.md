# CV Experience Timeline — Model

> Source de vérité pour le groupement chronologique des expériences du CV
> (page « CV », `ExperienceFeed`). Proposition Mobbin Peerlist : timeline
> verticale groupée par année avec en-têtes sticky.

## Contexte

`ExperienceFeed` rend aujourd'hui une liste plate triée récent → ancien. Au-delà
de ~8 expériences, la lecture chronologique se perd. Les profils de référence
(Peerlist) groupent par année avec un rail vertical + en-têtes d'année collants.

## Fonction pure de groupement

```ts
// core/cv/group-experiences.ts — pur
interface ExperienceYearGroup {
  year: number
  experiences: Experience[]   // ordre récent → ancien préservé
}

groupExperiencesByYear(experiences: Experience[]): ExperienceYearGroup[]
```

- Clé de groupement : `experience.startDate` (année). Une expérience sans date
  de début tombe dans le groupe `0`, rendu en dernier sous le libellé « Sans
  date ».
- Ordre des groupes : **année décroissante** (récent en tête), le groupe `0`
  (« Sans date ») en fin de liste.
- Ordre intra-groupe : l'ordre d'entrée (déjà récent → ancien) est préservé
  tel quel — pas de re-tri.

## Rendu (projection pure)

- Rail vertical continu à gauche (1px) + point par expérience.
- En-tête d'année : `text-micro` uppercase collant en haut du conteneur
  scrollable (`sticky top-0`) pendant le défilement du groupe.
- La carte `ExperienceCard` existante est réutilisée sans modification.

## Invariants

1. Le groupement est déterministe : mêmes entrées → mêmes groupes, même ordre.
2. Aucune expérience n'est perdue ni dupliquée : `Σ groupe.experiences =
experiences.length`.
3. Le tri récent → ancien global reste garanti par l'entrée ; le groupement ne
   réordonne jamais.
4. État vide inchangé (déjà livré) : `experiences.length === 0` → empty state
   existant, aucun groupe `0` parasite.
