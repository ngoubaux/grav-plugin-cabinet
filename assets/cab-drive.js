/* Cabinet — Google Drive / Calendar / Docs integration
 * Expects Alpine.store('cab') to exist and cab-utils.js to be loaded.
 */

const ANAMN_TEMPLATE = (p,n) => `QUESTIONNAIRE D'ANAMNÈSE
Nicolas Goubaux — Médiateur de bien-être intérieur
Client : ${p} ${n}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. MOTIF DE CONSULTATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Motif principal :

Depuis quand ?

Ce qui soulage / aggrave :


2. ANTÉCÉDENTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Antécédents médicaux et chirurgicaux :

Traumatismes (chutes, accidents) :

Médications actuelles :

Allergies connues :


3. MODE DE VIE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Activité professionnelle :

Activité physique :

Sommeil (qualité, durée) :

Alimentation :

Hydratation :


4. CONTEXTE ÉMOTIONNEL & STRESS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Niveau de stress global (1–10) :

Principales sources de tension :

Ressources / soutiens :


5. SCHÉMA CORPOREL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Insérer un schéma corporel annoté — Insertion › Dessin ou image]


6. OBSERVATIONS DU PRATICIEN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

`;

const BILAN_TEMPLATE = (p,n) => `BILAN — ${p} ${n}
Nicolas Goubaux — Usage interne praticien
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Insérer les schémas via Insertion › Dessin ou via une image scannée.
Ajouter un nouveau bloc SÉANCE pour chaque suivi.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


SÉANCE DU [DATE]
━━━━━━━━━━━━━━━━━
État général à l'arrivée :

Méridiens en excès :
Méridiens en vide :
Méridiens en stase :
Élément dominant :

Points / zones travaillés :

[Schéma corporel ici]

Synthèse MTC :

Évolution vs séance précédente :

Intention prochaine séance :

`;

/* ── Drive state (module-level, shared) ── */
let _driveToken = null;
let _gapiReady = false;
let _bilanFolderIdCache = null;
let _bilanFileCache = {};
let _tokenRefreshTimer = null;

/* Notifie le composant drive-bar via CustomEvent (bypass scheduler Alpine) */
function _driveUpdate(connected, state, label) {
  window.dispatchEvent(new CustomEvent('cab:drive-update', {detail: {connected, state, label}}));
}

function _getDriveToken() { return _driveToken; }

function _saveToken(token, expiresIn) {
  const expiry = Date.now() + expiresIn * 1000;
  sessionStorage.setItem('gdrive_token', token);
  sessionStorage.setItem('gdrive_token_expiry', String(expiry));
}

function _clearSavedToken() {
  sessionStorage.removeItem('gdrive_token');
  sessionStorage.removeItem('gdrive_token_expiry');
}

function _loadSavedToken() {
  const token = sessionStorage.getItem('gdrive_token');
  const expiry = parseInt(sessionStorage.getItem('gdrive_token_expiry')||'0', 10);
  if(token && expiry-Date.now() > 5*60*1000)
    return {token, expiresIn: Math.floor((expiry-Date.now())/1000)};
  return null;
}

function _applyToken(token, expiresIn) {
  _driveToken = token;
  _bilanFolderIdCache = null;
  _bilanFileCache = {};
  _saveToken(token, expiresIn);
  clearTimeout(_tokenRefreshTimer);
  _tokenRefreshTimer = setTimeout(()=>{
    window._tokenClient?.requestAccessToken({prompt:''});
  }, Math.max(60, expiresIn-300)*1000);

  const store = Alpine.store('cab');
  store.driveConnected = true;
  Object.assign(store.driveStatus, {state:'ok', label:'Google connecté'});
  _driveUpdate(true, 'ok', 'Google connecté');
  store.renderList();
  if(store.activeTab==='bilan') store.loadBilanFile();
}

function initGapi() {
  gapi.load('client', async ()=>{
    await gapi.client.init({});
    await gapi.client.load('https://www.googleapis.com/discovery/v1/apis/drive/v3/rest');
    _gapiReady = true;
    const cid = localStorage.getItem('gdrive_client_id');
    if(cid) _initTokenClient(cid, true);
  });
}

function _initTokenClient(clientId, silent=false) {
  if(silent){
    const saved = _loadSavedToken();
    if(saved){
      window._tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/documents https://www.googleapis.com/auth/calendar.events',
        callback: ()=>{}, error_callback: ()=>{}
      });
      _applyToken(saved.token, saved.expiresIn);
      clearTimeout(_tokenRefreshTimer);
      _tokenRefreshTimer = setTimeout(()=>{
        window._tokenClient?.requestAccessToken({prompt:''});
      }, Math.max(60, saved.expiresIn-300)*1000);
      return;
    }
  }
  window._tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/documents https://www.googleapis.com/auth/calendar.events',
    callback: async (resp) => {
      if(resp.error){
        if(!silent) { Object.assign(Alpine.store('cab').driveStatus, {state:'error', label:"Erreur d'authentification"}); _driveUpdate(null, 'error', "Erreur d'authentification"); }
        return;
      }
      _applyToken(resp.access_token, resp.expires_in||3600);
    },
    error_callback: () => {
      if(!silent) Object.assign(Alpine.store('cab').driveStatus, {state:'error', label:"Erreur d'authentification"});
    }
  });
  if(silent) window._tokenClient.requestAccessToken({prompt:''});
}

function driveAuth() {
  const cid = localStorage.getItem('gdrive_client_id');
  if(!cid){ Alpine.store('cab').openModal('settings'); return; }
  _initTokenClient(cid, false);  // Always reinit for interactive flow with proper callbacks
  Object.assign(Alpine.store('cab').driveStatus, {state:'loading', label:'Connexion…'});
  _driveUpdate(null, 'loading', 'Connexion…');
  window._tokenClient.requestAccessToken({prompt:''});
}

function driveSignOut() {
  clearTimeout(_tokenRefreshTimer);
  if(_driveToken) google.accounts.oauth2.revoke(_driveToken);
  _clearSavedToken();
  _driveToken = null;
  _bilanFolderIdCache = null;
  _bilanFileCache = {};
  const store = Alpine.store('cab');
  store.driveConnected = false;
  Object.assign(store.driveStatus, {state:'', label:'Non connecté'});
  _driveUpdate(false, '', 'Non connecté');
  store.clients = {};
  store.sessions = {};
  store.renderList();
}

async function driveGet(path, params='') {
  const r = await fetch(`https://www.googleapis.com/drive/v3/${path}?${params}`, {
    headers: {'Authorization':'Bearer '+_driveToken}
  });
  if(r.status===401){
    Object.assign(Alpine.store('cab').driveStatus, {state:'error', label:'Session expirée — reconnectez'});
    _driveUpdate(null, 'error', 'Session expirée — reconnectez');
    return null;
  }
  return r.ok ? r.json() : null;
}

async function _driveFolderChild(parentId, name) {
  const q=`name='${name.replace(/'/g,"\\'")}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`;
  const r=await fetch('https://www.googleapis.com/drive/v3/files?q='+encodeURIComponent(q)+'&fields=files(id)',
    {headers:{'Authorization':'Bearer '+_driveToken}});
  if(!r.ok) return null;
  const d=await r.json();
  return (d.files&&d.files.length) ? d.files[0].id : null;
}

async function _getDriveFolderByPath(path) {
  let id='root';
  for(const part of path.split('/').map(p=>p.trim()).filter(Boolean)){
    id=await _driveFolderChild(id, part);
    if(!id) return null;
  }
  return id;
}

async function _getBilanFolderId() {
  if(_bilanFolderIdCache) return _bilanFolderIdCache;
  _bilanFolderIdCache = await _getDriveFolderByPath(Alpine.store('cab').driveBilanPath);
  return _bilanFolderIdCache;
}


async function findClientBilanFile(clientId) {
  if(_bilanFileCache[clientId]!==undefined) return _bilanFileCache[clientId];
  if(!_driveToken){ _bilanFileCache[clientId]=null; return null; }
  const c=Alpine.store('cab').clients[clientId];
  if(!c){ _bilanFileCache[clientId]=null; return null; }
  const folderId=await _getBilanFolderId();
  if(!folderId){ _bilanFileCache[clientId]=null; return null; }
  const name=((c.first_name||'')+' '+(c.last_name||'')).trim()+'.pdf';
  const q=`name='${name.replace(/'/g,"\\'")}' and '${folderId}' in parents and trashed=false`;
  try{
    const r=await fetch('https://www.googleapis.com/drive/v3/files?q='+encodeURIComponent(q)+'&fields=files(id,name)',
      {headers:{'Authorization':'Bearer '+_driveToken}});
    if(!r.ok) throw new Error('HTTP '+r.status);
    const d=await r.json();
    const file=d.files?.length ? d.files[0] : null;
    _bilanFileCache[clientId]=file ? {fileId:file.id, name:file.name} : null;
    return _bilanFileCache[clientId];
  }catch(e){
    _bilanFileCache[clientId]=null;
    return null;
  }
}

async function uploadBilanTemplate(clientId) {
  const c=Alpine.store('cab').clients[clientId];
  if(!c||!_driveToken) return;
  const name=((c.first_name||'')+' '+(c.last_name||'')).trim()+'.pdf';
  const folderId=await _getBilanFolderId();
  if(!folderId){ showToast('Dossier Drive introuvable','error'); return; }
  let pdfBlob;
  try{
    const r=await fetch((window.CABINET_ROUTE_APP||'/cabinet')+'/client-template.pdf');
    if(!r.ok) throw new Error('HTTP '+r.status);
    pdfBlob=await r.blob();
  }catch(e){ showToast('Erreur chargement template : '+e.message,'error'); return; }
  try{
    const form=new FormData();
    form.append('metadata',new Blob([JSON.stringify({name,parents:[folderId]})],{type:'application/json'}));
    form.append('file',pdfBlob,name);
    const r=await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name',
      {method:'POST',headers:{'Authorization':'Bearer '+_driveToken},body:form});
    if(!r.ok) throw new Error('HTTP '+r.status);
    delete _bilanFileCache[clientId];
    showToast('Fiche envoyée sur Drive : '+name);
    if(Alpine.store('cab').activeTab==='bilan') Alpine.store('cab').loadBilanFile();
  }catch(e){ showToast('Erreur upload Drive : '+e.message,'error'); }
}

function _gcalEventBody(clientId, session) {
  const c=Alpine.store('cab').clients[clientId]||{};
  const title=((c.first_name||'')+' '+(c.last_name||'')).trim();
  const heure=session.heure||'09:00';
  const duree=Math.max(1,parseInt(session.duree||'60',10)||60);
  const startDt=`${session.date}T${heure}:00`;
  const endDate=new Date(`${session.date}T${heure}:00`);
  endDate.setMinutes(endDate.getMinutes()+duree);
  const descParts=[];
  if(session.motif)        descParts.push(session.motif);
  if(session.observations) descParts.push('Observations : '+session.observations);
  if(session.exercices)    descParts.push('Exercices : '+session.exercices);
  if(session.prochaine)    descParts.push('Prochaine séance : '+session.prochaine);
  return {
    summary: title,
    description: descParts.join('\n'),
    start: {dateTime:startDt, timeZone:'Europe/Paris'},
    end:   {dateTime:endDate.toISOString().slice(0,19), timeZone:'Europe/Paris'},
  };
}

async function gcalCreateEvent(clientId, session) {
  const calId=localStorage.getItem('gcal_calendar_id');
  if(!calId||!_driveToken) return null;
  try{
    const r=await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events`,{
      method:'POST',
      headers:{'Authorization':'Bearer '+_driveToken,'Content-Type':'application/json'},
      body:JSON.stringify(_gcalEventBody(clientId,session)),
    });
    if(!r.ok) throw new Error('HTTP '+r.status);
    const ev=await r.json();
    return {id:ev.id, htmlLink:ev.htmlLink};
  }catch(e){
    showToast('Sync calendrier échouée : '+e.message,'error');
    return null;
  }
}

async function gcalUpdateEvent(eventId, clientId, session) {
  const calId=localStorage.getItem('gcal_calendar_id');
  if(!calId||!_driveToken||!eventId) return;
  try{
    const r=await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events/${encodeURIComponent(eventId)}`,{
      method:'PUT',
      headers:{'Authorization':'Bearer '+_driveToken,'Content-Type':'application/json'},
      body:JSON.stringify(_gcalEventBody(clientId,session)),
    });
    if(!r.ok) throw new Error('HTTP '+r.status);
  }catch(e){
    showToast('Mise à jour calendrier échouée : '+e.message,'error');
  }
}

async function createGoogleDoc(name, content) {
  if(!_driveToken){ alert("Connectez Google Drive d'abord."); return null; }
  Object.assign(Alpine.store('cab').driveStatus, {state:'loading', label:'Création du document…'});
  _driveUpdate(null, 'loading', 'Création du document…');
  try{
    const r1=await fetch('https://www.googleapis.com/drive/v3/files',{
      method:'POST',
      headers:{'Authorization':'Bearer '+_driveToken,'Content-Type':'application/json'},
      body:JSON.stringify({name, mimeType:'application/vnd.google-apps.document'})
    });
    if(!r1.ok) throw new Error('Création échouée');
    const doc=await r1.json();
    await fetch('https://docs.googleapis.com/v1/documents/'+doc.id+':batchUpdate',{
      method:'POST',
      headers:{'Authorization':'Bearer '+_driveToken,'Content-Type':'application/json'},
      body:JSON.stringify({requests:[{insertText:{location:{index:1},text:content}}]})
    });
    Object.assign(Alpine.store('cab').driveStatus, {state:'ok', label:'Document créé'});
    _driveUpdate(null, 'ok', 'Document créé');
    return doc.id;
  }catch(e){
    Object.assign(Alpine.store('cab').driveStatus, {state:'error', label:'Erreur : '+e.message});
    _driveUpdate(null, 'error', 'Erreur : '+e.message);
    return null;
  }
}

async function handleAnamneseDoc(clientId) {
  const store=Alpine.store('cab');
  const c=store.clients[clientId];
  if(!c) return;
  if(c.gdoc_anamn_id){ window.open('https://docs.google.com/document/d/'+c.gdoc_anamn_id+'/edit','_blank'); return; }
  const id=await createGoogleDoc('Anamnèse — '+c.first_name+' '+c.last_name, ANAMN_TEMPLATE(c.first_name,c.last_name));
  if(id){
    store.clients[clientId].gdoc_anamn_id=id;
    await apiCall('PUT','/api/cabinet/clients/'+encodeURIComponent(clientId),store.clients[clientId]);
  }
}

async function handleBilanDoc(clientId) {
  const store=Alpine.store('cab');
  const c=store.clients[clientId];
  if(!c) return;
  if(c.gdoc_bilan_id){ window.open('https://docs.google.com/document/d/'+c.gdoc_bilan_id+'/edit','_blank'); return; }
  const id=await createGoogleDoc('Bilan — '+c.first_name+' '+c.last_name, BILAN_TEMPLATE(c.first_name,c.last_name));
  if(id){
    store.clients[clientId].gdoc_bilan_id=id;
    await apiCall('PUT','/api/cabinet/clients/'+encodeURIComponent(clientId),store.clients[clientId]);
  }
}

async function appendSeanceTemplate(clientId) {
  if(!_driveToken){ showToast("Connectez Google Drive d'abord",'error'); return; }
  const bilanFile=await findClientBilanFile(clientId);
  if(!bilanFile){ showToast('Bilan introuvable sur Drive','error'); return; }

  if(!window.PDFLib){
    await new Promise((resolve,reject)=>{
      const s=document.createElement('script');
      s.src='https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js';
      s.onload=resolve; s.onerror=()=>reject(new Error('Chargement pdf-lib échoué'));
      document.head.appendChild(s);
    });
  }
  const {PDFDocument}=window.PDFLib;

  showToast('Téléchargement du bilan…');
  let bilanBytes;
  try{
    const r=await fetch(`https://www.googleapis.com/drive/v3/files/${bilanFile.fileId}?alt=media`,
      {headers:{'Authorization':'Bearer '+_driveToken}});
    if(!r.ok) throw new Error('HTTP '+r.status);
    bilanBytes=await r.arrayBuffer();
  }catch(e){ showToast('Erreur téléchargement bilan : '+e.message,'error'); return; }

  let templateBytes;
  try{
    const r=await fetch((window.CABINET_ROUTE_APP||'/cabinet')+'/seance-template.pdf');
    if(!r.ok) throw new Error('HTTP '+r.status);
    templateBytes=await r.arrayBuffer();
  }catch(e){ showToast('Erreur chargement template : '+e.message,'error'); return; }

  let mergedBytes;
  try{
    const bilanDoc=await PDFDocument.load(bilanBytes,{ignoreEncryption:true});
    const templateDoc=await PDFDocument.load(templateBytes,{ignoreEncryption:true});
    const pages=await bilanDoc.copyPages(templateDoc,templateDoc.getPageIndices());
    pages.forEach(p=>bilanDoc.addPage(p));
    mergedBytes=await bilanDoc.save();
  }catch(e){ showToast('Erreur fusion PDF : '+e.message,'error'); return; }

  try{
    const blob=new Blob([mergedBytes],{type:'application/pdf'});
    const form=new FormData();
    form.append('metadata',new Blob([JSON.stringify({})],{type:'application/json'}));
    form.append('file',blob,bilanFile.name);
    const r=await fetch(
      `https://www.googleapis.com/upload/drive/v3/files/${bilanFile.fileId}?uploadType=multipart`,
      {method:'PATCH',headers:{'Authorization':'Bearer '+_driveToken},body:form});
    if(!r.ok) throw new Error('HTTP '+r.status);
  }catch(e){ showToast('Erreur upload Drive : '+e.message,'error'); return; }

  delete _bilanFileCache[clientId];
  showToast('Fiche séance ajoutée au bilan');
  const store=Alpine.store('cab');
  if(store.activeTab==='bilan') store.loadBilanFile();
}

async function runGlobalVerification() {
  const store=Alpine.store('cab');
  if(!_driveToken){ showToast('Connectez Google Drive d\'abord','error'); return; }
  store.openModal('verif');
  const log=(msg,type='')=>{
    store.modal.verifLog.push({msg,type});
  };
  const stats={bilanOk:0,bilanSent:0,bilanErr:0,calCreated:0,calErr:0};
  const clientIds=Object.keys(store.clients);

  log('<strong>Bilans tablette</strong>');
  const folderId=await _getBilanFolderId();
  if(!folderId){
    log(`⚠ Dossier Drive introuvable (${store.driveBilanPath})`,'warn');
  } else {
    let templateBlob=null;
    try{ const r=await fetch((window.CABINET_ROUTE_APP||'/cabinet')+'/client-template.pdf'); if(r.ok) templateBlob=await r.blob(); }catch(_){}
    for(const clientId of clientIds){
      const c=store.clients[clientId];
      const name=((c.first_name||'')+' '+(c.last_name||'')).trim();
      delete _bilanFileCache[clientId];
      const file=await findClientBilanFile(clientId);
      if(file){
        log(`✓ ${esc(name)}`,'ok'); stats.bilanOk++;
      } else if(!templateBlob){
        log(`✗ ${esc(name)} — template introuvable`,'warn'); stats.bilanErr++;
      } else {
        log(`↑ ${esc(name)} — envoi fiche vierge…`);
        try{
          const fileName=name+'.pdf';
          const form=new FormData();
          form.append('metadata',new Blob([JSON.stringify({name:fileName,parents:[folderId]})],{type:'application/json'}));
          form.append('file',templateBlob,fileName);
          const r=await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
            {method:'POST',headers:{'Authorization':'Bearer '+_driveToken},body:form});
          if(!r.ok) throw new Error('HTTP '+r.status);
          delete _bilanFileCache[clientId];
          log('&nbsp;&nbsp;✓ Envoyé','ok'); stats.bilanSent++;
        }catch(e){
          log('&nbsp;&nbsp;✗ Erreur : '+e.message,'warn'); stats.bilanErr++;
        }
      }
    }
  }

  const calId=localStorage.getItem('gcal_calendar_id');
  log('');
  if(!calId){
    log('<strong>Agenda</strong> — calendrier non configuré, ignoré');
  } else {
    log('<strong>Agenda</strong>');
    const today=new Date().toISOString().slice(0,10);
    let anyPending=false;
    for(const clientId of clientIds){
      const pending=(store.sessions[clientId]||[]).filter(s=>s.date>=today&&!s.google_event_id&&s.status!=='cancelled');
      for(const s of pending){
        anyPending=true;
        const c=store.clients[clientId];
        const name=((c?.first_name||'')+' '+(c?.last_name||'')).trim();
        log(`↑ ${esc(name)} — ${s.date} ${s.heure}`);
        try{
          const r=await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events`,{
            method:'POST',
            headers:{'Authorization':'Bearer '+_driveToken,'Content-Type':'application/json'},
            body:JSON.stringify(_gcalEventBody(clientId,s)),
          });
          if(!r.ok) throw new Error('HTTP '+r.status);
          const ev=await r.json();
          s.google_event_id=ev.id; s.google_event_link=ev.htmlLink;
          if(s.flex_id) await apiCall('PUT','/api/cabinet/rendezvous/'+encodeURIComponent(s.flex_id),s);
          log('&nbsp;&nbsp;✓ Créé','ok'); stats.calCreated++;
        }catch(e){
          log('&nbsp;&nbsp;✗ Erreur : '+e.message,'warn'); stats.calErr++;
        }
      }
    }
    if(!anyPending) log('✓ Toutes les séances à venir sont synchronisées','ok');
  }

  const hasErr=stats.bilanErr||stats.calErr;
  store.modal.verifSummary={
    text:`Fiches clients : ${stats.bilanOk} OK · ${stats.bilanSent} envoyées · ${stats.bilanErr} erreur(s)`
      +(calId?` · Agenda : ${stats.calCreated} créé(s) · ${stats.calErr} erreur(s)`:''),
    ok: !hasErr
  };
  store.modal.verifDone=true;
  if(store.activeTab==='bilan') store.loadBilanFile();
}

// Initialize Google API
// Robust gapi initialization with multiple fallback triggers
if(typeof gapi !== 'undefined' && gapi.load) {
  if(document.readyState === 'loading')
    window.addEventListener('load', initGapi);
  else
    initGapi();  // DOM already loaded
} else {
  const gapiScript = document.querySelector('script[src*="apis.google.com"]');
  if(gapiScript) {
    if(gapiScript.loaded || gapiScript.readyState === 'loaded')
      initGapi();  // Script already loaded
    else
      gapiScript.addEventListener('load', initGapi);
  } else {
    // Script not yet present; listen for it to be added
    window.addEventListener('load', () => {
      if(typeof gapi !== 'undefined' && gapi.load) initGapi();
    });
  }
}
