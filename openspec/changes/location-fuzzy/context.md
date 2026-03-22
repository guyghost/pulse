# Context: Location Fuzzy Matching

## Objective
Améliorer le scoring de localisation pour MissionPulse en gardant la structure simple (string) mais en ajoutant une normalisation intelligente et un fuzzy matching.

## Current State
Actuellement, le scoring de localisation est très basique :
```typescript
return missionLocation.toLowerCase().includes(profileLocation.toLowerCase())
```

**Problèmes identifiés :**
- "Paris" match "Saint-Quentin" (faux positif)
- "Île-de-France" ne match pas "Paris (75)" (faux négatif)
- Pas de gestion des accents, tirets, casse
- Pas de synonymes (Paris/75/IDF)

## Solution Proposée

### 1. Normalisation (`normalizeLocation`)
Nettoyer et standardiser les strings de localisation :
- Enlever accents : `Île-de-France` → `ile de france`
- Enlever codes postaux : `(75)` → ``
- Enlever espaces multiples
- Normaliser casse : lowercase
- Enlever ponctuation inutile

### 2. Fuzzy Matching (`matchLocation`)
Algorithme de matching intelligent :
- **Token matching** : Découper en mots et chercher correspondances
- **Synonymes régionaux** : Paris ↔ 75 ↔ Île-de-France
- **Distance d'édition** : Tolérance aux fautes de frappe (Levhenstein légère)
- **Détection de sous-chaînes** : "Paris" dans "Paris, France"

### 3. Scoring Amélioré (`scoreLocation`)
```typescript
const normalizedMission = normalizeLocation(missionLocation);
const normalizedProfile = normalizeLocation(profileLocation);

if (matchLocation(normalizedMission, normalizedProfile)) {
  return weight; // Full match
}

// Partial match avec synonymes
if (areSynonyms(normalizedMission, normalizedProfile)) {
  return weight * 0.8; // 80% pour synonymes régionaux
}

return 0;
```

## Technical Decisions
| Decision | Justification |
|----------|---------------|
| Garder string | Pas de breaking change dans Mission type |
| Pure functions | Testable sans mocks, FC&IS compliant |
| Synonymes en dur | Pas besoin d'API externe, fonctionne offline |
| Normalisation sans lib | Réduire dépendances, code simple |

## Files to Create/Modify
| File | Action | Description |
|------|--------|-------------|
| `src/lib/core/scoring/location-matching.ts` | Create | Normalization + fuzzy matching functions |
| `src/lib/core/scoring/relevance.ts` | Update | Use new location scoring |
| `tests/unit/scoring/location-matching.test.ts` | Create | Unit tests for matching logic |

## Constraints
- **No external dependencies** : tout en vanilla TypeScript
- **Offline first** : doit fonctionner sans connexion
- **Pure functions** : pas de side effects, pas d'I/O
- **Backward compatible** : garder `location: string | null`

## Expected Behavior

| Mission Location | Profile Location | Score | Raison |
|------------------|------------------|-------|--------|
| "Paris (75)" | "Paris" | 100% | Match exact normalisé |
| "Paris" | "75" | 80% | Synonyme régional |
| "Lyon (69)" | "Paris" | 0% | Pas de match |
| "Paris, France" | "Paris" | 100% | Sous-chaîne |
| "Île-de-France" | "Paris" | 80% | Synonyme région |
| "Saint-Quentin (78)" | "Paris" | 0% | Pas de match (évite faux positif) |
| "Télétravail" | "Remote" | 100% | Synonyme remote |

## Inter-Agent Notes
[@orchestrator → @codegen] Implémenter location-matching.ts avec normalizeLocation() et matchLocation(). Mettre à jour relevance.ts. Créer tests unitaires. Garder code simple et performant.

## Implementation Summary

### Files Created/Modified
| File | Action | Description |
|------|--------|-------------|
| `src/lib/core/scoring/location-matching.ts` | Created | Normalization + fuzzy matching functions |
| `src/lib/core/scoring/relevance.ts` | Modified | Updated scoreLocation to use new matching |
| `tests/unit/scoring/location-matching.test.ts` | Created | 56 unit tests covering all scenarios |

### Key Design Decisions

1. **Two-stage normalization**:
   - `normalizeLight()`: Preserves department codes for synonym matching
   - `normalizeLocation()`: Full normalization for exact/substring matching

2. **Match priority order**:
   - Exact match (identical after light normalization)
   - Substring match (one contains the other)
   - Regional synonym (via SYNONYM_CACHE)
   - Token-based synonym match
   - Partial match (token-based)
   - No match

3. **Synonym coverage**:
   - Major French cities: Paris, Lyon, Marseille, Bordeaux, Toulouse, Nantes, Lille, Nice, Strasbourg
   - Department codes: 75, 69, 13, 33, 31, 44, 59, 06, 67
   - Regional names: Île-de-France/IDF, Rhône, Bouches-du-Rhône, Gironde, etc.
   - Remote synonyms: remote, télétravail, distanciel, home office, à distance

4. **Scoring multipliers** (in relevance.ts):
   - `exact`: 100% weight
   - `synonym`: 80% weight
   - `partial`: 60% weight
   - `none`: 0%

### Test Coverage
- 56 tests covering: accents, postal codes, whitespace, edge cases, exact matches, regional synonyms, remote synonyms, false positives, real-world scenarios
- All 133 scoring tests pass (including existing relevance, dedup, semantic, etc.)
