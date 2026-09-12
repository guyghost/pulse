# Open Source Readiness

[<- Retour](./README.md)

## Statut

MissionPulse est prêt pour un dépôt public avec la base suivante :

- Fichier de licence MIT présent à la racine du dépôt.
- Les métadonnées des packages racine et workspaces déclarent la licence MIT.
- Les fichiers `.env` locaux, clés privées, ZIP d'extension packagés et sorties générées des tests navigateur sont ignorés.
- Les fichiers suivis actuels ont été scannés pour les patterns de secrets courants.
- Les URLs de profils personnels ont été remplacées par des exemples neutres.
- Les fichiers communautaires GitHub vivent dans `.github/`.
- Les artefacts de release sont générés par la CI au lieu d'être commités.

## Checklist mainteneur avant de changer la visibilité du dépôt

- Confirmer les réglages du dépôt GitHub : protection de branche, checks CI requis, security advisories.
- Configurer les secrets optionnels uniquement dans GitHub Actions : `CODECOV_TOKEN`, `CHROME_EXTENSION_ID`, `CHROME_CLIENT_ID`, `CHROME_CLIENT_SECRET`, `CHROME_REFRESH_TOKEN`.
- Réviser les fichiers suivis `audits/` et `openspec/` pour tout contexte produit sensible avant le lancement public.
- Remplacer les coordonnées de contact placeholder dans [privacy-policy.md](./privacy-policy.md).
- Lancer `pnpm ci:check` en local et confirmer que GitHub Actions passe sur une pull request fraîche.

## Commandes d'audit des secrets

```bash
git grep -n -I -i -E "(password[[:space:]]*[:=]|api[_-]?key[[:space:]]*[:=]|secret[[:space:]]*[:=]|token[[:space:]]*[:=])"
git ls-files | rg '(^|/)\\.(env|env\\.)|\\.zip$|\\.pem$|\\.key$|\\.p12$|\\.mobileprovision$'
```

La première commande produit des faux positifs pour les noms de variables d'environnement et les secrets GitHub Actions. Réviser les correspondances avant de les traiter comme des findings.
