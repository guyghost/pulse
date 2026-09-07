# Onboarding Live Preview — Model

> Source de vérité pour l'aperçu temps réel des préférences durant
> l'onboarding (`OnboardingFlow`, étape « preferences »). Proposition Mobbin :
> feedback immédiat — l'utilisateur voit l'effet de ses critères avant de
> valider.

## Contexte

L'étape « preferences » collecte TJM min/max, remote et mots-clés sans montrer
leur effet. À la validation, l'utilisateur découvre le scoring dans le feed.
Les onboarding de référence réduisent l'incertitude avec un aperçu live.

## Projection pure

```ts
// core/scoring — fonction pure existante
scoreMission(referenceMission, draftProfile) → { grade: 'A'..'F', ... }
```

- **Mission de référence** : fixture déterministe embarquée (pas de mission
  réelle, pas d'I/O, pas d'aléatoire) — `REFERENCE_MISSION` constante pure
  représentant une mission « type » du marché (React/Node, hybride, 520 €/j).
- **Profil brouillon** : les champs en cours d'édition dans l'étape
  (`tjmMin`, `tjmMax`, `remote`, `keywords`) projetés en `UserProfile` minimal.
- Sortie : lettre de note **A–F** (modèle `mission-grade` : jamais de score
  brut, jamais de `%`), plus le décompte des critères matchés.

## Rendu

- Carte compacte « Aperçu » sous le formulaire : lettre de grade en médaillon
  (même composant que le feed) + libellé dynamique (« Forte correspondance »,
  « Correspondance partielle », « Hors critères »).
- Recalcul sur chaque frappe (dériver `$derived` — pas d'effet, pas de debounce
  nécessaire : `scoreMission` est synchrone et pure).

## Invariants

1. L'aperçu n'écrit **rien** : aucun message bridge, aucune persistance, aucun
   état wizard modifié. Lecture seule des champs locaux de l'étape.
2. La note respecte strictement le modèle `mission-grade` (lettres A–F).
3. Aucun LLM : le preview est un appel direct à `scoreMission` (core pur).
4. Si tous les champs sont vides → note de la mission de référence avec le
   profil neutre par défaut (comportement défini, jamais masqué).
