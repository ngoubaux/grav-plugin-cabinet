/* Cabinet — constants & pure utilities */

const MERIDIANS = [
  {id:'P',   name:'Poumon'},
  {id:'GI',  name:'Gros Intestin'},
  {id:'E',   name:'Estomac'},
  {id:'Rte', name:'Rate'},
  {id:'C',   name:'Coeur'},
  {id:'IG',  name:'Intestin Grêle'},
  {id:'V',   name:'Vessie'},
  {id:'Rn',  name:'Rein'},
  {id:'MC',  name:'Maître Coeur'},
  {id:'TR',  name:'Triple Réchauffeur'},
  {id:'VB',  name:'Vésicule Biliaire'},
  {id:'F',   name:'Foie'},
];

const MERIDIAN_STATES = [
  {val:'',      label:'—'},
  {val:'plein', label:'Plein / Excès'},
  {val:'vide',  label:'Vide / Insuffisance'},
  {val:'stase', label:'Stase / Blocage'},
  {val:'ok',    label:'Harmonieux'},
];

const STATE_CLASS = {plein:'e-plein', vide:'e-vide', stase:'e-stase', ok:'e-ok', '':'e-nd'};

const STATUS_OPTS = [
  ['scheduled','Planifié'],
  ['confirmed','Confirmé'],
  ['completed','Terminé'],
  ['cancelled','Annulé'],
];

const TYPE_OPTS = [
  ['shiatsu_futon','Shiatsu futon'],
  ['shiatsu_chair','Shiatsu chair'],
  ['sophrologie','Sophrologie'],
];

const ELEMENT_OPTS = ['','Bois','Feu','Terre','Métal','Eau'];

function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function uid() { return Date.now().toString(36)+Math.random().toString(36).slice(2,6); }

function compactUuid(v) { return String(v||'').replace(/-/g,''); }

function uuidv4() {
  if(typeof crypto!=='undefined' && typeof crypto.randomUUID==='function')
    return compactUuid(crypto.randomUUID());
  return 'xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r=Math.random()*16|0, v=c==='x'?r:(r&0x3|0x8);
    return v.toString(16);
  });
}

function normalizeUuid(v) { return String(v||'').replace(/-/g,'').toLowerCase(); }

function asPlainObject(v) {
  if(v && typeof v==='object' && !Array.isArray(v)) return v;
  if(Array.isArray(v)) return Object.assign({},v);
  return {};
}

function capitalize(text) {
  const v=String(text||'');
  return v ? v.charAt(0).toUpperCase()+v.slice(1) : '';
}

function toMinuteCount(v) {
  const n=parseInt(String(v||''),10);
  return Number.isFinite(n)&&n>0 ? n : 75;
}

function formatDurationForSms(minutes) {
  const total=toMinuteCount(minutes), h=Math.floor(total/60), m=total%60;
  if(h&&m) return `${h}h${String(m).padStart(2,'0')}`;
  if(h) return `${h}h`;
  return `${m} min`;
}

function parseSessionDateTime(session) {
  if(!session) return null;
  const iso=session.datetime||(session.date?`${session.date}T${session.heure||'00:00'}`:'');
  if(!iso) return null;
  const d=new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function getPreferredSession(sessionList) {
  if(!sessionList?.length) return null;
  const list=[...sessionList].sort((a,b)=>{
    const at=parseSessionDateTime(a)?.getTime()||0;
    const bt=parseSessionDateTime(b)?.getTime()||0;
    return at-bt;
  });
  const now=Date.now();
  return list.find(s=>{const dt=parseSessionDateTime(s);return dt&&dt.getTime()>=now;}) || list[0] || null;
}

function formatSessionSlotForSms(session) {
  const dt=parseSessionDateTime(session);
  if(!dt) return '';
  const dayLabel=dt.toLocaleDateString('fr-FR',{weekday:'long',day:'2-digit',month:'long'});
  const timeLabel=String(session.heure||dt.toTimeString().slice(0,5)||'').slice(0,5);
  return `${capitalize(dayLabel)} à ${timeLabel}`;
}

function getPreparationVisitLink(client, clientId) {
  const rawId=client&&client.grav_uuid ? client.grav_uuid : clientId;
  const cleanId=compactUuid(rawId);
  return cleanId
    ? `https://www.goubs.net/preparons-votre-visite/id:${cleanId}`
    : 'https://www.goubs.net/preparons-votre-visite/';
}

function buildPreparationSms(client, sessionList, clientId) {
  const name=client ? `${String(client.first_name||'').trim()} ${String(client.last_name||'').trim()}`.trim() : '';
  const greeting=name ? `Bonjour ${name},` : 'Bonjour,';
  const session=client ? getPreferredSession(sessionList) : null;
  const sessionLabel=formatSessionSlotForSms(session);
  const durationLabel=session ? formatDurationForSms(session.duree) : '1h15';
  const link=getPreparationVisitLink(client, clientId);
  return `${greeting}

Afin de préparer notre première séance${sessionLabel ? ` de ${sessionLabel}` : ''}.
Je vous partage ce lien: ${link}

📍 60 chemin du Val Fleuri 🔐 Code portillon : 2507A 🏢 Bât B6 appt 08, 3ème étage, porte de gauche (à droite de la piscine)
⏱️ Durée : ${durationLabel} - Tarif : 75€ 👕 Tenue : vêtements souples, chaussettes propres

À bientôt, Nicolas
Le shiatsu est une approche d'accompagnement au bien-être qui ne se substitue pas à un traitement médical.`;
}

function showToast(message, type='info') {
  let host=document.getElementById('cabToastHost');
  if(!host){
    host=document.createElement('div');
    host.id='cabToastHost';
    host.style.cssText='position:fixed;right:16px;bottom:16px;z-index:9999;display:flex;flex-direction:column;gap:8px;max-width:360px;';
    document.body.appendChild(host);
  }
  const toast=document.createElement('div');
  const bg=type==='error' ? '#a82626' : '#2f7a3f';
  toast.style.cssText=`padding:10px 12px;border-radius:8px;color:#fff;font-size:12px;line-height:1.4;box-shadow:0 8px 20px rgba(0,0,0,.25);background:${bg};`;
  toast.textContent=message;
  host.appendChild(toast);
  setTimeout(()=>{toast.style.opacity='0';toast.style.transition='opacity .2s ease';setTimeout(()=>toast.remove(),220);},2600);
}

async function apiCall(method, path, body=null) {
  try{
    const opts={method, headers:{'Content-Type':'application/json'}};
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

function sessionsFromRendezVous(items, clients) {
  const mapped={};
  if(!Array.isArray(items)) return mapped;
  items.forEach(item=>{
    if(!item||typeof item!=='object') return;
    const clientId=_resolveClientKey(item.client_id||'', clients);
    if(!clientId) return;
    const datetime=String(item.datetime||'');
    const date=String(item.date||(datetime?datetime.slice(0,10):''));
    const heure=String(item.heure||(datetime&&datetime.length>=16?datetime.slice(11,16):'00:00'));
    const duree=String(item.duree||item.duration||'60');
    if(!mapped[clientId]) mapped[clientId]=[];
    mapped[clientId].push({
      id: String(item.id||item.session_id||uid()),
      flex_id: String(item.flex_id||''),
      google_event_id:   String(item.google_event_id||''),
      google_event_link: String(item.google_event_link||''),
      date, heure, duree,
      datetime: datetime||(date?`${date}T${heure}`:''),
      status: String(item.status||'scheduled'),
      appointment_type: String(item.appointment_type||item.type||'shiatsu_futon'),
      motif: String(item.motif||''),
      observations: String(item.observations||item.notes||''),
      exercices: String(item.exercices||''),
      prochaine: String(item.prochaine||''),
      bilan: item.bilan&&typeof item.bilan==='object' ? item.bilan : null,
      sms_rappel_disabled: !!item.sms_rappel_disabled,
    });
  });
  Object.values(mapped).forEach(list=>{
    list.sort((a,b)=>String(a.datetime||'').localeCompare(String(b.datetime||'')));
  });
  return mapped;
}

function _resolveClientKey(candidate, clients) {
  const raw=String(candidate||'');
  if(!raw) return '';
  if(clients[raw]) return raw;
  const target=normalizeUuid(raw);
  return Object.keys(clients).find(k=>{
    if(normalizeUuid(k)===target) return true;
    const linked=clients[k]?.grav_uuid||'';
    return normalizeUuid(linked)===target;
  }) || raw;
}
