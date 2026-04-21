<!-- markdownlint-disable MD022 MD051 -->

# 2.0.2

## 04/21/2026

1. [](#new)
   * Templates PDF configurables depuis l'administration : `template_client_pdf` (fiche vierge client) et `template_seance_pdf` (fiche séance, avec fallback sur le template client puis sur le PDF intégré).
   * Nouveaux endpoints `{route_app_base}/client-template.pdf` et `{route_app_base}/seance-template.pdf` avec chaîne de fallback. Rétrocompatibilité de `/bilan-template.pdf` maintenue.
   * Bouton **+ Fiche séance** dans l'onglet Bilan : fusionne le template séance à la fin du bilan Drive existant via `pdf-lib` (chargé à la demande depuis CDN), puis re-uploade le fichier sur Drive.

2. [](#improved)
   * Onglet Bilan : suppression de la section « Évolution énergétique » (redondante avec l'onglet Séances).
   * Barre de statut : rendue scrollable horizontalement (`overflow-x-auto`, scrollbar masquée) pour les fenêtres étroites ; tous les éléments sont `shrink-0` pour éviter le tronquage.

# 2.0.1

## 04/20/2026

1. [](#new)
   * Ajout de routes configurables pour respecter davantage la philosophie Grav : `route_app_base` (page) et `route_api_base` (API).
   * Support des routes dynamiques dans la résolution des endpoints API et des assets front du template Cabinet.

2. [](#improved)
   * Documentation README mise à jour pour les routes configurables (configuration, setup, API REST, scripts Termux).
   * Exemples API généralisés en `{route_api_base}` et route PDF en `{route_app_base}` pour éviter le couplage à `/cabinet`.

# 2.0.0

## 04/20/2026

1. [](#new)
   * Publication initiale du plugin Cabinet pour Grav.
   * Ajout de la gestion des clients, rendez-vous, communications et facturation via Flex Objects.
   * Ajout de l'interface Cabinet en SPA Alpine.js avec agenda, fiche client et module communication.
   * Ajout des intégrations Google Calendar, Google Drive et synchronisation Resalib.
   * Ajout de l'API REST sécurisée et des rappels SMS via scheduler Grav.

2. [](#improved)
   * Documentation complète d'installation, configuration et utilisation du plugin.
   * Métadonnées de publication GPM ajoutées dans blueprints.yaml.
