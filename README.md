# Cabinet — Plugin Grav

Plugin de gestion de cabinet pour praticiens (shiatsu, sophrologie, etc.), construit sur [Grav CMS](https://getgrav.org). Il centralise les dossiers clients, les rendez-vous, les communications, les bilans PDF et les rappels SMS dans une interface Alpine.js mobile-first accessible depuis n'importe quel appareil.

---

## Sommaire

1. [Fonctionnalités](#fonctionnalités)
2. [Prérequis](#prérequis)
3. [Installation](#installation)
4. [Configuration](#configuration)
5. [Mise en place d'une page Cabinet](#mise-en-place-dune-page-cabinet)
6. [Fonctionnement de l'interface](#fonctionnement-de-linterface)
7. [Module Communication](#module-communication)
8. [Intégration Google (OAuth, Drive, Agenda)](#intégration-google)
9. [SMS — Multi-provider](#sms--multi-provider)
10. [MacroDroid — File d'attente SMS (gratuit)](#macrodroid--file-dattente-sms-gratuit)
11. [Synchronisation Resalib (Google Apps Script)](#synchronisation-resalib)
12. [API REST](#api-rest)
13. [Scheduler Grav — Rappels automatiques](#scheduler-grav)
14. [Structure des fichiers](#structure-des-fichiers)
15. [Logs et débogage](#logs-et-débogage)

---

## Fonctionnalités

| Module | Description |
|--------|-------------|
| **Clients** | Dossiers clients stockés via Flex Objects (prénom, nom, DDN, téléphone, email, motif, antécédents, notes) |
| **Rendez-vous** | CRUD complet des séances (date, heure, durée, type, statut, observations, exercices) |
| **Agenda** | Vue calendrier mensuelle avec mini-calendrier + liste, synchronisation Google Calendar |
| **Communication** | Module dédié : historique des échanges SMS/email, envoi et suggestions de templates par client |
| **Bilan PDF** | Visualisation et upload des bilans Boox (NoteAir) depuis Google Drive |
| **Facturation** | Récapitulatif des séances réalisées par client |
| **SMS** | Envoi direct du SMS de préparation via fournisseur configurable (SMSMobileAPI, Simple SMS Gateway ou **MacroDroid**) + fallback local confirmé + rappels automatiques J-1 |
| **Resalib Sync** | Script Google Apps Script pour synchroniser les RDV Resalib → Cabinet |
| **API REST** | Endpoints JSON sécurisés (session Grav ou clé API) pour intégration avec Make.com ou scripts tiers |
| **Menu Admin** | Entrée « Cabinet » dans la navigation Grav Admin (accès rapide `fa-briefcase`) |

---

## Prérequis

- **Grav** ≥ 1.7.0
- Plugin **Login** (authentification Grav)
- Plugin **Flex Objects** (stockage des données)
- PHP ≥ 7.4
- Accès HTTPS recommandé (requis pour Google OAuth, Service Worker PWA et Clipboard API)

---

## Installation

1. Copier le dossier `cabinet` dans `user/plugins/cabinet/`.

2. Vider le cache Grav :

   ```bash
   php bin/grav cache --purge
   # ou
   rm -rf cache/*
   ```

3. Activer le plugin dans l'administration Grav :
   **Plugins → Cabinet → Activer**

   Ou directement dans `user/plugins/cabinet/cabinet.yaml` :

   ```yaml
   enabled: true
   ```

---

## Configuration

Tous les paramètres sont configurables depuis l'administration Grav (**Plugins → Cabinet**) ou directement dans `user/plugins/cabinet/cabinet.yaml`.

```yaml
enabled: true

# Clé secrète pour l'accès API externe (Make, scripts, etc.)
# Générer une clé longue et aléatoire avant déploiement
api_key: 'CHANGE_ME_BEFORE_DEPLOY'

# Origine CORS (* = toutes origines, ou URL précise)
allowed_origin: '*'

# Google OAuth 2.0
google_oauth_client_id: ''      # ex: xxxx.apps.googleusercontent.com
google_calendar_id: ''          # ex: xxxx@group.calendar.google.com
drive_bilan_path: 'onyx/NoteAir5c/Cahiers/clients'

# SMS — Multi-provider
sms_enabled: false
sms_api_key: ''
sms_provider: 'smsmobileapi'
sms_simple_gateway_url: ''
sms_simple_gateway_token: ''
sms_http_gateway_url: ''
sms_http_gateway_token: ''
sms_rappel_cron: '0 8 * * *'   # tous les jours à 8h00

# Communication
communication_google_review_url: ''    # ex: https://g.page/r/XXXX/review
communication_template_prep_visite: '' # voir section Communication
communication_template_relance: ''
communication_template_compte_rendu: ''
```

### Paramètres détaillés

| Paramètre | Description |
|-----------|-------------|
| `api_key` | Clé secrète envoyée dans `X-Api-Key`. Changer avant mise en production. |
| `allowed_origin` | En-tête CORS `Access-Control-Allow-Origin`. |
| `google_oauth_client_id` | Client ID OAuth 2.0 Google Cloud Console. |
| `google_calendar_id` | Identifiant du calendrier Google à synchroniser. |
| `drive_bilan_path` | Chemin Drive des bilans PDF. Séparateur `/`, sans slash en début/fin. |
| `sms_enabled` | Active l'envoi automatique des rappels J-1 via le scheduler Grav. |
| `sms_api_key` | Clé API SMSMobileAPI (requise si `sms_provider: smsmobileapi`). |
| `sms_provider` | Fournisseur SMS utilisé : `smsmobileapi`, `simple_sms_gateway` ou `macrodroid`. |
| `sms_simple_gateway_url` | Endpoint HTTP de la passerelle Android (payload JSON `phone` + `message`). |
| `sms_simple_gateway_token` | Token Bearer optionnel pour la passerelle Simple SMS Gateway. |
| `sms_http_gateway_url` | Clé legacy, encore lue en fallback si `sms_simple_gateway_url` est vide. |
| `sms_http_gateway_token` | Clé legacy, encore lue en fallback si `sms_simple_gateway_token` est vide. |
| `sms_rappel_cron` | Expression cron pour l'heure d'envoi des rappels. |
| `communication_google_review_url` | URL fiche Google Business, utilisée dans les templates de compte-rendu. |
| `communication_template_prep_visite` | Template SMS de préparation visite (voir variables ci-dessous). |
| `communication_template_relance` | Template SMS de relance. |
| `communication_template_compte_rendu` | Template email de compte-rendu. |

---

## Mise en place d'une page Cabinet

1. Dans l'administration Grav, créer une nouvelle page.
2. Choisir le template **Cabinet**.
3. Activer l'accès réservé aux membres connectés : **Accès → site → login → Oui**.
4. Définir le slug de la page : `/cabinet`.

L'interface est une SPA Alpine.js chargée dans cette page. L'entrée **Cabinet** apparaît automatiquement dans le menu de l'administration Grav.

---

## Fonctionnement de l'interface

### Sidebar — Clients / Agenda

La sidebar gauche dispose de deux vues :

- **Clients** : liste alphabétique avec compteur de séances, champ de recherche, bouton `+`.
- **Agenda** : mini-calendrier mensuel (pip sur les jours avec séances) + liste des séances du mois, navigation mois par mois.

Un clic sur une entrée de l'agenda ouvre directement la fiche du client concerné.

### Fiche client (onglet Fiche)

Stats en haut de fiche (4 cards) :

| Card | Contenu |
|------|---------|
| 📋 Séances | Nombre total |
| 🕐 Dernière séance | Date formatée (ex : `3 avr.`) |
| 📅 Prochaine séance | Prochaine séance **future** — date + heure (ex : `jeu. 24 avr. · 10:00`), mise en évidence en couleur |
| 🗂️ Dossier créé | Date de création du dossier |

Formulaire :
- Identité : prénom, nom, date de naissance, téléphone, email.
- Motif de consultation, antécédents, notes internes.
- **Lien Grav** : lie le client à un contact Grav (recherche par email ou nom).
- **SMS préparation visite** : envoi depuis l'onglet **Communication** avec message généré à partir du template admin.

### Séances (onglet Séances)

- Liste des séances dans l'ordre chronologique inverse.
- Bouton **Nouvelle séance** → modal de création.
- Chaque séance : date, heure, durée, type, statut, motif, observations, exercices, prochaine séance, bilan énergétique MTC.
- Option **Désactiver le rappel SMS J-1** par séance.
- Synchronisation Google Calendar : création/mise à jour de l'événement dans l'agenda configuré.

### Bilan (onglet Bilan)

- Affiche le PDF du bilan Boox stocké sur Google Drive.
- Si absent, bouton **Envoyer la fiche vierge sur Drive**.

### Communication (onglet Communication)

Voir [section dédiée](#module-communication).

---

## Module Communication

L'onglet **Communication** de chaque fiche client offre un historique complet des échanges et des outils d'envoi.

### Fonctionnalités

- **Historique** des communications (SMS et email) par client, persisté côté serveur dans une collection Flex Objects dédiée (`communications`).
- **Filtres** : Tous / SMS / Email.
- **Rédaction** : zone de texte + objet (email), sélection du canal, date de suivi optionnelle.
- **Suggestions de templates** :

| Template | Canal | Description |
|----------|-------|-------------|
| Préparation visite | SMS | Message personnalisé avec lien de préparation |
| Relance | SMS | Message de relance après une séance |
| Compte-rendu | Email | Résumé de séance avec invitation avis Google |

- **Envoi SMS** via le fournisseur configuré (SMSMobileAPI ou Simple SMS Gateway).
- **Copie** du message dans le presse-papier.

### Nouveau flux SMS de préparation (2026)

- Envoi prioritaire via l'endpoint API `POST /api/cabinet/sms/send-preparation`.
- Message construit uniquement depuis `communication_template_prep_visite` (plus de message par défaut codé en dur).
- Routage serveur selon `sms_provider` (`smsmobileapi` ou `simple_sms_gateway`).
- Si l'envoi API échoue (ou est désactivé), l'interface propose explicitement d'ouvrir l'app SMS locale.
- En cas de refus utilisateur, l'action est enregistrée avec le statut `cancelled`.

### Templates admin configurables

Les templates sont configurables dans **Plugins → Cabinet → Communication**.

#### Variables disponibles

| Variable | Description |
|----------|-------------|
| `{{first_name}}` | Prénom du client |
| `{{session_slot}}` | Créneau formaté en français — ex : ` de lundi 28 avril à 10:00` (vide si aucune séance future) |
| `{{preparation_link}}` | URL `preparons-votre-visite/id:xxx` personnalisée par client |
| `{{duration}}` | Durée formatée — ex : `1h15` |
| `{{session_date}}` | Date ISO de la dernière séance |
| `{{session_date_label}}` | Libellé de date — ex : ` du 28 avril 2025` |
| `{{google_review_url}}` | URL fiche Google Business (configurée dans les paramètres) |

#### Template par défaut — Préparation visite

```
Bonjour {{first_name}},

Afin de préparer notre première séance{{session_slot}}.
Je vous partage ce lien : {{preparation_link}}

📍 60 chemin du Val Fleuri 🔐 Code portillon : 2507A 🏢 Bât B6 appt 08, 3ème étage, porte de gauche (à droite de la piscine)
⏱️ Durée : {{duration}} - Tarif : 75€ 👕 Tenue : vêtements souples, chaussettes propres

À bientôt, Nicolas
Le shiatsu est une approche d'accompagnement au bien-être qui ne se substitue pas à un traitement médical.
```

### Architecture technique — objet Communication

Les communications sont stockées dans une collection Flex Objects **dédiée** (`user/data/flex-objects/communications.json`), indépendante de l'objet client. Ce choix permet :

- l'historique multi-appareil sans duplication dans le dossier client ;
- la suppression propre à la suppression d'un client ;
- une évolution future vers des communications multi-clients.

La classe `classes/Communication.php` gère l'intégralité de cette logique (lecture, écriture, suppression).

---

## Intégration Google

### Créer un Client OAuth 2.0

1. [Google Cloud Console](https://console.cloud.google.com/) → projet → activer **Drive API** + **Calendar API**.
2. **APIs & Services → Identifiants → Créer → ID client OAuth 2.0** (type : Application Web).
3. Ajouter l'URL du site dans **Origines JavaScript autorisées**.
4. Copier le **Client ID** dans la configuration (`google_oauth_client_id`).

### Flux d'authentification

Utilise **Google Identity Services (GIS)** en flux implicite côté client. Le token d'accès est stocké en `sessionStorage` avec vérification d'expiration et ré-authentification silencieuse automatique.

Scopes demandés :
- `drive.file` — lecture/écriture des fichiers créés par l'app
- `drive.readonly` — lecture des bilans Boox
- `documents` — création de docs Google Docs (anamnèse, bilan)
- `calendar.events` — lecture/écriture des événements Calendar

### Structure des bilans sur Google Drive

Le paramètre `drive_bilan_path` définit le dossier racine. Chaque client doit avoir un sous-dossier nommé **Prénom NOM** :

```
Mon Drive/
└── onyx/NoteAir5c/Cahiers/clients/
    ├── Anne DUPONT/
    │   └── bilan-2025-03.pdf
    └── Jean MARTIN/
        └── bilan.pdf
```

### Tablette Boox Note Air 5C

1. Lier Google Drive dans la bibliothèque Boox : *Paramètres → Comptes → Stockage cloud → Google Drive*.
2. Depuis l'onglet **Bilan**, cliquer **Envoyer la fiche vierge sur Drive** (si aucun bilan).
3. Sur la tablette, ouvrir le PDF, annoter avec le stylet.
4. À la fermeture, la tablette synchronise automatiquement vers Drive.
5. Rafraîchir l'onglet Bilan dans Cabinet.

### Google Calendar

Renseigner `google_calendar_id` (visible dans les paramètres du calendrier → *Adresse de l'agenda*).

---

## SMS — Multi-provider

### Fournisseurs supportés

| Provider | Description | Coût |
|----------|-------------|------|
| `smsmobileapi` | API cloud SMSMobileAPI (requiert `sms_api_key`) | Payant |
| `simple_sms_gateway` | Endpoint HTTP d'un téléphone Android proxy (requiert `sms_simple_gateway_url`) | Gratuit |
| `macrodroid` | File d'attente polled par MacroDroid sur Android — **aucune app tierce, aucun compte** | Gratuit |

### Configuration du provider

Exemple MacroDroid :

```yaml
sms_enabled: true
sms_provider: 'macrodroid'
api_key: 'votre-cle-api'   # utilisée comme Bearer token dans MacroDroid
```

Voir la [section MacroDroid](#macrodroid--file-dattente-sms-gratuit) pour la configuration complète du macro.

Exemple SMSMobileAPI :

```yaml
sms_enabled: true
sms_provider: 'smsmobileapi'
sms_api_key: 'votre-cle-api'
```

Exemple Simple SMS Gateway :

```yaml
sms_enabled: true
sms_provider: 'simple_sms_gateway'
sms_simple_gateway_url: 'https://votre-passerelle.example/send-sms'
sms_simple_gateway_token: 'token-optionnel'
```

### Compte SMSMobileAPI (si provider = SMSMobileAPI)

1. Créer un compte sur [app.smsmobileapi.com](https://app.smsmobileapi.com).
2. Installer l'app Android sur un smartphone connecté en permanence.
3. Copier la clé API dans `sms_api_key`.

### Envoi manuel

Depuis l'onglet **Communication** :
- Le template de préparation est pré-rempli avec les données du client et de sa prochaine séance.
- L'envoi tente d'abord le provider configuré côté serveur, puis propose un fallback local (application SMS) avec confirmation utilisateur.
- Bouton *Copier* disponible pour le presse-papier.

Le numéro est normalisé automatiquement : `06XXXXXXXX` → `+336XXXXXXXX`.

### Rappels automatiques J-1

Quand `sms_enabled: true`, le scheduler Grav envoie un rappel SMS la veille de chaque rendez-vous non annulé.

> Pour personnaliser le message de rappel, modifier `buildRappelMessage()` dans `classes/Sms.php`.

### Désactiver le rappel pour une séance

Dans le formulaire de séance, cocher **Désactiver le rappel SMS J-1**.

### Logique anti-doublon

Le champ `sms_rappel_sent_date` empêche l'envoi de plus d'un rappel par jour et par rendez-vous.

---

## MacroDroid — File d'attente SMS (gratuit)

Avec le provider `macrodroid`, Grav n'envoie pas les SMS directement. Il les écrit dans la file d'attente (`status=prepared`). Un macro MacroDroid sur votre téléphone Android interroge cette file toutes les N minutes et envoie chaque SMS via l'antenne native du téléphone.

**Aucun compte, aucune app tierce, aucun abonnement.**

### Prérequis

- Android avec [MacroDroid](https://play.google.com/store/apps/details?id=com.arlosoft.macrodroid) installé (version gratuite suffisante)
- Votre site Grav accessible en HTTPS depuis le téléphone
- `api_key` renseigné dans `cabinet.yaml`

### Activer le provider

```yaml
sms_enabled: true
sms_provider: 'macrodroid'
```

### Créer le macro MacroDroid — pas à pas

Dans MacroDroid : appuyer sur **+** (bas de l'écran) → **Créer un macro** → donner un nom (ex : *Cabinet SMS*).

---

#### Déclencheur

1. Appuyer sur **DÉCLENCHEURS → +**
2. Choisir **Minuterie → Minuterie périodique**
3. Intervalle : **10 minutes** → OK

---

#### Action 1 — Récupérer la file d'attente SMS

1. **ACTIONS → +**
2. **Connectivité → Requête HTTP**
3. Remplir :
   - **URL** : `https://VOTRE_SITE/api/cabinet/sms/queue`
   - **Méthode** : `GET`
4. Appuyer sur l'onglet **En-têtes** → **+** → ajouter :
   - Clé : `Authorization` / Valeur : `Bearer VOTRE_API_KEY`
   - Clé : `Accept` / Valeur : `application/json`
5. Onglet **Réponse** → cocher **Enregistrer la réponse dans une variable** → nom : `queue_response`
6. OK

---

#### Action 2 — Boucle sur chaque SMS en attente

1. **ACTIONS → +**
2. **Boucle → Pour chaque**
3. Dans **Source** choisir **Tableau JSON**
4. Variable JSON : `{queue_response}` (sélectionner depuis la liste)
5. Chemin JSONPath : `$.items`
6. Variable de boucle : `item`
7. OK

---

#### Action 3 — (dans la boucle) Extraire les champs

1. **ACTIONS → +**
2. **Variables → Définir une variable**
3. Créer la variable `sms_id`
   - Type de valeur : **Expression JSONPath**
   - JSON : `{item}`
   - Chemin : `$.id`
4. Répéter pour `sms_to` (chemin `$.to`) et `sms_message` (chemin `$.message`)

---

#### Action 4 — (dans la boucle) Envoyer le SMS

1. **ACTIONS → +**
2. **Messages → Envoyer un SMS**
3. **Numéro** : `{sms_to}`
4. **Message** : `{sms_message}`
5. OK

---

#### Action 5 — (dans la boucle) Confirmer l'envoi (ack)

1. **ACTIONS → +**
2. **Connectivité → Requête HTTP**
3. Remplir :
   - **URL** : `https://VOTRE_SITE/api/cabinet/sms/queue/{sms_id}/ack`
   - **Méthode** : `POST`
4. Onglet **En-têtes** → **+** :
   - `Authorization` : `Bearer VOTRE_API_KEY`
   - `Content-Type` : `application/json`
5. Onglet **Corps** → `{}`
6. OK

---

#### Action 6 — Fin de boucle

1. **ACTIONS → +**
2. **Boucle → Fin de boucle**

---

#### Action 7 — Notification (optionnel)

1. **ACTIONS → +**
2. **Notifications → Créer une notification**
3. **Titre** : `SMS Cabinet`
4. **Texte** : `SMS envoyés ✓`
5. OK

---

### Remplacer les variables

| Placeholder | Valeur |
|-------------|--------|
| `VOTRE_SITE` | URL de votre site Grav, ex : `https://monsite.com` |
| `VOTRE_API_KEY` | Valeur de `api_key` dans `cabinet.yaml` |

### Flux complet

```
Grav (provider=macrodroid)
  → écrit status=prepared dans communications Flex

MacroDroid (toutes les 10 min)
  → GET /api/cabinet/sms/queue          (récupère les SMS préparés)
  → Envoie chaque SMS via antenne Android
  → POST /api/cabinet/sms/queue/{id}/ack (marque status=sent)
```

### Retrouver les SMS envoyés

Dans l'onglet **Communication** de chaque client, les SMS passent automatiquement de `prepared` → `sent` après l'ack MacroDroid. Le champ `sent_at` contient l'horodatage exact.

---

## Synchronisation Resalib

Le fichier `assets/resalib-sync.gs` est un **Google Apps Script** qui synchronise les événements Resalib → Cabinet via l'API REST.

### Installation

1. [script.google.com](https://script.google.com) → Nouveau projet → coller `resalib-sync.gs`.
2. Services → ajouter **Google Calendar API**.
3. Configurer la section `CONFIG` :

```javascript
const CONFIG = {
  CALENDAR_ID:      'xxxx@group.calendar.google.com',
  CABINET_BASE_URL: 'https://monsite.com',
  CABINET_API_KEY:  'votre-cle-api',
};
```

4. Déployer → Application web → Accès : Tout le monde.
5. Exécuter **`setupAll()`** une seule fois.

### Fonctions utiles

| Fonction | Description |
|----------|-------------|
| `setupAll()` | Installation initiale |
| `refreshCalendar()` | Sync complète forcée |
| `inspectEventMap()` | Correspondance eventId → flex_id |
| `addClientMapping('Prénom NOM', 'uuid')` | Mapping manuel |
| `resetAll()` | Remet tout à zéro |

---

## API REST

Authentification : **session Grav** ou en-tête `X-Api-Key`.

### Routes

| Méthode | Route | Description |
|---------|-------|-------------|
| `GET` | `/api/cabinet/data` | Données complètes (clients, séances, communications, config) |
| `GET` | `/api/cabinet/facturation` | Récapitulatif de facturation |
| `POST` | `/api/cabinet/clients` | Créer un client |
| `PUT` | `/api/cabinet/clients/{id}` | Modifier un client |
| `DELETE` | `/api/cabinet/clients/{id}` | Supprimer un client (+ communications associées) |
| `GET` | `/api/cabinet/rendezvous` | Lister tous les rendez-vous |
| `POST` | `/api/cabinet/rendezvous` | Créer un rendez-vous |
| `PUT` | `/api/cabinet/rendezvous/{flex_id}` | Modifier un rendez-vous |
| `DELETE` | `/api/cabinet/rendezvous/{flex_id}` | Supprimer un rendez-vous |
| `GET` | `/api/cabinet/communications/{client_id}` | Lister les communications d'un client |
| `PUT` | `/api/cabinet/communications/{client_id}` | Mettre à jour les communications d'un client |
| `POST` | `/api/cabinet/sms/send-preparation` | Envoyer le SMS de préparation via le provider SMS configuré (template admin + `client_id`) |
| `POST` | `/api/cabinet/sms/preparation` | Préparer/valider un brouillon de SMS de préparation (template admin) |
| `POST` | `/api/cabinet/sms/rappels` | Déclencher manuellement les rappels J-1 |
| `GET` | `/api/cabinet/sms/queue` | Lister les SMS en attente (`status=prepared`, `channel=sms`) — utilisé par MacroDroid |
| `POST` | `/api/cabinet/sms/queue/{id}/ack` | Marquer un SMS comme envoyé (`status=sent`) — appelé par MacroDroid après envoi |
| `GET` | `/api/contacts/search` | Rechercher un client par nom/email |
| `GET` | `/cabinet/bilan-template.pdf` | Télécharger le template PDF |

---

## Scheduler Grav

```bash
# Ajouter au cron serveur
* * * * * cd /chemin/vers/grav && php bin/grav scheduler 1>> /dev/null 2>&1
```

Vérifier dans **Outils → Scheduler**. Le job `cabinet-sms-rappels` n'est enregistré que si `sms_enabled: true`.

---

## Structure des fichiers

```
user/plugins/cabinet/
├── cabinet.php                       # Classe principale du plugin (DI, hooks, admin menu)
├── cabinet.yaml                      # Configuration par défaut
├── blueprints.yaml                   # Formulaire d'administration Grav
│
├── assets/
│   ├── cabinet.js                    # Logique legacy (Drive, Google Docs, utilitaires)
│   ├── cabinet.css                   # Styles (variables CSS, responsive, stat-cards…)
│   ├── main.js                       # Point d'entrée Alpine.js
│   ├── manifest.json                 # PWA manifest
│   ├── sw.js                         # Service Worker (PWA)
│   ├── cab-drive.js                  # Google Drive + Calendar (Alpine component)
│   ├── Fiche Client - Shiatsu.pdf    # Template PDF bilan vierge
│   ├── resalib-sync.gs               # Google Apps Script (Resalib → Cabinet)
│   ├── components/
│   │   ├── sidebar.js                # Alpine component — sidebar clients/agenda
│   │   ├── modal.js                  # Alpine component — modale générique
│   │   ├── drive-bar.js              # Alpine component — barre Drive
│   │   ├── accordion.js              # Alpine component — accordéon séances
│   │   └── toast.js                  # Alpine component — notifications toast
│   ├── store/
│   │   └── index.js                  # Alpine store global (clients, sessions, communications…)
│   └── utils/
│       ├── api.js                    # Wrapper fetch/API
│       ├── constants.js              # Constantes (méridiens, états MTC…)
│       ├── helpers.js                # uid(), esc(), capitalize(), compactUuid()…
│       ├── sms.js                    # Utilitaires SMS (buildPreparationSms, getPreferredSession…)
│       └── toast.js                  # showToast()
│
├── blueprints/
│   ├── cabinet.yaml                  # Blueprint de la page Cabinet
│   └── flex-objects/
│       ├── clients.yaml              # Schéma Flex Objects — clients
│       ├── rendez_vous.yaml          # Schéma Flex Objects — rendez-vous
│       └── communications.yaml       # Schéma Flex Objects — communications (objet dédié)
│
├── classes/
│   ├── Core.php                      # Auth, CORS, helpers JSON
│   ├── Api.php                       # Routeur des endpoints REST
│   ├── Clients.php                   # Recherche de contacts Grav
│   ├── Seances.php                   # CRUD clients & rendez-vous, payload de données
│   ├── Communication.php             # Gestion des communications (lecture, écriture, suppression)
│   ├── Facturation.php               # Calcul du récapitulatif de facturation
│   ├── Sms.php                       # Envoi SMS (SMSMobileAPI) + rappels J-1
│   └── Flex/
│       ├── ClientObject.php          # Classe Flex personnalisée — clients
│       └── RendezVousObject.php      # Classe Flex personnalisée — rendez-vous
│
└── templates/
    ├── cabinet.html.twig             # Template principal (assets, layout)
    └── partials/cabinet/
        ├── main.html.twig            # Conteneur Alpine main + onglets
        ├── sidebar.html.twig         # Sidebar clients/agenda
        ├── modals.html.twig          # Modales (nouvelle séance, paramètres, vérif…)
        ├── tab-fiche.html.twig       # Onglet Fiche client (stats, formulaire, SMS)
        ├── tab-seances.html.twig     # Onglet Séances
        ├── tab-bilan.html.twig       # Onglet Bilan Drive
        └── tab-communication.html.twig  # Onglet Communication
```

### Stockage des données

| Collection | Chemin |
|-----------|--------|
| Clients | `user/data/flex-objects/clients/` |
| Rendez-vous | `user/data/flex-objects/rendez_vous/` |
| Communications | `user/data/flex-objects/communications.json` |

---

## Logs et débogage

Les logs sont écrits dans `logs/cabinet.log` (racine Grav).

```
[2025-06-15 08:00:01] [cabinet] SMS send {"to":"+336XXXXXXXX","len":142}
[2025-06-15 08:00:02] [cabinet] SMS response {"status":"success"}
```

Pour désactiver les logs en production, modifier `isDebugEnabled()` dans `classes/Core.php` :

```php
public function isDebugEnabled(): bool
{
    return false;
}
```

---

## Licence

MIT — Nicolas Goubaux — [goubs.net](https://www.goubs.net)
