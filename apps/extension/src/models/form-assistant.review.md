# Form Assistant — Review du modèle

Revue de `apps/extension/src/models/form-assistant.model.md` selon la boucle
Model → **Review** → Implement → Verify. Critères : couverture des cas
nominaux, erreurs, annulations, retries, permissions, états terminaux ; aucune
transition implicite ou pilotée par du texte libre ; aucun LLM ne décide une
transition.

## Matrice de couverture

| Axe             | Couvert ? | Détail                                                                                                                                                                          |
| --------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nominal local   | ✅        | FOCUS → REQUEST → `engine=local` → done → ACCEPT → APPLIED (Machine A + B).                                                                                                     |
| Nominal distant | ✅        | FOCUS → REQUEST → consent → GRANT → entitlement OK → done → ACCEPT → APPLIED.                                                                                                   |
| Erreur locale   | ✅        | `generating-local ERR` → `failed(local-error)` → toast typé ; widget → `armed`. Pas de retry aveugle (cohérent `semantic-scorer` : retries bornés dans l'adapter, pas machine). |
| Erreur distante | ✅        | `generating-remote ERR` → `failed(remote-error)` ; pas de retry auto ; pas de job persistant ouvert.                                                                            |
| Annulation      | ✅        | `requesting CANCEL` / fermeture widget / blur → `armed` ; requête SW via `AbortSignal` annulable.                                                                               |
| Retry           | ✅        | Borné dans l'adapter local (cf. `mission-generator.ts`), pas dans la machine. Machine reste déterministe.                                                                       |
| Permissions     | ✅        | Portée = connecteurs inclus opt-in ; aucune permission large. Eve cookieless, `credentials:'omit'`, pas de `chrome.permissions` nouvelle.                                       |
| Consentement    | ✅        | Machine C : `unknown/prompting/granted/denied`, session-scoped, révocable. Refus → `fallback-local` (Eve jamais appelé en silence).                                             |
| Terminaux       | ✅        | `done`, `failed` (B) ; `idle`, `filled`, `disabled` (A). Aucun job Eve ouvert.                                                                                                  |

## Vérification « le LLM ne décide pas »

- ❌ Aucune transition Machine A/B/C n'est émise depuis une sortie LLM. Le LLM
  ne produit qu'un **texte proposé** (`parseFieldProposal`).
- ✅ `ACCEPT` (utilisateur) est l'unique transition vers `applying`.
- ✅ `selectFormAssistEngine` est **pure** (table de vérité), pas LLM.
- ✅ `classifyField`/`sanitizeFieldDescriptor` sont **pures**.
- Conclusion : conforme à _« Le LLM produit des signaux ; le modèle décide. »_

## Vérification Core/Shell

- ✎ Core (`core/form-assistant/*`) : zéro I/O, zéro async, zéro `Date.now()` /
  `Math.random()` / `console`. Tout déterministe, injectable, testable sans
  mocks. ⚠ À respecter à l'implémentation (le prompt builder ne doit pas
  appeler `Date.now()`).
- ✅ Shell (`content/`, `background/`, `shell/copilot/`, `shell/messaging/`) :
  toute l'I/O, async, retries, `chrome.*`. Le content script ne contourne pas
  le SW pour atteindre Eve.
- ✅ Règle d'import respectée : core n'importe jamais shell.

## Risques résiduels & mitigations

1. **Disponibilité Gemini Nano** : si `availability === 'no'` et `engine=local`
   → `failed(unavailable)` ; le widget affiche un message clair (pas d'Eve
   silencieux). Mitigation : toast + lien réglages.
2. **Endpoint field-fill non déployé** : rollout fermé par défaut
   (`VITE_COPILOT_ROLLOUT_ENABLED`). Tant que non déployé, `entitlement` ne
   peut être `active` pour ce flux → `fallback-local` ou `failed`. Le chemin
   local est livrable **indépendamment et en premier**.
3. **Injection framework-controlled** : `applying` doit utiliser le setter natif
   - événement `input` (React/Vue/Svelte). À valider par test E2E sur au moins
     un connecteur.
4. **Shadow DOM vs styles hérités** : le widget est en Shadow DOM fermé ;
   couleurs via variables CSS propres (pas de `tailwind.config.js`).
5. **Consentement session vs persistence** : `granted` est volontairement
   non persistant au-delà de la session (privacy). Documenté dans le modèle.

## Recommandation

Modèle **approuvé pour implémentation par étapes** :

1. **Phase 1 (local, autonome)** : core pur + tests ; content script widget ;
   Machine A ; Machine B chemin local uniquement ; bridge messages ;
   `content_scripts.matches` dérivés du catalogue opt-in. Aucun backend requis.
2. **Phase 2 (Eve, après backend)** : Machine C consentement ; chemin
   `generating-remote` + `fallback-local` ; endpoint field-fill.

Phase 1 est livrable et utile immédiatement (Gemini Nano gratuit). Phase 2
dépend du déploiement Vercel.

## À confirmer avant implémentation

- Connecteurs opt-in pour la v1 (tous ? un sous-ensemble pilote ex: Free-Work ?).
- Libellés UX FR du widget et des toasts.
- Préférence moteur par défaut (`local`).
