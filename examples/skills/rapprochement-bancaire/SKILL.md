---
name: rapprochement-bancaire
description: Aide au rapprochement bancaire mensuel entre le relevé de banque et le grand livre comptable, avec la liste des écarts à justifier.
tags: [comptabilité, audit]
license: MIT
---

# Rapprochement bancaire

Utilisez ce Skill lorsque l'utilisateur fournit un relevé bancaire et un extrait du compte 512 (ou équivalent) pour la même période.

## Étapes

1. Vérifier que les deux documents couvrent la même période et la même devise.
2. Associer les opérations par montant, date et libellé. Une différence de date de quelques jours est acceptée.
3. Lister les opérations présentes en banque mais absentes en comptabilité.
4. Lister les écritures comptables absentes du relevé (chèques non encaissés, virements en transit).
5. Calculer le solde rapproché et l'écart restant.
6. Ne jamais proposer d'écriture de régularisation sans la présenter comme une suggestion à valider.

## Sortie

Un tableau des écarts (date, libellé, montant, origine, explication proposée) et le solde rapproché.
