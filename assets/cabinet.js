let clients={},sessions={},activeId=null,activeTab='fiche',openSessions={};

function normalizeUuid(value){
  return String(value || '').replace(/-/g, '').toLowerCase();
}

function resolveClientKey(candidate){
  const raw = String(candidate || '');
  if(!raw) return '';
  if(clients[raw]) return raw;

  const target = normalizeUuid(raw);
  const key = Object.keys(clients).find(k=>{
    if(normalizeUuid(k) === target) return true;
    const linked = clients[k] && clients[k].grav_uuid ? clients[k].grav_uuid : '';
    return normalizeUuid(linked) === target;
  });

  return key || raw;
}

function sessionsFromRendezVous(items){
  const mapped = {};
  if(!Array.isArray(items)) return mapped;

  items.forEach(item=>{
    if(!item || typeof item !== 'object') return;
    const clientId = resolveClientKey(item.client_id || '');
    if(!clientId) return;

    const datetime = String(item.datetime || '');
    const date = String(item.date || (datetime ? datetime.slice(0,10) : ''));
    const heure = String(item.heure || (datetime && datetime.length >= 16 ? datetime.slice(11,16) : '00:00'));
    const duree = String(item.duree || item.duration || '60');

    if(!mapped[clientId]) mapped[clientId] = [];
    mapped[clientId].push({
      id: String(item.id || item.session_id || uid()),
      flex_id: String(item.flex_id || ''),
      google_event_id:   String(item.google_event_id   || ''),
      google_event_link: String(item.google_event_link || ''),
      date,
      heure,
      datetime: datetime || (date ? `${date}T${heure}` : ''),
      duree,
      status: String(item.status || 'scheduled'),
      appointment_type: String(item.appointment_type || item.type || 'shiatsu_futon'),
      motif: String(item.motif || ''),
      observations: String(item.observations || item.notes || ''),
      exercices: String(item.exercices || ''),
      prochaine: String(item.prochaine || ''),
      bilan: item.bilan && typeof item.bilan === 'object' ? item.bilan : null,
    });
  });

  Object.values(mapped).forEach(list=>{
    list.sort((a,b)=> String(a.datetime||'').localeCompare(String(b.datetime||'')));
  });

  return mapped;
}

const MERIDIANS=[
  {id:'P',name:'Poumon'},
  {id:'GI',name:'Gros Intestin'},
  {id:'E',name:'Estomac'},
  {id:'Rte',name:'Rate'},
  {id:'C',name:'Coeur'},
  {id:'IG',name:'Intestin Grêle'},
  {id:'V',name:'Vessie'},
  {id:'Rn',name:'Rein'},
  {id:'MC',name:'Maître Coeur'},
  {id:'TR',name:'Triple Réchauffeur'},
  {id:'VB',name:'Vésicule Biliaire'},
  {id:'F',name:'Foie'},
];

const STATES=[
  {val:'',label:'—'},
  {val:'plein',label:'Plein / Excès'},
  {val:'vide',label:'Vide / Insuffisance'},
  {val:'stase',label:'Stase / Blocage'},
  {val:'ok',label:'Harmonieux'},
];

const STATE_CLASS={plein:'e-plein',vide:'e-vide',stase:'e-stase',ok:'e-ok','':'e-nd'};



// ── Agenda global ─────────────────────────────────────────────────────────
let sidebarView = 'clients';
let agendaMonth = new Date();

function setSidebarView(view){
  sidebarView = view;
  document.getElementById('snav_clients').classList.toggle('active', view==='clients');
  document.getElementById('snav_agenda').classList.toggle('active', view==='agenda');

  const clientsHead = document.getElementById('sidebar_clients_head');
  const clientsBody = document.getElementById('sidebar_clients_body');
  const agendaPanel = document.getElementById('sidebar_agenda_body');

  if(view==='clients'){
    if(clientsHead) clientsHead.style.display='';
    if(clientsBody) clientsBody.style.display='';
    if(agendaPanel) agendaPanel.style.display='none';
  } else {
    if(clientsHead) clientsHead.style.display='none';
    if(clientsBody) clientsBody.style.display='none';
    if(agendaPanel){ agendaPanel.style.display='flex'; agendaPanel.style.flexDirection='column'; }
    renderAgenda();
  }
}

function renderAgenda(){
  const el = document.getElementById('agendaContent');
  if(!el) return;

  const y = agendaMonth.getFullYear();
  const m = agendaMonth.getMonth();

  // Collecter toutes les séances avec info client
  const allSessions = [];
  Object.entries(sessions).forEach(([cid, ss])=>{
    const client = clients[cid];
    if(!client) return;
    ss.forEach(s=>{
      if(s.date) allSessions.push({...s, cid, clientName: client.first_name+' '+client.last_name});
    });
  });

  // Index par date YYYY-MM-DD
  const byDate = {};
  allSessions.forEach(s=>{
    const d = s.date.slice(0,10);
    if(!byDate[d]) byDate[d]=[];
    byDate[d].push(s);
  });
  Object.values(byDate).forEach(list=>list.sort((a,b)=>(a.heure||'').localeCompare(b.heure||'')));

  // ── Mini calendrier ───────────────────────────────────────────────────
  const today = new Date().toISOString().slice(0,10);
  const firstDay = new Date(y, m, 1);
  const lastDay  = new Date(y, m+1, 0);
  const startDow = (firstDay.getDay()+6)%7; // Lundi=0
  const daysInMonth = lastDay.getDate();
  const monthLabel = firstDay.toLocaleDateString('fr-FR',{month:'long',year:'numeric'});

  const dows = ['L','M','M','J','V','S','D'];
  let calCells = dows.map(d=>`<div class="cal-dow">${d}</div>`).join('');

  // Cases vides avant le 1er
  for(let i=0;i<startDow;i++) calCells += '<div class="cal-day other"></div>';

  for(let d=1;d<=daysInMonth;d++){
    const dateStr = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const hasSess = !!byDate[dateStr];
    const isToday = dateStr===today;
    let cls = 'cal-day';
    if(isToday) cls+=' today';
    if(hasSess) cls+=' has-session';
    const pip = hasSess ? '<div class="cal-pip"></div>' : '';
    const click = hasSess ? `onclick="scrollToDate('${dateStr}')"` : '';
    calCells += `<div class="${cls}" ${click}>${d}${pip}</div>`;
  }

  // Cases vides après le dernier
  const endDow = (lastDay.getDay()+6)%7;
  for(let i=endDow+1;i<7;i++) calCells += '<div class="cal-day other"></div>';

  // ── Liste des séances du mois ─────────────────────────────────────────
  const monthPrefix = `${y}-${String(m+1).padStart(2,'0')}`;
  const monthDates = Object.keys(byDate)
    .filter(d=>d.startsWith(monthPrefix))
    .sort();

  const now = today;
  let listHtml = '';
  if(!monthDates.length){
    listHtml = '<div class="agenda-empty">Aucune séance ce mois-ci</div>';
  } else {
    monthDates.forEach(dateStr=>{
      const dateObj = new Date(dateStr+'T12:00:00');
      const label = dateObj.toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long'});
      const isPast = dateStr < now;
      listHtml += `<div class="agenda-group" id="date_${dateStr}">
        <div class="agenda-date-header">${label}</div>
        ${byDate[dateStr].map(s=>`
          <div class="agenda-entry${isPast?' past':''}" onclick="goToClient('${s.cid}')">
            <div class="agenda-time">${s.heure?esc(s.heure.slice(0,5)):''}</div>
            <div>
              <div class="agenda-client">${esc(s.clientName)}</div>
              ${s.motif?`<div class="agenda-motif">${esc(s.motif)}</div>`:''}
            </div>
            ${s.duree?`<div class="agenda-dur">${s.duree} min</div>`:''}
          </div>`).join('')}
      </div>`;
    });
  }

  el.innerHTML = `
    <div class="cal-header">
      <button class="cal-nav" onclick="changeAgendaMonth(-1)">‹</button>
      <span class="cal-month">${monthLabel.charAt(0).toUpperCase()+monthLabel.slice(1)}</span>
      <button class="cal-nav" onclick="changeAgendaMonth(1)">›</button>
    </div>
    <div class="cal-grid">${calCells}</div>
    <div style="border-top:0.5px solid #e2e2e2;padding:10px 16px 4px;font-size:11px;font-weight:500;color:#666;text-transform:uppercase;letter-spacing:.5px">Séances du mois</div>
    <div class="agenda-list">${listHtml}</div>`;
}

function changeAgendaMonth(dir){
  agendaMonth = new Date(agendaMonth.getFullYear(), agendaMonth.getMonth()+dir, 1);
  renderAgenda();
}

function scrollToDate(dateStr){
  const el = document.getElementById('date_'+dateStr);
  if(el) el.scrollIntoView({behavior:'smooth', block:'start'});
}

function goToClient(cid){
  setSidebarView('clients');
  selectClient(cid);
}

// ── Google Drive Storage ────────────────────────────────────────────────────

let driveToken = null;
let gapiReady = false;
let bilanFolderIdCache = null;
let bilanFileCache = {};
let _tokenRefreshTimer = null;

function initGapi(){
  gapi.load('client', async ()=>{
    await gapi.client.init({});
    await gapi.client.load('https://www.googleapis.com/discovery/v1/apis/drive/v3/rest');
    gapiReady = true;
    const cid = localStorage.getItem('gdrive_client_id');
    if(cid) initTokenClient(cid, true);
  });
}

function initTokenClient(clientId, silent=false){
  window._tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/documents https://www.googleapis.com/auth/calendar.events',
    callback: async (resp)=>{
      if(resp.error){
        if(!silent) setDriveStatus('error','Erreur d\'authentification');
        return;
      }
      driveToken = resp.access_token;
      bilanFolderIdCache = null;
      bilanFileCache = {};
      // Renouvellement automatique 5 min avant expiry
      const expiresIn = Math.max(60, (resp.expires_in || 3600) - 300);
      clearTimeout(_tokenRefreshTimer);
      _tokenRefreshTimer = setTimeout(()=>{
        window._tokenClient.requestAccessToken({prompt:''});
      }, expiresIn * 1000);
      setDriveStatus('ok','Google connecté');
      document.getElementById('driveBtn').textContent='Déconnecter Drive';
      document.getElementById('driveBtn').onclick=driveSignOut;
      const vb=document.getElementById('verifBtn');if(vb)vb.style.display='';
      renderList();
      if(activeTab==='bilan') renderBilan();
    },
    error_callback: ()=>{
      if(!silent) setDriveStatus('error','Erreur d\'authentification');
    }
  });
  if(silent) window._tokenClient.requestAccessToken({prompt:''});
}

function driveAuth(){
  const cid = localStorage.getItem('gdrive_client_id');
  if(!cid){ openDriveSettings(); return; }
  if(!window._tokenClient) initTokenClient(cid, false);
  setDriveStatus('loading','Connexion…');
  window._tokenClient.requestAccessToken({prompt:''});
}

function driveSignOut(){
  clearTimeout(_tokenRefreshTimer);
  if(driveToken) google.accounts.oauth2.revoke(driveToken);
  driveToken=null; driveFileId=null;
  bilanFolderIdCache=null; bilanFileCache={};
  setDriveStatus('','Non connecté');
  document.getElementById('driveBtn').textContent='Connecter Drive';
  document.getElementById('driveBtn').onclick=driveAuth;
  const vb=document.getElementById('verifBtn');if(vb)vb.style.display='none';
  clients={}; sessions={}; renderList();
}

function setDriveStatus(state, label){
  const dot=document.getElementById('driveDot');
  const lbl=document.getElementById('driveLabel');
  if(dot) dot.className='drive-dot'+(state?' '+state:'');
  if(lbl) lbl.textContent=label;
}

async function driveGet(path, params=''){
  const r=await fetch('https://www.googleapis.com/drive/v3/'+path+'?'+params,{
    headers:{'Authorization':'Bearer '+driveToken}
  });
  if(r.status===401){setDriveStatus('error','Session expirée — reconnectez');return null;}
  return r.ok ? r.json() : null;
}

// ── Bilans PDF tablette Boox ──────────────────────────────────────────────────
// Convention : onyx/NoteAir5c/Cahiers/clients/Prénom Nom.pdf

async function _driveFolderChild(parentId, name){
  const q = `name='${name.replace(/'/g,"\\'")}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`;
  const r = await fetch(
    'https://www.googleapis.com/drive/v3/files?q='+encodeURIComponent(q)+'&fields=files(id)',
    {headers:{'Authorization':'Bearer '+driveToken}}
  );
  if(!r.ok) return null;
  const d = await r.json();
  return (d.files && d.files.length) ? d.files[0].id : null;
}

async function _getBilanFolderId(){
  if(bilanFolderIdCache) return bilanFolderIdCache;
  let id = 'root';
  for(const part of ['onyx','NoteAir5c','Cahiers','clients']){
    id = await _driveFolderChild(id, part);
    if(!id) return null;
  }
  bilanFolderIdCache = id;
  return id;
}

async function uploadBilanTemplate(clientId){
  const c=clients[clientId];
  if(!c||!driveToken) return;
  const name=((c.first_name||'')+' '+(c.last_name||'')).trim()+'.pdf';

  const folderId=await _getBilanFolderId();
  if(!folderId){ showToast('Dossier Drive introuvable','error'); return; }

  let pdfBlob;
  try{
    const r=await fetch('/cabinet/bilan-template.pdf');
    if(!r.ok) throw new Error('HTTP '+r.status);
    pdfBlob=await r.blob();
  }catch(e){ showToast('Erreur chargement template : '+e.message,'error'); return; }

  try{
    const metadata=JSON.stringify({name, parents:[folderId]});
    const form=new FormData();
    form.append('metadata', new Blob([metadata],{type:'application/json'}));
    form.append('file', pdfBlob, name);
    const r=await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name',{
      method:'POST',
      headers:{'Authorization':'Bearer '+driveToken},
      body:form,
    });
    if(!r.ok) throw new Error('HTTP '+r.status);
    delete bilanFileCache[clientId];
    showToast('Fiche envoyée sur Drive : '+name);
    if(activeTab==='bilan') renderBilan();
  }catch(e){ showToast('Erreur upload Drive : '+e.message,'error'); }
}

async function runGlobalVerification(){
  if(!driveToken){ showToast('Connectez Google Drive d\'abord','error'); return; }

  showModal(`
    <div class="modal-head">
      <span class="modal-title">Vérification globale</span>
      <button class="btn-close" onclick="closeModal()">×</button>
    </div>
    <div id="verif-log" class="verif-log"></div>
    <div id="verif-footer" class="verif-footer">En cours…</div>`);

  const log=(msg,type='')=>{
    const el=document.getElementById('verif-log');if(!el)return;
    el.innerHTML+=`<div class="verif-entry${type?' verif-'+type:''}">${msg}</div>`;
    el.scrollTop=el.scrollHeight;
  };

  const stats={bilanOk:0,bilanSent:0,bilanErr:0,calCreated:0,calErr:0};
  const clientIds=Object.keys(clients);

  // ── 1. Bilans ─────────────────────────────────────────────────────────────
  log('<strong>Bilans tablette</strong>');
  const folderId=await _getBilanFolderId();
  if(!folderId){
    log('⚠ Dossier Drive introuvable (onyx/NoteAir5c/Cahiers/clients)','warn');
  } else {
    let templateBlob=null;
    try{ const r=await fetch('/cabinet/bilan-template.pdf'); if(r.ok) templateBlob=await r.blob(); }catch(_){}

    for(const clientId of clientIds){
      const c=clients[clientId];
      const name=((c.first_name||'')+' '+(c.last_name||'')).trim();
      delete bilanFileCache[clientId];
      const file=await findClientBilanFile(clientId);
      if(file){
        log(`✓ ${esc(name)}`,'ok');
        stats.bilanOk++;
      } else if(!templateBlob){
        log(`✗ ${esc(name)} — template introuvable`,'warn');
        stats.bilanErr++;
      } else {
        log(`↑ ${esc(name)} — envoi fiche vierge…`);
        try{
          const fileName=name+'.pdf';
          const form=new FormData();
          form.append('metadata',new Blob([JSON.stringify({name:fileName,parents:[folderId]})],{type:'application/json'}));
          form.append('file',templateBlob,fileName);
          const r=await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',{
            method:'POST',headers:{'Authorization':'Bearer '+driveToken},body:form,
          });
          if(!r.ok) throw new Error('HTTP '+r.status);
          delete bilanFileCache[clientId];
          log('&nbsp;&nbsp;✓ Envoyé','ok');
          stats.bilanSent++;
        }catch(e){
          log('&nbsp;&nbsp;✗ Erreur : '+e.message,'warn');
          stats.bilanErr++;
        }
      }
    }
  }

  // ── 2. Agenda ─────────────────────────────────────────────────────────────
  const calId=localStorage.getItem('gcal_calendar_id');
  log('');
  if(!calId){
    log('<strong>Agenda</strong> — calendrier non configuré, ignoré');
  } else {
    log('<strong>Agenda</strong>');
    const today=new Date().toISOString().slice(0,10);
    let anyPending=false;
    for(const clientId of clientIds){
      const c=clients[clientId];
      const name=((c.first_name||'')+' '+(c.last_name||'')).trim();
      const pending=(sessions[clientId]||[]).filter(s=>s.date>=today&&!s.google_event_id&&s.status!=='cancelled');
      for(const s of pending){
        anyPending=true;
        log(`↑ ${esc(name)} — ${s.date} ${s.heure}`);
        try{
          const r=await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events`,{
            method:'POST',
            headers:{'Authorization':'Bearer '+driveToken,'Content-Type':'application/json'},
            body:JSON.stringify(_gcalEventBodyForClient(clientId,s)),
          });
          if(!r.ok) throw new Error('HTTP '+r.status);
          const ev=await r.json();
          s.google_event_id=ev.id;
          s.google_event_link=ev.htmlLink;
          if(s.flex_id) await api('PUT','/api/cabinet/rendezvous/'+encodeURIComponent(s.flex_id),s);
          log('&nbsp;&nbsp;✓ Créé','ok');
          stats.calCreated++;
        }catch(e){
          log('&nbsp;&nbsp;✗ Erreur : '+e.message,'warn');
          stats.calErr++;
        }
      }
    }
    if(!anyPending) log('✓ Toutes les séances à venir sont synchronisées','ok');
  }

  // ── Résumé ────────────────────────────────────────────────────────────────
  const footer=document.getElementById('verif-footer');
  if(footer){
    const hasErr=stats.bilanErr||stats.calErr;
    footer.className='verif-footer '+(hasErr?'verif-footer-warn':'verif-footer-ok');
    footer.innerHTML=
      `Bilans : ${stats.bilanOk} OK · ${stats.bilanSent} envoyés · ${stats.bilanErr} erreur(s)`+
      (calId?` &nbsp;·&nbsp; Agenda : ${stats.calCreated} créé(s) · ${stats.calErr} erreur(s)`:'');
  }
  if(activeTab==='bilan') renderBilan();
}

async function findClientBilanFile(clientId){
  if(bilanFileCache[clientId] !== undefined) return bilanFileCache[clientId];
  if(!driveToken){ bilanFileCache[clientId] = null; return null; }
  const c = clients[clientId];
  if(!c){ bilanFileCache[clientId] = null; return null; }
  const folderId = await _getBilanFolderId();
  if(!folderId){ bilanFileCache[clientId] = null; return null; }
  const name = ((c.first_name||'')+' '+(c.last_name||'')).trim()+'.pdf';
  const q = `name='${name.replace(/'/g,"\\'")}' and '${folderId}' in parents and trashed=false`;
  try{
    const r = await fetch(
      'https://www.googleapis.com/drive/v3/files?q='+encodeURIComponent(q)+'&fields=files(id,name)',
      {headers:{'Authorization':'Bearer '+driveToken}}
    );
    if(!r.ok) throw new Error('HTTP '+r.status);
    const d = await r.json();
    const file = d.files && d.files.length ? d.files[0] : null;
    bilanFileCache[clientId] = file ? {fileId:file.id, name:file.name} : null;
    return bilanFileCache[clientId];
  }catch(e){
    bilanFileCache[clientId] = null;
    return null;
  }
}



// Returns the parsed JSON response on success, null on error.
async function api(method, path, body=null){
  try{
    const opts={method,headers:{'Content-Type':'application/json'}};
    if(body!==null) opts.body=JSON.stringify(body);
    const r=await fetch(path,opts);
    if(!r.ok){
      let msg='Erreur';
      try{const d=await r.json();msg=d.error||msg;}catch(_){}
      showToast(msg,'error');
      return null;
    }
    return await r.json();
  }catch(e){
    console.error('API error',method,path,e);
    showToast('Impossible de joindre le serveur','error');
    return null;
  }
}

function asPlainObject(value){
  if(value && typeof value === 'object' && !Array.isArray(value)) return value;
  if(Array.isArray(value)) return Object.assign({}, value);
  return {};
}

function showToast(message, type='info'){
  let host = document.getElementById('cabToastHost');
  if(!host){
    host = document.createElement('div');
    host.id = 'cabToastHost';
    host.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:9999;display:flex;flex-direction:column;gap:8px;max-width:360px;';
    document.body.appendChild(host);
  }

  const toast = document.createElement('div');
  const bg = type === 'error' ? '#a82626' : '#2f7a3f';
  toast.style.cssText = 'padding:10px 12px;border-radius:8px;color:#fff;font-size:12px;line-height:1.4;box-shadow:0 8px 20px rgba(0,0,0,.25);background:'+bg+';';
  toast.textContent = message;
  host.appendChild(toast);

  setTimeout(()=>{
    toast.style.opacity = '0';
    toast.style.transition = 'opacity .2s ease';
    setTimeout(()=>toast.remove(), 220);
  }, 2600);
}

function capitalize(text){
  const value = String(text || '');
  if(!value) return '';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function toMinuteCount(v){
  const n = parseInt(String(v || ''), 10);
  return Number.isFinite(n) && n > 0 ? n : 75;
}

function formatDurationForSms(minutes){
  const total = toMinuteCount(minutes);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if(h && m) return `${h}h${String(m).padStart(2,'0')}`;
  if(h) return `${h}h`;
  return `${m} min`;
}

function parseSessionDateTime(session){
  if(!session) return null;
  const iso = session.datetime || (session.date ? `${session.date}T${session.heure || '00:00'}` : '');
  if(!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getPreferredSession(clientId){
  const list = Array.isArray(sessions[clientId]) ? sessions[clientId].slice() : [];
  if(!list.length) return null;

  list.sort((a,b)=>{
    const ad = parseSessionDateTime(a);
    const bd = parseSessionDateTime(b);
    const at = ad ? ad.getTime() : 0;
    const bt = bd ? bd.getTime() : 0;
    return at - bt;
  });

  const now = Date.now();
  const upcoming = list.find(s=>{
    const dt = parseSessionDateTime(s);
    return dt && dt.getTime() >= now;
  });
  return upcoming || list[0] || null;
}

function formatSessionSlotForSms(session){
  const dt = parseSessionDateTime(session);
  if(!dt) return '';
  const dayLabel = dt.toLocaleDateString('fr-FR', {weekday:'long', day:'2-digit', month:'long'});
  const timeLabel = String(session.heure || dt.toTimeString().slice(0,5) || '').slice(0,5);
  return `${capitalize(dayLabel)} à ${timeLabel}`;
}

function getPreparationVisitLink(client, clientId){
  const rawId = client && client.grav_uuid ? client.grav_uuid : clientId;
  const cleanId = compactUuid(rawId);
  return cleanId ? `https://www.goubs.net/preparons-votre-visite/id:${cleanId}` : 'https://www.goubs.net/preparons-votre-visite/';
}

function buildPreparationSms(clientId){
  const client = clients[clientId] || null;
  const name = client ? `${String(client.first_name || '').trim()} ${String(client.last_name || '').trim()}`.trim() : '';
  const greeting = name ? `Bonjour ${name},` : 'Bonjour,';
  const session = client ? getPreferredSession(clientId) : null;
  const sessionLabel = formatSessionSlotForSms(session);
  const durationLabel = session ? formatDurationForSms(session.duree) : '1h15';
  const link = getPreparationVisitLink(client, clientId);

  return `${greeting}

Afin de préparer notre première séance${sessionLabel ? ` de ${sessionLabel}` : ''}.
Je vous partage ce lien: ${link}

📍 60 chemin du Val Fleuri 🔐 Code portillon : 2507A 🏢 Bât B6 appt 08, 3ème étage, porte de gauche (à droite de la piscine)
⏱️ Durée : ${durationLabel} - Tarif : 75€ 👕 Tenue : vêtements souples, chaussettes propres

À bientôt, Nicolas
Le shiatsu est une approche d'accompagnement au bien-être qui ne se substitue pas à un traitement médical.`;
}

function updatePreparationSms(){
  const area = document.getElementById('smsPreparationMessage');
  if(!area) return;
  area.value = buildPreparationSms(activeId || '');
}

async function copyPreparationSms(){
  const area = document.getElementById('smsPreparationMessage');
  if(!area){
    showToast('Template SMS introuvable','error');
    return;
  }

  const text = area.value || '';
  if(!text.trim()){
    showToast('Message vide','error');
    return;
  }

  try{
    if(navigator.clipboard && window.isSecureContext){
      await navigator.clipboard.writeText(text);
    } else {
      area.focus();
      area.select();
      document.execCommand('copy');
      area.setSelectionRange(0, 0);
      area.blur();
    }
    showToast('Message SMS copié');
  }catch(_){
    showToast('Copie impossible', 'error');
  }
}


// ── Google Docs cliniques ────────────────────────────────────────────────────

const ANAMN_TEMPLATE = (prenom, nom) => `QUESTIONNAIRE D'ANAMNÈSE
Nicolas Goubaux — Médiateur de bien-être intérieur
Client : ${prenom} ${nom}
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

const BILAN_TEMPLATE = (prenom, nom) => `BILAN — ${prenom} ${nom}
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

async function createDoc(name, content){
  if(!driveToken){alert('Connectez Google Docs d\'abord (bouton en bas de la liste).');return null;}
  setDriveStatus('loading','Création du document…');
  try{
    // 1. Créer le fichier Google Doc vide
    const r1=await fetch('https://www.googleapis.com/drive/v3/files',{
      method:'POST',
      headers:{'Authorization':'Bearer '+driveToken,'Content-Type':'application/json'},
      body:JSON.stringify({name,mimeType:'application/vnd.google-apps.document'})
    });
    if(!r1.ok) throw new Error('Création échouée');
    const doc=await r1.json();

    // 2. Insérer le contenu template via Docs API
    await fetch('https://docs.googleapis.com/v1/documents/'+doc.id+':batchUpdate',{
      method:'POST',
      headers:{'Authorization':'Bearer '+driveToken,'Content-Type':'application/json'},
      body:JSON.stringify({requests:[{insertText:{location:{index:1},text:content}}]})
    });

    setDriveStatus('ok','Document créé');
    return doc.id;
  }catch(e){
    setDriveStatus('error','Erreur : '+e.message);
    return null;
  }
}

function openGDoc(docId){
  window.open('https://docs.google.com/document/d/'+docId+'/edit','_blank');
}

async function handleAnamneseDoc(clientId){
  const c=clients[clientId];
  if(c.gdoc_anamn_id){openGDoc(c.gdoc_anamn_id);return;}
  const id=await createDoc('Anamnèse — '+c.first_name+' '+c.last_name, ANAMN_TEMPLATE(c.first_name,c.last_name));
  if(id){clients[clientId].gdoc_anamn_id=id;await api('PUT','/api/cabinet/clients/'+encodeURIComponent(clientId),clients[clientId]);renderMain();}
}

async function handleBilanDoc(clientId){
  const c=clients[clientId];
  if(c.gdoc_bilan_id){openGDoc(c.gdoc_bilan_id);return;}
  const id=await createDoc('Bilan — '+c.first_name+' '+c.last_name, BILAN_TEMPLATE(c.first_name,c.last_name));
  if(id){clients[clientId].gdoc_bilan_id=id;await api('PUT','/api/cabinet/clients/'+encodeURIComponent(clientId),clients[clientId]);renderMain();}
}
function openDriveSettings(){
  const cid=localStorage.getItem('gdrive_client_id')||'';
  const calId=localStorage.getItem('gcal_calendar_id')||'';
  showModal(`
    <div class="modal-head">
      <span class="modal-title">Configuration Google</span>
      <button class="btn-close" onclick="closeModal()">×</button>
    </div>
    <div class="internal-badge">Ces paramètres sont stockés sur cet appareil uniquement</div>
    <div class="field-grid">
      <div class="field field-full">
        <label>Google OAuth2 Client ID</label>
        <input id="cfg_cid" value="${esc(cid)}" placeholder="xxxx.apps.googleusercontent.com">
        <span style="font-size:11px;color:#666;margin-top:4px">
          Google Cloud Console → APIs → Drive API → Identifiants → Client OAuth 2.0<br>
          Origine autorisée : <strong>https://goubs.net</strong>
        </span>
      </div>
      <div class="field field-full">
        <label>Identifiant du calendrier Google</label>
        <input id="cfg_cal_id" value="${esc(calId)}" placeholder="xxxx@group.calendar.google.com">
        <span style="font-size:11px;color:#666;margin-top:4px">
          Paramètres du calendrier → « Adresse de l'agenda ». Laisser vide pour désactiver la sync.
        </span>
      </div>
    </div>
    <button class="btn-save" onclick="saveDriveSettings()">Enregistrer et connecter</button>`);
}

function saveDriveSettings(){
  const cid=document.getElementById('cfg_cid').value.trim();
  if(!cid){alert('Client ID requis');return;}
  localStorage.setItem('gdrive_client_id',cid);
  const calId=document.getElementById('cfg_cal_id').value.trim();
  if(calId) localStorage.setItem('gcal_calendar_id',calId);
  else localStorage.removeItem('gcal_calendar_id');
  closeModal();
  if(gapiReady) initTokenClient(cid);
  driveAuth();
}

// ─── Google Calendar ─────────────────────────────────────────────────────────

function _gcalEventBodyForClient(clientId, session){
  const c=clients[clientId]||{};
  const title=((c.first_name||'')+' '+(c.last_name||'')).trim();
  const date=session.date;
  const heure=session.heure||'09:00';
  const duree=Math.max(1,parseInt(session.duree||'60',10)||60);
  const startDt=`${date}T${heure}:00`;
  const endDate=new Date(`${date}T${heure}:00`);
  endDate.setMinutes(endDate.getMinutes()+duree);
  const endDt=endDate.toISOString().slice(0,19);
  const descParts=[];
  if(session.motif)       descParts.push(session.motif);
  if(session.observations)descParts.push('Observations : '+session.observations);
  if(session.exercices)   descParts.push('Exercices : '+session.exercices);
  if(session.prochaine)   descParts.push('Prochaine séance : '+session.prochaine);
  return {
    summary:title,
    description:descParts.join('\n'),
    start:{dateTime:startDt,timeZone:'Europe/Paris'},
    end:  {dateTime:endDt,  timeZone:'Europe/Paris'},
  };
}

function _gcalEventBody(session){
  const c=clients[activeId]||{};
  const title=(c.first_name||'')+' '+(c.last_name||'');
  const date=session.date;
  const heure=session.heure||'09:00';
  const duree=Math.max(1,parseInt(session.duree||'60',10)||60);
  const startDt=`${date}T${heure}:00`;
  const endDate=new Date(`${date}T${heure}:00`);
  endDate.setMinutes(endDate.getMinutes()+duree);
  const endDt=endDate.toISOString().slice(0,19);
  const descParts=[];
  if(session.motif)       descParts.push(session.motif);
  if(session.observations)descParts.push('Observations : '+session.observations);
  if(session.exercices)   descParts.push('Exercices : '+session.exercices);
  if(session.prochaine)   descParts.push('Prochaine séance : '+session.prochaine);
  return {
    summary: title.trim(),
    description: descParts.join('\n'),
    start:{dateTime:startDt,timeZone:'Europe/Paris'},
    end:  {dateTime:endDt,  timeZone:'Europe/Paris'},
  };
}

async function gcalCreateEvent(session){
  const calId=localStorage.getItem('gcal_calendar_id');
  if(!calId||!driveToken) return null;
  try{
    const r=await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events`,{
      method:'POST',
      headers:{'Authorization':'Bearer '+driveToken,'Content-Type':'application/json'},
      body:JSON.stringify(_gcalEventBody(session)),
    });
    if(!r.ok) throw new Error('HTTP '+r.status);
    const ev=await r.json();
    return {id:ev.id, htmlLink:ev.htmlLink};
  }catch(e){
    showToast('Sync calendrier échouée : '+e.message,'error');
    return null;
  }
}

async function gcalUpdateEvent(eventId, session){
  const calId=localStorage.getItem('gcal_calendar_id');
  if(!calId||!driveToken||!eventId) return;
  try{
    const r=await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events/${encodeURIComponent(eventId)}`,{
      method:'PUT',
      headers:{'Authorization':'Bearer '+driveToken,'Content-Type':'application/json'},
      body:JSON.stringify(_gcalEventBody(session)),
    });
    if(!r.ok) throw new Error('HTTP '+r.status);
  }catch(e){
    showToast('Mise à jour calendrier échouée : '+e.message,'error');
  }
}

// ─── Intégration Grav ────────────────────────────────────────────────────────

async function searchGravContact(clientId){
  const c=clients[clientId];
  const dotEl=document.getElementById('grav_dot_'+clientId);
  const statusEl=document.getElementById('grav_status_'+clientId);
  const btnEl=document.getElementById('grav_btn_'+clientId);
  if(dotEl)dotEl.className='grav-dot searching';
  if(statusEl)statusEl.textContent='Recherche en cours…';
  if(btnEl)btnEl.disabled=true;

  const params=new URLSearchParams();
  if(c.email)params.set('email',c.email);
  params.set('first_name',c.first_name||'');
  params.set('last_name',c.last_name||'');

  try{
    const res=await fetch('/api/contacts/search?'+params,{headers:{'Accept':'application/json'}});
    if(!res.ok)throw new Error('HTTP '+res.status);
    const data=await res.json();
    if(data.found&&data.uuid){
      clients[clientId].grav_uuid=compactUuid(data.uuid);
      if(data.rdv)clients[clientId].grav_rdv=data.rdv;
      await api('PUT','/api/cabinet/clients/'+encodeURIComponent(clientId),clients[clientId]);
      renderMain();
    } else {
      if(dotEl)dotEl.className='grav-dot';
      if(statusEl)statusEl.textContent='Aucun contact trouvé sur Grav';
      if(btnEl)btnEl.disabled=false;
    }
  }catch(e){
    if(dotEl)dotEl.className='grav-dot';
    if(statusEl)statusEl.textContent='Erreur : '+e.message;
    if(btnEl)btnEl.disabled=false;
  }
}


function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,6);}

function compactUuid(value){
  return String(value || '').replace(/-/g, '');
}

function uuidv4(){
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return compactUuid(crypto.randomUUID());
  }

  return 'xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

function renderList(){
  const q=(document.getElementById('searchInput').value||'').toLowerCase();
  const el=document.getElementById('clientList');
  const ids=Object.keys(clients).filter(id=>(clients[id].last_name+' '+clients[id].first_name+' '+(clients[id].motif||'')).toLowerCase().includes(q))
    .sort((a,b)=>clients[b].created-clients[a].created);
  if(!ids.length){el.innerHTML='<div style="padding:16px;text-align:center;font-size:12px;color:var(--color-text-secondary,#666)">Aucun client</div>';return;}
  el.innerHTML=ids.map(id=>{
    const c=clients[id],nb=(sessions[id]||[]).length;
    return `<div class="client-item${activeId===id?' active':''}" onclick="selectClient('${id}')">
      <div class="client-name">${esc(c.first_name)} ${esc(c.last_name)}</div>
      <div class="client-meta">${esc(c.motif||'—')}</div>
      ${nb?`<div class="client-badge">${nb} séance${nb>1?'s':''}</div>`:''}
    </div>`;
  }).join('');
}

function selectClient(id){activeId=id;activeTab='fiche';delete bilanFileCache[id];renderList();renderMain();updatePreparationSms();}

function renderMain(){
  const el=document.getElementById('mainArea');
  if(!activeId){el.innerHTML='<div class="empty-state"><div style="font-size:13px">Sélectionnez un client</div></div>';updatePreparationSms();return;}
  const ss=sessions[activeId]||[];
  el.innerHTML=`
    <div class="main-tabs">
      <div class="tab${activeTab==='fiche'?' active':''}" data-tab="fiche" onclick="setTab('fiche')">Fiche client</div>
      <div class="tab${activeTab==='seances'?' active':''}" data-tab="seances" onclick="setTab('seances')">Séances (${ss.length})</div>
      <div class="tab${activeTab==='bilan'?' active':''}" data-tab="bilan" onclick="setTab('bilan')">Bilan</div>
    </div>
    <div class="main-body" id="mainBody"></div>`;
  renderTab();
  updatePreparationSms();
}

function setTab(t){
  activeTab=t;
  document.querySelectorAll('.main-tabs .tab').forEach(tab=>{
    tab.classList.toggle('active', tab.dataset.tab===t);
  });
  renderTab();
  if(t==='fiche') updatePreparationSms();
}

function renderTab(){
  const el=document.getElementById('mainBody');if(!el)return;
  if(activeTab==='fiche')el.innerHTML=renderFiche();
  else if(activeTab==='seances')el.innerHTML=renderSeances();
  else renderBilan();
}

function renderFiche(){
  const c=clients[activeId],ss=sessions[activeId]||[];
  const last=ss.length?ss[ss.length-1].date:'—';
  return `
    <div class="stats-row">
      <div class="stat-card"><div class="stat-n">${ss.length}</div><div class="stat-l">Séances</div></div>
      <div class="stat-card"><div class="stat-n" style="font-size:14px">${last}</div><div class="stat-l">Dernière séance</div></div>
      <div class="stat-card"><div class="stat-n" style="font-size:14px">${c.created?new Date(c.created).toLocaleDateString('fr-FR'):'-'}</div><div class="stat-l">Dossier créé</div></div>
    </div>
    <div class="section-label">Identité</div>
    <div class="field-grid">
      <div class="field"><label>Prénom</label><input id="f_first_name" value="${esc(c.first_name||'')}"></div>
      <div class="field"><label>Nom</label><input id="f_last_name" value="${esc(c.last_name||'')}"></div>
      <div class="field"><label>Date de naissance</label><input id="f_ddn" type="date" value="${c.ddn||''}"></div>
      <div class="field"><label>Téléphone</label><input id="f_phone" value="${esc(c.phone||'')}"></div>
      <div class="field field-full"><label>Email</label><input id="f_email" value="${esc(c.email||'')}"></div>
    </div>
    <div class="section-label">Motif & contexte</div>
    <div class="field-grid">
      <div class="field field-full"><label>Motif de consultation</label><input id="f_motif" value="${esc(c.motif||'')}"></div>
      <div class="field field-full"><label>Antécédents & contexte de santé</label><textarea id="f_antecedents">${esc(c.antecedents||'')}</textarea></div>
      <div class="field field-full"><label>Notes praticien (internes)</label><textarea id="f_notes">${esc(c.notes||'')}</textarea></div>
    </div>
    <div style="display:flex;gap:10px;align-items:center">
      <button class="btn-save" onclick="saveFiche()">Enregistrer</button>
      <button class="btn-ghost" onclick="deleteClient()">Supprimer le dossier</button>
    </div>

    <div style="margin-top:20px">
      <div class="section-label">Lien Grav · Préparez votre visite</div>
      <div class="grav-section">
        <div class="grav-section-title">
          <div class="grav-dot${c.grav_uuid?' found':''}" id="grav_dot_${activeId}"></div>
          <span id="grav_status_${activeId}">${c.grav_uuid?'Contact Grav lié':'Non lié à un contact Grav'}</span>
          ${!c.grav_uuid?`<button class="btn-grav" id="grav_btn_${activeId}" onclick="searchGravContact('${activeId}')">Rechercher sur Grav</button>`:''}
        </div>
        ${c.grav_uuid?`
          <div class="obs-label">UUID</div>
          <div class="grav-uuid-display">${esc(c.grav_uuid)}</div>
          ${c.grav_rdv?`<div class="obs-label" style="margin-top:8px">Premier RDV enregistré</div><div style="font-size:13px">${esc(c.grav_rdv)}</div>`:''}
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
            <a class="grav-link" href="/preparons-votre-visite/id:${esc(c.grav_uuid)}" target="_blank">
              Ouvrir la page client →
            </a>
            <button class="btn-ghost" style="font-size:12px" onclick="unlinkGrav('${activeId}')">Délier</button>
          </div>`:`
          <div style="font-size:12px;color:var(--color-text-secondary,#666);margin-top:6px">
            La recherche utilise l'email du client en priorité, puis le nom et prénom.<br>
            Configurez l'URL et la clé API via ⚙ si ce n'est pas encore fait.
          </div>`}

        <div class="sms-template" id="smsTemplateSection" style="margin-top:12px">
          <div class="sms-template-head">
            <span>SMS préparation visite</span>
            <button class="btn-ghost sms-copy-btn" id="smsCopyBtn" onclick="copyPreparationSms()">Copier</button>
          </div>
          <textarea id="smsPreparationMessage" readonly></textarea>
        </div>
      </div>
    </div>`;
}

async function unlinkGrav(clientId){
  if(!confirm('Délier ce client de son contact Grav ?'))return;
  delete clients[clientId].grav_uuid;
  delete clients[clientId].grav_rdv;
  const ok=await api('PUT','/api/cabinet/clients/'+encodeURIComponent(clientId),clients[clientId]);
  if(ok) renderMain();
}

async function saveFiche(){
  const c=clients[activeId];
  if(!c.grav_uuid) c.grav_uuid = compactUuid(activeId);
  else c.grav_uuid = compactUuid(c.grav_uuid);
  ['first_name','last_name','ddn','phone','email','motif','antecedents','notes'].forEach(k=>{
    const el=document.getElementById('f_'+k);if(el)c[k]=el.value;
  });
  const ok=await api('PUT','/api/cabinet/clients/'+encodeURIComponent(activeId),c);
  if(ok){renderList();renderMain();}
}

function renderSeances(){
  const ss=(sessions[activeId]||[]).slice().reverse();
  return `
    <div class="sessions-head">
      <div class="section-label" style="margin:0">Historique des séances</div>
      <button class="btn-add" onclick="openNewSession()">+ Séance</button>
    </div>
    ${!ss.length?'<div class="no-sessions">Aucune séance enregistrée</div>':
    ss.map(s=>`
      <div class="session-card">
        <div class="session-card-head" onclick="toggleSession('${s.id}')">
          <div>
            <div class="session-date">${s.date}${s.heure?' · '+s.heure:''}${s.duree?' · '+s.duree+' min':''}</div>
            <div class="session-motif">${esc(s.motif||'—')}</div>
            <div class="client-meta">${esc(s.status||'scheduled')} · ${esc(s.appointment_type||'shiatsu_futon')}</div>
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            ${s.google_event_link?`<a class="gcal-link" href="${s.google_event_link}" target="_blank" rel="noopener" onclick="event.stopPropagation()" title="Ouvrir dans Google Calendar">Cal</a>`:''}
            <button class="btn-ghost" style="font-size:12px;padding:4px 8px" onclick="event.stopPropagation();openEditSession('${s.id}')">✎</button>
            <button class="delete-btn" onclick="event.stopPropagation();deleteSession('${s.id}')">✕</button>
          </div>
        </div>
        <div class="session-card-body${openSessions[s.id]?' open':''}" id="sb_${s.id}">
          <div class="session-body-tabs">
            <div class="stab${!openSessions[s.id+'_tab']||openSessions[s.id+'_tab']==='clinique'?' active':''}" onclick="setSessionTab('${s.id}','clinique')">Clinique</div>
            <div class="stab${openSessions[s.id+'_tab']==='energetique'?' active':''}" onclick="setSessionTab('${s.id}','energetique')">Bilan</div>
          </div>
          <div id="stab_${s.id}">
            ${renderSessionClinique(s)}
          </div>
        </div>
      </div>`).join('')}`;
}

function renderSessionClinique(s){
  return `
    ${s.observations?`<div class="obs-label">Observations</div><div class="obs-text">${esc(s.observations)}</div>`:''}
    ${s.exercices?`<div class="obs-label">Exercices transmis</div><div style="margin-top:4px">${s.exercices.split(',').map(e=>`<span class="pill-ex">${esc(e.trim())}</span>`).join('')}</div>`:''}
    ${s.prochaine?`<div class="obs-label">Intention prochaine séance</div><div class="obs-text">${esc(s.prochaine)}</div>`:''}
    ${!s.observations&&!s.exercices&&!s.prochaine?'<div style="font-size:12px;color:var(--color-text-secondary,#666)">Aucune note clinique</div>':''}`;
}

function renderSessionEnergetique(s){
  const b=s.bilan||{};
  const hasMer=MERIDIANS.some(m=>b[m.id]);
  return `
    <div class="internal-badge">Usage interne — non communiqué au client</div>
    <div class="section-label">État des méridiens</div>
    ${!hasMer&&!b.synthese_mtc?'<div style="font-size:12px;color:var(--color-text-secondary,#666);margin-bottom:12px">Aucun bilan enregistré pour cette séance</div>':''}
    ${hasMer?`<div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:12px">
      ${MERIDIANS.filter(m=>b[m.id]).map(m=>`
        <span style="font-size:12px;color:var(--color-text-secondary,#666)">${m.name} : </span>
        <span class="energie-chip ${STATE_CLASS[b[m.id]||'']}">${STATES.find(s=>s.val===b[m.id])?.label||'—'}</span>
      `).join('')}
    </div>`:''}
    ${b.element_dominant?`<div class="obs-label">Élément dominant</div><div class="obs-text" style="margin-bottom:8px">${esc(b.element_dominant)}</div>`:''}
    ${b.synthese_mtc?`<div class="obs-label">Synthèse MTC</div><div class="obs-text" style="margin-bottom:8px">${esc(b.synthese_mtc)}</div>`:''}
    ${b.prise_en_charge?`<div class="obs-label">Points / zones travaillés</div><div class="obs-text" style="margin-bottom:8px">${esc(b.prise_en_charge)}</div>`:''}
    ${b.evolution?`<div class="obs-label">Évolution perçue vs séance précédente</div><div class="obs-text">${esc(b.evolution)}</div>`:''}
  `;
}

function setSessionTab(sid,tab){
  openSessions[sid+'_tab']=tab;
  const el=document.getElementById('stab_'+sid);
  if(!el)return;
  const s=(sessions[activeId]||[]).find(x=>x.id===sid);
  if(!s)return;
  el.innerHTML=tab==='clinique'?renderSessionClinique(s):renderSessionEnergetique(s);
  document.querySelectorAll(`#sb_${sid} .stab`).forEach((el,i)=>{
    el.classList.toggle('active',(i===0&&tab==='clinique')||(i===1&&tab==='energetique'));
  });
}

function toggleSession(id){
  openSessions[id]=!openSessions[id];
  const el=document.getElementById('sb_'+id);
  if(el)el.classList.toggle('open',!!openSessions[id]);
}

async function renderBilan(){
  const el=document.getElementById('mainBody');
  if(!el) return;
  // Affichage immédiat avec "Recherche…"
  el.innerHTML=_renderBilanHtml(null,'loading');
  const file=await findClientBilanFile(activeId);
  // Vérifier que le tab est toujours actif
  if(document.getElementById('mainBody')===el && activeTab==='bilan')
    el.innerHTML=_renderBilanHtml(file,'ready');
}

function _renderBilanHtml(file, state){
  const c=clients[activeId]||{};
  const name=((c.first_name||'')+' '+(c.last_name||'')).trim();
  const expectedFile=name+'.pdf';

  let pdfSection;
  if(!driveToken){
    pdfSection=`<div class="bilan-pdf-notice">Connectez Google Drive pour afficher le bilan tablette.</div>`;
  } else if(state==='loading'){
    pdfSection=`<div class="bilan-pdf-notice">Recherche du bilan tablette…</div>`;
  } else if(file){
    pdfSection=`
      <div class="bilan-pdf-section">
        <div class="bilan-pdf-header">
          <span class="section-label" style="margin:0">Bilan tablette</span>
          <a href="https://drive.google.com/file/d/${file.fileId}/view" target="_blank" class="btn-ghost" style="font-size:11px;padding:4px 10px">Ouvrir dans Drive ↗</a>
        </div>
        <div class="bilan-pdf-viewer">
          <iframe src="https://drive.google.com/file/d/${file.fileId}/preview" frameborder="0" allowfullscreen loading="lazy"></iframe>
        </div>
      </div>`;
  } else {
    pdfSection=driveToken
      ?`<div class="bilan-pdf-notice bilan-pdf-missing">
          Aucun bilan tablette pour <strong>${esc(name)}</strong>.<br>
          <span style="font-size:11px">Fichier attendu : <code>${esc(expectedFile)}</code></span>
          <div style="margin-top:10px">
            <button class="btn-ghost" style="font-size:12px" onclick="uploadBilanTemplate('${activeId}')">Envoyer la fiche vierge sur Drive →</button>
          </div>
        </div>`
      :`<div class="bilan-pdf-notice">Connectez Google Drive pour afficher le bilan tablette.</div>`;
  }

  const ss=(sessions[activeId]||[]).filter(s=>s.bilan&&Object.keys(s.bilan).length>0).sort((a,b)=>a.date.localeCompare(b.date));
  return pdfSection+`
    <div class="evolution-header" style="margin-top:20px">
      <div class="section-label" style="margin:0">Évolution énergétique</div>
      <div class="internal-badge" style="margin:0">Usage interne uniquement</div>
    </div>
    ${!ss.length?`<div class="no-sessions">Aucun bilan enregistré.<br><span style="font-size:12px">Ajoutez un bilan dans l'onglet Séances → sous-onglet "Bilan".</span></div>`:`
    <div class="mer-legend">
      ${Object.entries(STATE_CLASS).filter(([k])=>k).map(([k,cls])=>`<span class="energie-chip ${cls}">${STATES.find(s=>s.val===k)?.label||k}</span>`).join('')}
    </div>
    <div class="bilan-timeline">
      ${ss.map(s=>{
        const b=s.bilan||{};
        const activeMer=MERIDIANS.filter(m=>b[m.id]);
        return `<div class="timeline-item">
          <div class="timeline-date">${s.date}${s.motif?' · '+esc(s.motif):''}</div>
          ${activeMer.length?`<div class="timeline-chips">
            ${activeMer.map(m=>`<span class="energie-chip ${STATE_CLASS[b[m.id]||'']}" title="${m.name}">${m.id} <span style="font-weight:500">${m.name}</span></span>`).join('')}
          </div>`:''}
          ${b.element_dominant?`<div style="font-size:11px;color:var(--color-text-secondary,#666);margin-bottom:4px">Élément : <strong>${esc(b.element_dominant)}</strong></div>`:''}
          ${b.synthese_mtc?`<div class="timeline-synth">${esc(b.synthese_mtc)}</div>`:''}
          ${b.evolution?`<div style="font-size:12px;color:var(--color-text-secondary,#666);margin-top:6px;font-style:italic">${esc(b.evolution)}</div>`:''}
        </div>`;
      }).join('')}
    </div>`}`;
}

function _sessionModalHtml(s){
  const b=s?.bilan||{};
  const today=new Date().toISOString().slice(0,10);
  const isEdit=!!s;
  const statusOpts=[['scheduled','Planifié'],['confirmed','Confirmé'],['completed','Terminé'],['cancelled','Annulé']];
  const typeOpts=[['shiatsu_futon','Shiatsu futon'],['shiatsu_chair','Shiatsu chair'],['sophrologie','Sophrologie']];
  const elementOpts=['','Bois','Feu','Terre','Métal','Eau'];
  return `
    <div class="modal-head">
      <span class="modal-title">${isEdit?'Modifier la séance':'Nouvelle séance'}</span>
      <button class="btn-close" onclick="closeModal()">×</button>
    </div>

    <div style="display:flex;gap:0;margin-bottom:18px;border:0.5px solid var(--color-border-tertiary,#e2e2e2);border-radius:8px;overflow:hidden">
      <div id="mtab_clinique" class="stab active" onclick="switchModalTab('clinique')" style="flex:1;text-align:center">Clinique</div>
      <div id="mtab_energetique" class="stab" onclick="switchModalTab('energetique')" style="flex:1;text-align:center">Bilan</div>
    </div>

    <div id="modal_clinique">
      <div class="field-grid">
        <div class="field"><label>Date</label><input id="s_date" type="date" value="${s?.date||today}"></div>
        <div class="field"><label>Heure</label><input id="s_heure" type="time" value="${s?.heure||'09:00'}"></div>
        <div class="field"><label>Durée (min)</label><input id="s_duree" type="number" value="${s?.duree||'60'}" min="1" step="5" placeholder="60"></div>
        <div class="field"><label>Statut</label>
          <select id="s_status">${statusOpts.map(([v,l])=>`<option value="${v}"${(s?.status||'scheduled')===v?' selected':''}>${l}</option>`).join('')}</select>
        </div>
        <div class="field"><label>Type</label>
          <select id="s_appointment_type">${typeOpts.map(([v,l])=>`<option value="${v}"${(s?.appointment_type||'shiatsu_futon')===v?' selected':''}>${l}</option>`).join('')}</select>
        </div>
        <div class="field field-full"><label>Motif de la séance</label><input id="s_motif" value="${esc(s?.motif||'')}" placeholder="ex: douleur lombaire, stress..."></div>
        <div class="field field-full"><label>Observations cliniques</label><textarea id="s_obs" placeholder="Zones travaillées, réactions, état général...">${esc(s?.observations||'')}</textarea></div>
        <div class="field field-full"><label>Exercices transmis (séparés par virgule)</label><input id="s_ex" value="${esc(s?.exercices||'')}" placeholder="ex: étirement mollet, auto-massage balle"></div>
        <div class="field field-full"><label>Intention pour la prochaine séance</label><input id="s_prochaine" value="${esc(s?.prochaine||'')}"></div>
      </div>
    </div>

    <div id="modal_energetique" style="display:none">
      <div class="internal-badge">Usage interne — non communiqué au client</div>
      <div class="section-label">État des méridiens</div>
      <div class="meridian-grid">
        ${MERIDIANS.map(m=>`
          <div class="mer-item">
            <div class="mer-name">${m.name}</div>
            <select class="mer-select" id="mer_${m.id}">
              ${STATES.map(st=>`<option value="${st.val}"${b[m.id]===st.val?' selected':''}>${st.label}</option>`).join('')}
            </select>
          </div>`).join('')}
      </div>
      <div class="field-grid">
        <div class="field"><label>Élément dominant</label>
          <select id="s_element">${elementOpts.map(v=>`<option value="${v}"${(b.element_dominant||'')===v?' selected':''}>${v||'—'}</option>`).join('')}</select>
        </div>
        <div class="field"><label>Évolution vs séance précédente</label><input id="s_evolution" value="${esc(b.evolution||'')}" placeholder="Amélioration, stagnation..."></div>
        <div class="field field-full"><label>Synthèse MTC</label><textarea id="s_synthese_mtc" placeholder="Lecture énergétique globale, déséquilibres principaux...">${esc(b.synthese_mtc||'')}</textarea></div>
        <div class="field field-full"><label>Points / zones travaillés</label><textarea id="s_prise_en_charge" placeholder="Points utilisés, techniques appliquées...">${esc(b.prise_en_charge||'')}</textarea></div>
      </div>
    </div>

    <button class="btn-save" onclick="${isEdit?`updateSession('${s.id}')`:'saveSession()'}">${isEdit?'Mettre à jour':'Enregistrer la séance'}</button>`;
}

function openNewSession(){
  showModal(_sessionModalHtml(null));
}

function openEditSession(sid){
  const s=(sessions[activeId]||[]).find(x=>x.id===sid);
  if(!s)return;
  showModal(_sessionModalHtml(s));
}

async function updateSession(sid){
  const list=sessions[activeId]||[];
  const idx=list.findIndex(x=>x.id===sid);
  if(idx===-1)return;
  const s=list[idx];
  if(!s.flex_id){showToast('Séance sans flex_id — impossible de modifier','error');return;}

  const bilan={};
  MERIDIANS.forEach(m=>{const v=document.getElementById('mer_'+m.id)?.value;if(v)bilan[m.id]=v;});
  const el=document.getElementById('s_element')?.value;if(el)bilan.element_dominant=el;
  const ev=document.getElementById('s_evolution')?.value;if(ev)bilan.evolution=ev;
  const sy=document.getElementById('s_synthese_mtc')?.value;if(sy)bilan.synthese_mtc=sy;
  const pc=document.getElementById('s_prise_en_charge')?.value;if(pc)bilan.prise_en_charge=pc;
  const date=document.getElementById('s_date')?.value||'';
  const heure=document.getElementById('s_heure')?.value||'00:00';

  const updated={
    ...s,
    date,heure,
    datetime:date?`${date}T${heure}`:'',
    duree:String(Math.max(1,parseInt(document.getElementById('s_duree')?.value||'60',10)||60)),
    status:document.getElementById('s_status')?.value||s.status,
    appointment_type:document.getElementById('s_appointment_type')?.value||s.appointment_type,
    motif:document.getElementById('s_motif')?.value||'',
    observations:document.getElementById('s_obs')?.value||'',
    exercices:document.getElementById('s_ex')?.value||'',
    prochaine:document.getElementById('s_prochaine')?.value||'',
    bilan:Object.keys(bilan).length?bilan:null,
  };
  if(!updated.date){showToast('La date est requise','error');return;}

  const ok=await api('PUT','/api/cabinet/rendezvous/'+encodeURIComponent(s.flex_id),updated);
  if(!ok){showToast('Modification échouée','error');return;}

  if(updated.google_event_id){
    await gcalUpdateEvent(updated.google_event_id, updated);
  }else{
    const gcalResult=await gcalCreateEvent(updated);
    if(gcalResult){
      updated.google_event_id=gcalResult.id;
      updated.google_event_link=gcalResult.htmlLink;
      await api('PUT','/api/cabinet/rendezvous/'+encodeURIComponent(s.flex_id),updated);
    }
  }

  list[idx]=updated;
  closeModal();
  renderMain();
}

function switchModalTab(tab){
  document.getElementById('modal_clinique').style.display=tab==='clinique'?'block':'none';
  document.getElementById('modal_energetique').style.display=tab==='energetique'?'block':'none';
  document.getElementById('mtab_clinique').classList.toggle('active',tab==='clinique');
  document.getElementById('mtab_energetique').classList.toggle('active',tab==='energetique');
}

async function saveSession(){
  if(!activeId){showToast('Veuillez sélectionner un client','error');return;}
  if(!sessions[activeId])sessions[activeId]=[];
  const bilan={};
  MERIDIANS.forEach(m=>{const v=document.getElementById('mer_'+m.id)?.value;if(v)bilan[m.id]=v;});
  const el=document.getElementById('s_element')?.value;if(el)bilan.element_dominant=el;
  const ev=document.getElementById('s_evolution')?.value;if(ev)bilan.evolution=ev;
  const sy=document.getElementById('s_synthese_mtc')?.value;if(sy)bilan.synthese_mtc=sy;
  const pc=document.getElementById('s_prise_en_charge')?.value;if(pc)bilan.prise_en_charge=pc;
  const date=document.getElementById('s_date')?.value||'';
  const heure=document.getElementById('s_heure')?.value||'00:00';
  const sessionData={
    id:uid(),
    client_id:activeId,
    date:date,
    heure:heure,
    datetime:date?`${date}T${heure}`:'',
    duree:String(Math.max(1,parseInt(document.getElementById('s_duree')?.value||'60',10)||60)),
    status:document.getElementById('s_status')?.value||'scheduled',
    appointment_type:document.getElementById('s_appointment_type')?.value||'shiatsu_futon',
    motif:document.getElementById('s_motif')?.value||'',
    observations:document.getElementById('s_obs')?.value||'',
    exercices:document.getElementById('s_ex')?.value||'',
    prochaine:document.getElementById('s_prochaine')?.value||'',
    bilan:Object.keys(bilan).length?bilan:null,
  };
  if(!sessionData.date){showToast('La date est requise','error');return;}

  const result=await api('POST','/api/cabinet/rendezvous',sessionData);
  if(!result){
    showToast('Enregistrement de la séance échoué','error');
    return;
  }

  sessionData.flex_id=result.flex_id||'';
  const gcalResult=await gcalCreateEvent(sessionData);
  if(gcalResult){
    sessionData.google_event_id=gcalResult.id;
    sessionData.google_event_link=gcalResult.htmlLink;
    await api('PUT','/api/cabinet/rendezvous/'+encodeURIComponent(sessionData.flex_id),sessionData);
  }
  sessions[activeId].push(sessionData);
  closeModal();
  renderList();
  renderMain();
}

async function deleteSession(sid){
  if(!confirm('Supprimer cette séance ?'))return;
  const list=sessions[activeId]||[];
  const idx=list.findIndex(s=>s.id===sid);
  if(idx===-1)return;
  const [removed]=list.splice(idx,1);
  renderMain();
  const flexId=removed.flex_id||'';
  if(!flexId){
    showToast('Impossible de supprimer : identifiant manquant','error');
    list.splice(idx,0,removed);
    renderMain();
    return;
  }
  const ok=await api('DELETE','/api/cabinet/rendezvous/'+encodeURIComponent(flexId));
  if(!ok){
    list.splice(idx,0,removed);
    renderMain();
  }
}

async function deleteClient(){
  if(!confirm('Supprimer ce dossier client ?'))return;
  const savedClient=clients[activeId];
  const savedSessions=sessions[activeId]||[];
  delete clients[activeId];delete sessions[activeId];
  const prevId=activeId;
  activeId=null;
  renderList();renderMain();
  // Delete all linked rendez-vous first
  for(const s of savedSessions){
    if(s.flex_id) await api('DELETE','/api/cabinet/rendezvous/'+encodeURIComponent(s.flex_id));
  }
  const ok=await api('DELETE','/api/cabinet/clients/'+encodeURIComponent(prevId));
  if(!ok){
    clients[prevId]=savedClient;
    sessions[prevId]=savedSessions;
    activeId=prevId;
    renderList();renderMain();
  }
}

function openNewClient(){
  showModal(`
    <div class="modal-head">
      <span class="modal-title">Nouveau client</span>
      <button class="btn-close" onclick="closeModal()">×</button>
    </div>
    <div class="field-grid">
      <div class="field"><label>Prénom *</label><input id="nc_prenom"></div>
      <div class="field"><label>Nom *</label><input id="nc_nom"></div>
      <div class="field"><label>Téléphone</label><input id="nc_tel"></div>
      <div class="field"><label>Email</label><input id="nc_email"></div>
      <div class="field field-full"><label>Motif principal</label><input id="nc_motif"></div>
    </div>
    <button class="btn-save" onclick="createClient()">Créer le dossier</button>`);
}

async function createClient(){
  const p=document.getElementById('nc_prenom').value.trim(),n=document.getElementById('nc_nom').value.trim();
  if(!p||!n){alert('Prénom et nom requis');return;}
  const id=uuidv4();
  const clientData={
    id,
    first_name:p,
    last_name:n,
    phone:document.getElementById('nc_tel').value,
    email:document.getElementById('nc_email').value,
    motif:document.getElementById('nc_motif').value,
    created:Date.now(),
    grav_uuid:id
  };
  const ok=await api('POST','/api/cabinet/clients',clientData);
  if(!ok){
    showToast('Création client échouée','error');
    return;
  }

  clients[id]=clientData;
  closeModal();
  selectClient(id);
}

function showModal(html){document.getElementById('modalContent').innerHTML=html;document.getElementById('modalOverlay').style.display='flex';}
function closeModal(){document.getElementById('modalOverlay').style.display='none';}

// ── Init Google API
if(typeof gapi!=="undefined")window.addEventListener("load",initGapi);
else document.querySelector("script[src*=\"apis.google.com\"]").addEventListener("load",initGapi);

// ── PWA Service Worker ───────────────────────────────────────────────────────
if('serviceWorker' in navigator){
  navigator.serviceWorker.register('/cabinet/sw.js').catch(()=>{});
}

// ── Chargement initial des données depuis Grav ─────────────────────────────
async function load(){
  try{
    const r = await fetch('/api/cabinet/data');
    if(!r.ok){ console.error('Erreur chargement données',r.status); return; }
    const data = await r.json();
    clients  = asPlainObject(data.clients);
    const fromRendezVous = sessionsFromRendezVous(data.rendez_vous || []);
    sessions = fromRendezVous;
    renderList();
    updatePreparationSms();
    if(sidebarView==='agenda') renderAgenda();
  }catch(e){
    console.error('Erreur chargement données',e);
  }
}

// load() est appelé après auth Drive (ou au démarrage si déjà connecté)
window.addEventListener("load", ()=>{
  // Charger Grav immédiatement, Drive mergera les bilans après auth
  load();
});
