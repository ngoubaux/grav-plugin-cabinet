/* Cabinet — Alpine store config
 * Registered in main.js via Alpine.store('cab', cabStore).
 * Depends on: utils/helpers.js, utils/toast.js, utils/api.js,
 *             utils/sms.js, cab-drive.js
 */

const cabStore = {
  clients: {},
  sessions: {},
  activeId: null,
  activeTab: 'fiche',
  smsEnabled: false,
  driveBilanPath: 'onyx/NoteAir5c/Cahiers/clients',
  driveConnected: false,
  driveStatus: {state:'', label:'Bilans non synchronisés'},

  clientList: [],
  searchQuery: '',
  loadState: 'idle',
  loadError: '',

  bilanFile: undefined,   // undefined=not loaded, null=not found, object=found
  bilanLoading: false,

  modal: {
    open: false,
    type: null,          // 'new-client' | 'session' | 'settings' | 'verif'
    sessionData: null,   // null=new, object=edit
    verifLog: [],
    verifSummary: null,
    verifDone: false,
  },

  // ── Computed ──────────────────────────────────────────────────────────────

  get activeClient() { return this.clients[this.activeId]||null; },
  get activeSessions() { return (this.sessions[this.activeId]||[]).slice().reverse(); },
  get activeSessionCount() { return (this.sessions[this.activeId]||[]).length; },
  get preparationSms() {
    if(!this.activeId) return '';
    return buildPreparationSms(this.activeClient, this.sessions[this.activeId]||[], this.activeId);
  },

  // ── Client list ───────────────────────────────────────────────────────────

  renderList() {
    const q=(this.searchQuery||'').toLowerCase();
    const createdValue=(id)=>{
      const raw=this.clients[id]?.created;
      if(typeof raw==='number'&&Number.isFinite(raw)) return raw;
      if(typeof raw==='string'){
        const ts=Date.parse(raw.replace(' ','T'));
        if(!Number.isNaN(ts)) return ts;
        const n=Number(raw);
        if(Number.isFinite(n)) return n;
      }
      return 0;
    };
    this.clientList=Object.keys(this.clients)
      .filter(id=>{
        const c=this.clients[id];
        return (c.last_name+' '+c.first_name+' '+(c.motif||'')).toLowerCase().includes(q);
      })
      .sort((a,b)=>createdValue(b)-createdValue(a))
      .map(id=>({...this.clients[id], _id:id, _sessionCount:(this.sessions[id]||[]).length}));
  },

  // ── Navigation ────────────────────────────────────────────────────────────

  resolveClientId(candidate) {
    const raw=String(candidate||'');
    if(!raw) return '';
    if(this.clients[raw]) return raw;
    const target=normalizeUuid(raw);
    return Object.keys(this.clients).find(k=>{
      if(normalizeUuid(k)===target) return true;
      const linked=this.clients[k]?.grav_uuid||'';
      return normalizeUuid(linked)===target;
    }) || '';
  },

  selectClient(id) {
    const resolved=this.resolveClientId(id);
    if(!resolved) {
      console.warn('cabinet: unresolved client selection id', id);
      return;
    }
    this.activeId=resolved;
    this.activeTab='fiche';
    this.bilanFile=undefined;
    delete _bilanFileCache[resolved];
    this.renderList();
    document.getElementById('app')?.classList.toggle('client-open',true);
    window.dispatchEvent(new CustomEvent('cabinet:client-selected',{detail:resolved}));
  },

  goBack() {
    this.activeId=null;
    document.getElementById('app')?.classList.remove('client-open');
    this.renderList();
  },

  setTab(tab) {
    this.activeTab=tab;
    if(tab==='bilan') this.loadBilanFile();
  },

  // ── Bilan file ────────────────────────────────────────────────────────────

  async loadBilanFile() {
    if(!this.activeId) return;
    this.bilanLoading=true;
    this.bilanFile=undefined;
    this.bilanFile=await findClientBilanFile(this.activeId);
    this.bilanLoading=false;
  },

  // ── Client CRUD ───────────────────────────────────────────────────────────

  async createClient(data) {
    const id=uuidv4();
    const clientData={...data, id, created:Date.now(), grav_uuid:id};
    const ok=await apiCall('POST','/api/cabinet/clients',clientData);
    if(!ok){showToast('Création client échouée','error'); return false;}
    this.clients[id]=clientData;
    this.closeModal();
    this.renderList();
    this.selectClient(id);
    return true;
  },

  async saveFiche(fields) {
    const c=this.clients[this.activeId];
    if(!c) return;
    if(!c.grav_uuid) c.grav_uuid=compactUuid(this.activeId);
    else c.grav_uuid=compactUuid(c.grav_uuid);
    if(fields&&typeof fields==='object') Object.assign(c,fields);
    const ok=await apiCall('PUT','/api/cabinet/clients/'+encodeURIComponent(this.activeId),c);
    if(ok){this.renderList(); showToast('Fiche enregistrée');}
  },

  async deleteClient() {
    if(!confirm('Supprimer ce dossier client ?')) return;
    const savedClient=this.clients[this.activeId];
    const savedSessions=this.sessions[this.activeId]||[];
    const prevId=this.activeId;
    delete this.clients[this.activeId];
    delete this.sessions[this.activeId];
    this.activeId=null;
    this.renderList();
    document.getElementById('app')?.classList.remove('client-open');
    for(const s of savedSessions)
      if(s.flex_id) await apiCall('DELETE','/api/cabinet/rendezvous/'+encodeURIComponent(s.flex_id));
    const ok=await apiCall('DELETE','/api/cabinet/clients/'+encodeURIComponent(prevId));
    if(!ok){
      this.clients[prevId]=savedClient;
      this.sessions[prevId]=savedSessions;
      this.activeId=prevId;
      this.renderList();
    }
  },

  async unlinkGrav(clientId) {
    if(!confirm('Délier ce client de son contact Grav ?')) return;
    delete this.clients[clientId].grav_uuid;
    delete this.clients[clientId].grav_rdv;
    const ok=await apiCall('PUT','/api/cabinet/clients/'+encodeURIComponent(clientId),this.clients[clientId]);
    if(!ok) showToast('Erreur lors de la suppression du lien','error');
  },

  async searchGravContact(clientId) {
    const c=this.clients[clientId];
    this.clients[clientId]._gravSearching=true;
    const params=new URLSearchParams();
    if(c.email) params.set('email',c.email);
    params.set('first_name',c.first_name||'');
    params.set('last_name',c.last_name||'');
    try {
      const res=await fetch('/api/contacts/search?'+params,{headers:{'Accept':'application/json'}});
      if(!res.ok) throw new Error('HTTP '+res.status);
      const data=await res.json();
      if(data.found&&data.uuid){
        this.clients[clientId].grav_uuid=compactUuid(data.uuid);
        if(data.rdv) this.clients[clientId].grav_rdv=data.rdv;
        await apiCall('PUT','/api/cabinet/clients/'+encodeURIComponent(clientId),this.clients[clientId]);
        this.clients[clientId]._gravSearching=false;
      } else {
        this.clients[clientId]._gravSearching=false;
        this.clients[clientId]._gravNotFound=true;
      }
    } catch(e) {
      this.clients[clientId]._gravSearching=false;
      showToast('Erreur Grav : '+e.message,'error');
    }
  },

  // ── Session CRUD ──────────────────────────────────────────────────────────

  async saveSession(sessionData) {
    if(!this.activeId){showToast('Veuillez sélectionner un client','error'); return false;}
    if(!this.sessions[this.activeId]) this.sessions[this.activeId]=[];
    if(!sessionData.date){showToast('La date est requise','error'); return false;}
    const data={...sessionData, id:uid(), client_id:this.activeId};
    const result=await apiCall('POST','/api/cabinet/rendezvous',data);
    if(!result){showToast('Enregistrement de la séance échoué','error'); return false;}
    data.flex_id=result.flex_id||'';
    const gcalResult=await gcalCreateEvent(this.activeId,data);
    if(gcalResult){
      data.google_event_id=gcalResult.id;
      data.google_event_link=gcalResult.htmlLink;
      await apiCall('PUT','/api/cabinet/rendezvous/'+encodeURIComponent(data.flex_id),data);
    }
    this.sessions[this.activeId].push(data);
    this.closeModal();
    this.renderList();
    return true;
  },

  async updateSession(sid, updatedData) {
    const list=this.sessions[this.activeId]||[];
    const idx=list.findIndex(x=>x.id===sid);
    if(idx===-1) return false;
    const s=list[idx];
    if(!s.flex_id){showToast('Séance sans flex_id — impossible de modifier','error'); return false;}
    if(!updatedData.date){showToast('La date est requise','error'); return false;}
    const updated={...s,...updatedData};
    const ok=await apiCall('PUT','/api/cabinet/rendezvous/'+encodeURIComponent(s.flex_id),updated);
    if(!ok){showToast('Modification échouée','error'); return false;}
    if(updated.google_event_id){
      await gcalUpdateEvent(updated.google_event_id,this.activeId,updated);
    } else {
      const gcalResult=await gcalCreateEvent(this.activeId,updated);
      if(gcalResult){
        updated.google_event_id=gcalResult.id;
        updated.google_event_link=gcalResult.htmlLink;
        await apiCall('PUT','/api/cabinet/rendezvous/'+encodeURIComponent(s.flex_id),updated);
      }
    }
    list[idx]=updated;
    this.closeModal();
    return true;
  },

  async deleteSession(sid) {
    if(!confirm('Supprimer cette séance ?')) return;
    const list=this.sessions[this.activeId]||[];
    const idx=list.findIndex(s=>s.id===sid);
    if(idx===-1) return;
    const [removed]=list.splice(idx,1);
    if(!removed.flex_id){
      showToast('Impossible de supprimer : identifiant manquant','error');
      list.splice(idx,0,removed);
      return;
    }
    const ok=await apiCall('DELETE','/api/cabinet/rendezvous/'+encodeURIComponent(removed.flex_id));
    if(!ok) list.splice(idx,0,removed);
  },

  // ── SMS ───────────────────────────────────────────────────────────────────

  async sendPreparationSms() {
    const c=this.activeClient;
    if(!c){showToast('Client introuvable','error'); return;}
    if(!c.phone){showToast('Numéro de téléphone manquant','error'); return;}
    const message=this.preparationSms;
    if(!message.trim()){showToast('Message vide','error'); return;}
    const resp=await apiCall('POST','/api/cabinet/sms/preparation',{phone:c.phone,message});
    if(resp?.ok) showToast('SMS envoyé ✓');
    else showToast('Erreur : '+(resp?.error||'inconnue'),'error');
  },

  async copyPreparationSms(text) {
    if(!text?.trim()){showToast('Message vide','error'); return;}
    try {
      if(navigator.clipboard&&window.isSecureContext)
        await navigator.clipboard.writeText(text);
      else {
        const ta=document.createElement('textarea');
        ta.value=text; document.body.appendChild(ta);
        ta.select(); document.execCommand('copy');
        document.body.removeChild(ta);
      }
      showToast('Message SMS copié');
    } catch(_){showToast('Copie impossible','error');}
  },

  // ── Modal ─────────────────────────────────────────────────────────────────

  openModal(type, data=null) {
    this.modal.open=true;
    this.modal.type=type;
    this.modal.sessionData=type==='session' ? data : null;
    if(type==='verif'){
      this.modal.verifLog=[];
      this.modal.verifSummary=null;
      this.modal.verifDone=false;
    }
  },

  closeModal() {
    this.modal.open=false;
    this.modal.type=null;
    this.modal.sessionData=null;
  },

  // ── Settings ──────────────────────────────────────────────────────────────

  saveGoogleSettings(clientId, calId) {
    if(!clientId){alert('Client ID requis'); return;}
    localStorage.setItem('gdrive_client_id',clientId);
    if(calId) localStorage.setItem('gcal_calendar_id',calId);
    else localStorage.removeItem('gcal_calendar_id');
    this.closeModal();
    if(_gapiReady) _initTokenClient(clientId);
    driveAuth();
  },

  // ── Data loading ──────────────────────────────────────────────────────────

  async load() {
    this.loadState='loading';
    this.loadError='';
    try {
      const r=await fetch('/api/cabinet/data',{cache:'no-store'});
      if(!r.ok){
        this.loadState='error';
        this.loadError=`Erreur API (${r.status})`;
        console.error('Erreur chargement données',r.status);
        return;
      }
      const data=await r.json();
      if(data&&typeof data==='object'&&data.error){
        this.loadState='error';
        this.loadError=String(data.error||'Erreur de chargement');
        return;
      }
      this.clients=asPlainObject(data.clients);
      this.sessions=sessionsFromRendezVous(data.rendez_vous||[],this.clients);
      const cfg=data.config||{};
      if(cfg.google_oauth_client_id) localStorage.setItem('gdrive_client_id',cfg.google_oauth_client_id);
      if(cfg.google_calendar_id)     localStorage.setItem('gcal_calendar_id',cfg.google_calendar_id);
      if(cfg.drive_bilan_path)       {this.driveBilanPath=cfg.drive_bilan_path; _bilanFolderIdCache=null;}
      this.smsEnabled=!!cfg.sms_enabled;
      this.renderList();
      this.loadState='loaded';
    } catch(e) {
      this.loadState='error';
      this.loadError='Impossible de charger les données';
      console.error('Erreur chargement données',e);
    }
  },
};
