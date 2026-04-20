/* Cabinet — API helpers */

function getApiUrl(endpoint) {
  const base = window.CABINET_ROUTE_API || '/api/cabinet';
  return base + endpoint;
}

async function apiCall(method, path, body=null) {
  try {
    // Si le chemin commence par '/', utiliser la route API dynamique
    const url = path.startsWith('/api/cabinet/')
      ? getApiUrl(path.replace(/^\/api\/cabinet/, ''))
      : path.startsWith('/')
      ? path
      : path;

    const opts={method, headers:{'Content-Type':'application/json'}};
    if(body!==null) opts.body=JSON.stringify(body);
    const r=await fetch(url,opts);
    if(!r.ok) {
      let msg='Erreur';
      try{const d=await r.json(); msg=d.error||msg;}catch(_){}
      showToast(msg,'error');
      return null;
    }
    return await r.json();
  } catch(e) {
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
  }) || '';
}
