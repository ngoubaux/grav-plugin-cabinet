/**
 * Resalib → Cabinet  —  Sync Google Apps Script
 * ================================================
 * Synchronise les événements du calendrier Google (Resalib) vers
 * le plugin Cabinet (API REST Grav) via push notifications.
 *
 * Installation
 * ------------
 * 1. Ouvrir https://script.google.com → Nouveau projet
 * 2. Coller ce fichier
 * 3. Activer le service "Google Calendar API" (menu Services → Calendar)
 * 4. Remplir la section CONFIG ci-dessous
 * 5. Déployer comme Application Web :
 *      Déployer → Nouveau déploiement → Type : Application web
 *      Exécuter en tant que : Moi | Accès : Tout le monde
 *      Copier l'URL de déploiement dans CONFIG.WEBHOOK_URL
 * 6. Exécuter setupAll() une seule fois (autorise les permissions)
 *
 * Fonctions utiles à la console
 * ------------------------------
 * setupAll()             — installe les déclencheurs et enregistre le watch
 * refreshCalendar()      — sync complète manuelle (repart de zéro)
 * inspectEventMap()      — affiche la map eventId → flex_id
 * inspectClientMap()     — affiche la map nom → uuid cabinet
 * addClientMapping(n,id) — ajoute manuellement un mapping client
 * resetAll()             — remet tout à zéro
 */

// ═══════════════════════════════════════════════════════════════════════════
// CONFIG — à adapter avant déploiement
// ═══════════════════════════════════════════════════════════════════════════

const CONFIG = {
  /** ID du calendrier Google connecté à Resalib.
   *  Visible dans Paramètres du calendrier → « Adresse de l'agenda » */
  CALENDAR_ID: '88180a270e70804f0b25edc7cc9195c27ecc43204d832082825087a72e0cef21@group.calendar.google.com',

  /** URL publique de ce script déployé en Application Web.
   *  Disponible après "Déployer → Nouveau déploiement".
   *  Format : https://script.google.com/macros/s/XXXX/exec */
  WEBHOOK_URL: 'https://script.google.com/macros/s/REMPLACER/exec',

  /** URL de base du site Grav (sans slash final) */
  CABINET_BASE_URL: 'https://www.goubs.net',

  /** Clé API définie dans user/plugins/cabinet/cabinet.yaml → api_key */
  CABINET_API_KEY: 'f98c4ab1f592ace88df49b040b1946131846683744938a612f82e9869a4d9c5b',

  /** Fenêtre de la sync complète initiale : jours passés */
  SYNC_DAYS_PAST: 7,

  /** Fenêtre de la sync complète initiale : jours futurs */
  SYNC_DAYS_FUTURE: 90,

  /** Type de séance par défaut si non détecté */
  DEFAULT_APPOINTMENT_TYPE: 'shiatsu_futon',

  /** Durée par défaut en minutes */
  DEFAULT_DURATION_MINUTES: 60,

  /**
   * Mapping mots-clés (regex) → appointment_type Cabinet.
   * Testés sur le titre + description de l'événement.
   */
  TYPE_PATTERNS: {
    'chair|assis|chaise':   'shiatsu_chair',
    'sophro|sophrologie':   'sophrologie',
    'futon|shiatsu':        'shiatsu_futon',
  },

  /**
   * Mapping mots-clés (regex) → statut Cabinet.
   * Testés sur le titre de l'événement.
   */
  STATUS_PATTERNS: {
    'annul|cancel':  'cancelled',
    'confirm':       'confirmed',
    'effectu|done':  'completed',
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTES INTERNES
// ═══════════════════════════════════════════════════════════════════════════

const PROPS              = PropertiesService.getScriptProperties();
const KEY_SYNC_TOKEN     = 'resalib_sync_token';
const KEY_EVENT_MAP      = 'resalib_event_map';   // { eventId → { flex_id, client_id } }
const KEY_CLIENT_MAP     = 'resalib_client_map';  // { "prénom nom" → cabinet_uuid }
const KEY_CHANNEL_ID     = 'resalib_channel_id';
const KEY_RESOURCE_ID    = 'resalib_resource_id';
const KEY_CHANNEL_EXP    = 'resalib_channel_exp'; // timestamp ms expiration

// ═══════════════════════════════════════════════════════════════════════════
// POINT D'ENTRÉE : PUSH NOTIFICATION (appelé par Google Calendar)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Google Calendar envoie un POST vide à l'URL de ce script déployé.
 * On fait alors une sync incrémentale.
 */
function doPost(e) { // eslint-disable-line no-unused-vars
  try {
    _log('doPost reçu — sync incrémentale…');
    _incrementalOrFull();
  } catch (err) {
    _log('ERREUR doPost : ' + err.message);
  }
  return ContentService.createTextOutput('OK');
}

// ═══════════════════════════════════════════════════════════════════════════
// SYNC MANUELLE COMPLÈTE (bouton / console)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Efface le token et relance une sync complète sur la fenêtre configurée.
 * À appeler depuis la console Apps Script pour forcer un rafraîchissement.
 */
function refreshCalendar() {
  _log('=== refreshCalendar() : sync complète forcée ===');
  PROPS.deleteProperty(KEY_SYNC_TOKEN);
  _fullSync();
  _log('=== refreshCalendar() terminé ===');
}

// ═══════════════════════════════════════════════════════════════════════════
// LOGIQUE DE SYNC
// ═══════════════════════════════════════════════════════════════════════════

function _incrementalOrFull() {
  const token = PROPS.getProperty(KEY_SYNC_TOKEN);
  if (token) {
    _incrementalSync(token);
  } else {
    _fullSync();
  }
}

function _fullSync() {
  _log('Sync complète…');

  const now   = new Date();
  const start = new Date(now);
  start.setDate(start.getDate() - CONFIG.SYNC_DAYS_PAST);
  const end = new Date(now);
  end.setDate(end.getDate() + CONFIG.SYNC_DAYS_FUTURE);

  let pageToken = null;
  let syncToken = null;

  do {
    const params = {
      timeMin:      start.toISOString(),
      timeMax:      end.toISOString(),
      singleEvents: true,
      maxResults:   250,
    };
    if (pageToken) params.pageToken = pageToken;

    const resp = Calendar.Events.list(CONFIG.CALENDAR_ID, params);

    (resp.items || []).forEach(event => _processEvent(event));

    pageToken = resp.nextPageToken || null;
    syncToken = resp.nextSyncToken || null;
  } while (pageToken);

  if (syncToken) {
    PROPS.setProperty(KEY_SYNC_TOKEN, syncToken);
    _log('Token de sync enregistré.');
  }
}

function _incrementalSync(syncToken) {
  _log('Sync incrémentale…');

  let pageToken = null;
  let nextToken = null;

  do {
    const params = {
      syncToken:    syncToken,
      singleEvents: true,
      maxResults:   250,
      showDeleted:  true,
    };
    if (pageToken) params.pageToken = pageToken;

    let resp;
    try {
      resp = Calendar.Events.list(CONFIG.CALENDAR_ID, params);
    } catch (e) {
      if (String(e).indexOf('410') !== -1 || String(e).indexOf('Gone') !== -1) {
        _log('Token 410 Gone — relance sync complète');
        PROPS.deleteProperty(KEY_SYNC_TOKEN);
        _fullSync();
        return;
      }
      throw e;
    }

    (resp.items || []).forEach(event => _processEvent(event));

    pageToken = resp.nextPageToken || null;
    nextToken = resp.nextSyncToken || null;
  } while (pageToken);

  if (nextToken) PROPS.setProperty(KEY_SYNC_TOKEN, nextToken);
  _log('Sync incrémentale terminée.');
}

// ═══════════════════════════════════════════════════════════════════════════
// TRAITEMENT D'UN ÉVÉNEMENT
// ═══════════════════════════════════════════════════════════════════════════

function _processEvent(event) {
  const eventId = event.id;
  const status  = (event.status || '').toLowerCase();

  if (!eventId) return;

  _log('Événement ' + eventId + ' | status=' + status + ' | ' + (event.summary || ''));

  const eventMap = _loadEventMap();

  // ── Suppression ──────────────────────────────────────────────────────────
  if (status === 'cancelled') {
    if (eventMap[eventId]) {
      _deleteRendezvous(eventMap[eventId].flex_id);
      delete eventMap[eventId];
      _saveEventMap(eventMap);
    }
    return;
  }

  // ── Payload commun ────────────────────────────────────────────────────────
  const payload = _buildPayload(event);
  if (!payload) {
    _log('Payload vide — événement ignoré : ' + eventId);
    return;
  }

  if (eventMap[eventId]) {
    // ── Mise à jour ──────────────────────────────────────────────────────────
    const flexId = eventMap[eventId].flex_id;
    const result = _updateRendezvous(flexId, payload);
    if (result && result.ok) {
      _log('Mis à jour : flex_id=' + flexId);
    }
  } else {
    // ── Création ─────────────────────────────────────────────────────────────
    const clientId = _resolveClientId(event);
    if (!clientId) {
      _log('Client introuvable pour "' + (event.summary || '') + '" — ignoré. Utilisez addClientMapping().');
      return;
    }

    payload.client_id = clientId;
    payload.id        = eventId; // session_id = Google event ID

    const result = _createRendezvous(payload);
    if (result && result.flex_id) {
      eventMap[eventId] = { flex_id: result.flex_id, client_id: clientId };
      _saveEventMap(eventMap);
      _log('Créé : flex_id=' + result.flex_id + ' session_id=' + eventId);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CONSTRUCTION DU PAYLOAD CABINET
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Format de la DESCRIPTION Resalib (après unfold) :
 *   [Ligne 0] "À domicile"  (optionnel — si séance à domicile)
 *   [Ligne 1] "Prénom NOM"  (nom du client, identique au SUMMARY sans suffix)
 *   [Ligne 2] "Consultation (Suivi) - Cabinet Cagnes-sur-Mer"  ← motif
 *   [Ligne 3] "Details : https://resalib.fr/…"
 *   [Ligne 4] "Annulation : https://resalib.fr/…"
 *   [Ligne 5] "Message utilisateur : …" (optionnel) ← observations
 */
function _buildPayload(event) {
  const title       = (event.summary     || '').trim();
  const description = (event.description || '').trim();
  const startObj    = event.start || {};
  const startStr    = startObj.dateTime || startObj.date || '';

  if (!startStr) return null;

  const startDate = new Date(startStr);
  const dateStr   = Utilities.formatDate(startDate, 'Europe/Paris', 'yyyy-MM-dd');
  const heureStr  = startObj.dateTime
    ? Utilities.formatDate(startDate, 'Europe/Paris', 'HH:mm')
    : '09:00';

  let duration = CONFIG.DEFAULT_DURATION_MINUTES;
  if (event.end) {
    const endStr = (event.end.dateTime || event.end.date || '');
    if (endStr) {
      const diff = Math.round((new Date(endStr) - startDate) / 60000);
      if (diff > 0) duration = diff;
    }
  }

  // ── Parse description lines ──────────────────────────────────────────────
  const lines = description.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  // Lignes à ignorer : URLs Resalib, patient name (déjà dans SUMMARY), "À domicile"
  const SKIP_RE = /^(details\s*:|annulation\s*:|message utilisateur\s*:|https?:\/\/|à domicile)/i;
  const NAME_RE = /[A-ZÀÂÉÈÊËÎÏÔÙÛÜÇ][''A-ZÀÂÉÈÊËÎÏÔÙÛÜÇ-]{1,}$/; // token ALL-CAPS = nom de famille Resalib

  let motif      = '';
  const obsLines = [];

  for (const line of lines) {
    if (SKIP_RE.test(line)) {
      // Garder les messages utilisateur comme observations
      if (/^message utilisateur\s*:/i.test(line)) {
        obsLines.push(line.replace(/^message utilisateur\s*:\s*/i, '').trim());
      }
      continue;
    }
    // Ligne qui ne contient que des tokens ALL-CAPS → c'est le nom du client, on saute
    const tokens = line.split(/\s+/);
    if (tokens.length <= 3 && tokens.every(t => NAME_RE.test(t.replace(/['\-]/g, '')) || t.toLowerCase() === t)) {
      const hasUpperToken = tokens.some(t => NAME_RE.test(t.replace(/['\-]/g, '')));
      if (hasUpperToken) continue;
    }
    // Première ligne conservée = motif (ex. "Consultation (Suivi) - Cabinet…")
    if (!motif) {
      motif = line.slice(0, 200);
    } else {
      obsLines.push(line);
    }
  }

  return {
    datetime:           dateStr + 'T' + heureStr,
    status:             _detectStatus(title),
    appointment_type:   _detectType(description),  // détection sur description complète
    duree:              duration,
    motif:              motif,
    observations:       obsLines.join('\n').slice(0, 2000),
    google_event_id:    event.id || '',
    google_event_link:  event.htmlLink || '',
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// RÉSOLUTION CLIENT
// ═══════════════════════════════════════════════════════════════════════════

function _resolveClientId(event) {
  const clientMap = _loadClientMap();

  // Essai 1 : attendees (email)
  for (const att of (event.attendees || [])) {
    const email = (att.email || '').toLowerCase();
    if (clientMap[email]) return clientMap[email];
  }

  // Essai 2 : nom extrait du SUMMARY Resalib
  const { firstName, lastName } = _extractNameFromSummary(event.summary || '');
  if (!firstName || !lastName) return null;

  const key = (firstName + ' ' + lastName).toLowerCase();
  if (clientMap[key]) return clientMap[key];

  // Essai 3 : recherche API Cabinet par first_name + last_name
  const uuid = _searchClientByName(firstName, lastName);
  if (uuid) {
    clientMap[key] = uuid;
    _saveClientMap(clientMap);
  }

  return uuid || null;
}

/**
 * Extrait prénom et nom du SUMMARY Resalib.
 * Format attendu : "Anne Pierre  FLOC'H | Resalib.fr"
 *
 * Règle (identique au script Python import_rendezvous.py) :
 *   1. Supprimer le suffixe " | …" et normaliser les espaces
 *   2. Le dernier token entièrement en MAJUSCULES (autorisant ' et -) = nom de famille
 *   3. Tout ce qui précède = prénom
 */
function _extractNameFromSummary(summary) {
  // Supprimer le suffixe " | Resalib.fr" (ou tout suffixe après |)
  let s = summary.replace(/\s*\|.*$/, '').trim();
  if (!s) return { firstName: '', lastName: '' };

  const tokens = s.split(/\s+/).filter(t => t.length > 0);
  if (tokens.length === 0) return { firstName: '', lastName: '' };

  // Cherche le dernier token ALL-CAPS (lettres + apostrophe + tiret autorisés)
  let lastIdx = tokens.length - 1; // défaut = dernier token
  for (let i = tokens.length - 1; i >= 0; i--) {
    const clean = tokens[i].replace(/['\u2019\-]/g, '');
    if (clean.length > 0 && clean === clean.toUpperCase() && /^[A-ZÀÂÉÈÊËÎÏÔÙÛÜÇ]+$/.test(clean)) {
      lastIdx = i;
      break;
    }
  }

  const lastName  = tokens[lastIdx];
  const firstName = tokens.slice(0, lastIdx).join(' ').trim();
  return { firstName, lastName };
}

/**
 * Recherche un client Cabinet via GET /api/contacts/search?first_name=…&last_name=…
 * Supprime les accents pour la comparaison (même logique que Clients.php::normalizeForSearch).
 */
function _searchClientByName(firstName, lastName) {
  if (!firstName || !lastName) return null;
  try {
    const qs   = 'first_name=' + encodeURIComponent(_stripAccents(firstName))
               + '&last_name='  + encodeURIComponent(_stripAccents(lastName));
    const url  = CONFIG.CABINET_BASE_URL + '/api/contacts/search?' + qs;
    const resp = _apiGet(url);

    if (resp && resp.found && resp.uuid) return resp.uuid;
  } catch (e) {
    _log('Erreur recherche client "' + firstName + ' ' + lastName + '" : ' + e.message);
  }
  return null;
}

/**
 * Supprime les diacritiques (accents) d'une chaîne.
 * Nécessaire car Cabinet::normalizeForSearch fait la même chose côté PHP.
 */
function _stripAccents(str) {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// ═══════════════════════════════════════════════════════════════════════════
// PUSH NOTIFICATIONS — GESTION DU WATCH CHANNEL
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Enregistre un watch channel sur le calendrier Resalib.
 * Google enverra un POST à WEBHOOK_URL à chaque modification.
 * À appeler depuis setupAll() ou manuellement après un resetAll().
 */
function setupCalendarWatch() {
  _stopExistingWatch();

  const channelId = 'resalib-' + new Date().getTime();

  const resource = {
    id:      channelId,
    type:    'web_hook',
    address: CONFIG.WEBHOOK_URL,
    params:  { ttl: '604800' }, // 7 jours (maximum autorisé)
  };

  let resp;
  try {
    resp = Calendar.Events.watch(resource, CONFIG.CALENDAR_ID);
  } catch (e) {
    _log('ERREUR setupCalendarWatch : ' + e.message);
    throw e;
  }

  PROPS.setProperty(KEY_CHANNEL_ID,  resp.id || channelId);
  PROPS.setProperty(KEY_RESOURCE_ID, resp.resourceId || '');
  PROPS.setProperty(KEY_CHANNEL_EXP, String(resp.expiration || 0));

  _log('Watch channel enregistré : id=' + resp.id + ' expiration=' + new Date(Number(resp.expiration)));
}

/**
 * Arrête le watch channel existant (si présent).
 */
function _stopExistingWatch() {
  const channelId  = PROPS.getProperty(KEY_CHANNEL_ID);
  const resourceId = PROPS.getProperty(KEY_RESOURCE_ID);

  if (!channelId || !resourceId) return;

  try {
    Calendar.Channels.stop({ id: channelId, resourceId: resourceId });
    _log('Watch channel arrêté : ' + channelId);
  } catch (e) {
    _log('Impossible d\'arrêter le channel (peut-être déjà expiré) : ' + e.message);
  }

  PROPS.deleteProperty(KEY_CHANNEL_ID);
  PROPS.deleteProperty(KEY_RESOURCE_ID);
  PROPS.deleteProperty(KEY_CHANNEL_EXP);
}

/**
 * Renouvelle le watch channel avant expiration (appelé par déclencheur quotidien).
 * Le channel dure 7 jours max — on le renouvelle si < 2 jours restants.
 */
function renewWatchIfNeeded() {
  const exp = Number(PROPS.getProperty(KEY_CHANNEL_EXP) || 0);
  if (!exp) {
    _log('Aucun channel enregistré — setupCalendarWatch().');
    setupCalendarWatch();
    return;
  }

  const remaining = exp - Date.now();
  const twoDays   = 2 * 24 * 60 * 60 * 1000;

  if (remaining < twoDays) {
    _log('Channel expire dans < 2 jours — renouvellement.');
    setupCalendarWatch();
  } else {
    _log('Channel OK — expire le ' + new Date(exp));
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// APPELS API CABINET
// ═══════════════════════════════════════════════════════════════════════════

function _createRendezvous(payload) {
  return _apiRequest('POST', CONFIG.CABINET_BASE_URL + '/api/cabinet/rendezvous', payload);
}

function _updateRendezvous(flexId, payload) {
  return _apiRequest('PUT', CONFIG.CABINET_BASE_URL + '/api/cabinet/rendezvous/' + encodeURIComponent(flexId), payload);
}

function _deleteRendezvous(flexId) {
  _log('Suppression flex_id=' + flexId);
  return _apiRequest('DELETE', CONFIG.CABINET_BASE_URL + '/api/cabinet/rendezvous/' + encodeURIComponent(flexId), null);
}

function _apiGet(url) {
  const resp = UrlFetchApp.fetch(url, {
    method:             'get',
    headers:            { 'X-Api-Key': CONFIG.CABINET_API_KEY },
    muteHttpExceptions: true,
  });
  return _parseResponse(resp);
}

function _apiRequest(method, url, payload) {
  const options = {
    method:             method.toLowerCase(),
    headers:            { 'X-Api-Key': CONFIG.CABINET_API_KEY, 'Content-Type': 'application/json' },
    muteHttpExceptions: true,
  };
  if (payload) options.payload = JSON.stringify(payload);

  _log(method + ' ' + url + (payload ? ' ' + JSON.stringify(payload) : ''));

  const resp = UrlFetchApp.fetch(url, options);
  return _parseResponse(resp);
}

function _parseResponse(resp) {
  const code = resp.getResponseCode();
  const body = resp.getContentText();
  _log('HTTP ' + code + ' : ' + body.slice(0, 400));
  if (code >= 400) throw new Error('HTTP ' + code + ' : ' + body);
  try { return JSON.parse(body); } catch (_) { return { ok: true }; }
}

// ═══════════════════════════════════════════════════════════════════════════
// DÉTECTION TYPE / STATUT
// ═══════════════════════════════════════════════════════════════════════════

function _detectType(text) {
  for (const [pattern, type] of Object.entries(CONFIG.TYPE_PATTERNS)) {
    if (new RegExp(pattern, 'i').test(text)) return type;
  }
  return CONFIG.DEFAULT_APPOINTMENT_TYPE;
}

function _detectStatus(text) {
  for (const [pattern, status] of Object.entries(CONFIG.STATUS_PATTERNS)) {
    if (new RegExp(pattern, 'i').test(text)) return status;
  }
  return 'scheduled';
}

// ═══════════════════════════════════════════════════════════════════════════
// PERSISTANCE
// ═══════════════════════════════════════════════════════════════════════════

function _loadEventMap()        { try { return JSON.parse(PROPS.getProperty(KEY_EVENT_MAP)  || '{}'); } catch(_){ return {}; } }
function _saveEventMap(m)       { PROPS.setProperty(KEY_EVENT_MAP,  JSON.stringify(m)); }
function _loadClientMap()       { try { return JSON.parse(PROPS.getProperty(KEY_CLIENT_MAP) || '{}'); } catch(_){ return {}; } }
function _saveClientMap(m)      { PROPS.setProperty(KEY_CLIENT_MAP, JSON.stringify(m)); }

// ═══════════════════════════════════════════════════════════════════════════
// DÉCLENCHEURS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Installe les déclencheurs ET enregistre le watch channel.
 * À exécuter manuellement une seule fois après configuration.
 */
function setupAll() {
  // Nettoyer les anciens déclencheurs
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));

  // Renouvellement du watch channel (quotidien à 2h)
  ScriptApp.newTrigger('renewWatchIfNeeded')
    .timeBased().atHour(2).everyDays(1).create();

  // Sync incrémentale de secours toutes les 15 min (si un push est raté)
  ScriptApp.newTrigger('_incrementalOrFull')
    .timeBased().everyMinutes(15).create();

  _log('Déclencheurs installés.');

  // Enregistrer le watch channel
  setupCalendarWatch();

  // Sync initiale
  _fullSync();
}

/**
 * Supprime tout et repart de zéro.
 */
function resetAll() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  _stopExistingWatch();
  [KEY_SYNC_TOKEN, KEY_EVENT_MAP, KEY_CLIENT_MAP].forEach(k => PROPS.deleteProperty(k));
  Logger.log('Tout réinitialisé.');
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILITAIRES CONSOLE
// ═══════════════════════════════════════════════════════════════════════════

function inspectEventMap()  { Logger.log(JSON.stringify(_loadEventMap(),  null, 2)); }
function inspectClientMap() { Logger.log(JSON.stringify(_loadClientMap(), null, 2)); }

/**
 * Enregistre manuellement un mapping client.
 * Accepte soit un nom complet soit le format SUMMARY Resalib :
 *   addClientMapping('Maryse DIGAT', 'uuid…')
 *   addClientMapping('Maryse DIGAT | Resalib.fr', 'uuid…')
 */
function addClientMapping(nameOrSummary, cabinetUuid) {
  const map  = _loadClientMap();
  const { firstName, lastName } = _extractNameFromSummary(nameOrSummary);
  const key  = firstName && lastName
    ? (firstName + ' ' + lastName).toLowerCase()
    : nameOrSummary.toLowerCase();
  map[key] = cabinetUuid;
  _saveClientMap(map);
  Logger.log('Mapping : "' + key + '" → ' + cabinetUuid);
}

/** Force la sync d'un événement précis par son ID Google Calendar */
function forceSyncEvent(eventId) {
  const event = Calendar.Events.get(CONFIG.CALENDAR_ID, eventId);
  _processEvent(event);
}

function _log(msg) { Logger.log('[resalib-sync] ' + msg); }
