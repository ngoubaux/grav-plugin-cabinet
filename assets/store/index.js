/* Cabinet — Alpine store config
 * Registered in main.js via Alpine.store('cab', cabStore).
 * Depends on: utils/helpers.js, utils/toast.js, utils/api.js,
 *             utils/sms.js, cab-drive.js
 */

const cabStore = {
  clients: {},
  sessions: {},
  communications: {},
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

  communicationDraft: {
    channel: 'sms',
    subject: '',
    message: '',
    followUpAt: '',
  },
  communicationFilter: 'all',
  communicationSettings: {
    googleReviewUrl: '',
    templates: {
      prepVisite: '',
      relance: '',
      compteRendu: '',
    },
  },

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
  get activeClientPageUrl() {
    const rawId=String(this.activeClient?.grav_uuid||this.activeId||'').trim();
    const cleanId=compactUuid(rawId);
    return cleanId ? `/preparons-votre-visite/id:${cleanId}` : '/preparons-votre-visite';
  },
  get nextSession() { return getPreferredSession(this.sessions[this.activeId]||[]); },
  get lastSessionDate() {
    const list = this.sessions[this.activeId]||[];
    if(!list.length) return null;
    const sorted = list.slice().sort((a,b)=>String(b.datetime||b.date||'').localeCompare(String(a.datetime||a.date||'')));
    return sorted[0]?.date || null;
  },
  get nextSessionLabel() {
    const s = this.nextSession;
    if(!s) return null;
    const dt = new Date((s.datetime || s.date + 'T' + (s.heure || '00:00')));
    if(isNaN(dt)) return s.date || null;
    const day = dt.toLocaleDateString('fr-FR', {weekday:'short', day:'numeric', month:'short'});
    const time = s.heure ? s.heure.slice(0,5) : '';
    return time ? day + ' · ' + time : day;
  },
  get activeCommunications() {
    if(!this.activeId) return [];
    const list=(this.communications[this.activeId]||[]).slice();
    const filtered=this.communicationFilter==='all'
      ? list
      : list.filter(x=>x.channel===this.communicationFilter);
    return filtered.sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
  },
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
    this.initCommunicationDraft('sms');
    document.getElementById('app')?.classList.toggle('client-open',true);
    window.dispatchEvent(new CustomEvent('cabinet:client-selected',{detail:resolved}));
  },

  goBack() {
    this.activeId=null;
    document.getElementById('app')?.classList.remove('client-open');
  },

  setTab(tab) {
    this.activeTab=tab;
    if(tab==='bilan') this.loadBilanFile();
    if(tab==='communication'&&!this.communicationDraft.message) this.initCommunicationDraft(this.communicationDraft.channel||'sms');
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
    delete this.communications[this.activeId];
    this.saveCommunications();
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
    // Envoyer directement via l'API SMSMobileAPI côté serveur
    const resp=await apiCall('POST','/api/cabinet/sms/send-preparation',{client_id:this.activeId});
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

  // ── Communication ────────────────────────────────────────────────────────

  _prepVisiteVars() {
    const c=this.activeClient||{};
    const s=this.nextSession;
    return {
      first_name: String(c.first_name||'').trim(),
      session_slot: s ? ' de '+formatSessionSlotForSms(s) : '',
      preparation_link: getPreparationVisitLink(c, this.activeId),
      duration: s ? formatDurationForSms(s.duree) : '1h15',
      session_date: this._latestSessionDate(),
      session_date_label: this._latestSessionDateLabel(),
      google_review_url: this.communicationSettings.googleReviewUrl||'',
    };
  },

  initCommunicationDraft(channel='sms') {
    const safeChannel=channel==='email' ? 'email' : 'sms';
    const firstName=String(this.activeClient?.first_name||'').trim();
    const prep=this._renderCommunicationTemplate(this.communicationSettings.templates.prepVisite||'',this._prepVisiteVars())||this.preparationSms;
    this.communicationDraft={
      channel: safeChannel,
      subject: safeChannel==='email' ? `Suivi séance${firstName ? ` - ${firstName}` : ''}` : '',
      message: safeChannel==='sms' ? prep : '',
      followUpAt: '',
    };
  },

  setCommunicationChannel(channel) {
    const next=channel==='email' ? 'email' : 'sms';
    if(this.communicationDraft.channel===next) return;
    const currentMessage=this.communicationDraft.message||'';
    const currentSubject=this.communicationDraft.subject||'';
    this.communicationDraft.channel=next;
    if(next==='email'&&!currentSubject) {
      const firstName=String(this.activeClient?.first_name||'').trim();
      this.communicationDraft.subject=`Suivi séance${firstName ? ` - ${firstName}` : ''}`;
    }
    if(next==='sms'&&!currentMessage) this.communicationDraft.message=this.preparationSms;
  },

  applyCommunicationTemplate(templateId) {
    const c=this.activeClient||{};
    const firstName=String(c.first_name||'').trim();
    const sessionDate=this._latestSessionDate();
    const sessionDateLabel=this._latestSessionDateLabel();
    const vars={
      first_name:firstName,
      session_date:sessionDate,
      session_date_label:sessionDateLabel,
      google_review_url:this.communicationSettings.googleReviewUrl||'',
    };
    if(templateId==='prep-visite') {
      this.communicationDraft.channel='sms';
      this.communicationDraft.message=this._renderCommunicationTemplate(this.communicationSettings.templates.prepVisite||'',this._prepVisiteVars())||this.preparationSms;
      return;
    }
    if(templateId==='relance') {
      this.communicationDraft.channel='sms';
      this.communicationDraft.message=this._renderCommunicationTemplate(this.communicationSettings.templates.relance||'',vars)
        || `Bonjour${firstName ? ` ${firstName}` : ''}, je prends de vos nouvelles suite à notre dernière séance. Souhaitez-vous planifier un nouveau créneau ?`;
      return;
    }
    if(templateId==='compte-rendu') {
      this.communicationDraft.channel='email';
      this.communicationDraft.subject=`Suite de séance${sessionDate ? ` du ${sessionDate}` : ''}`;
      const defaultTemplate=`Bonjour {{first_name}},\n\nMerci pour votre confiance suite à notre séance{{session_date_label}}.\n\nSi vous avez trouvé l'accompagnement utile, vous pouvez laisser un avis sur ma fiche Google :\n{{google_review_url}}\n\nVotre retour est précieux et aide d'autres personnes à me trouver.\n\nBien à vous,\nNicolas`;
      this.communicationDraft.message=this._renderCommunicationTemplate(
        this.communicationSettings.templates.compteRendu||defaultTemplate,
        vars
      );
    }
  },

  _latestSessionDate() {
    const nextSession=(this.activeSessions||[])[0]||null;
    return String(nextSession?.date||'').trim();
  },

  _latestSessionDateLabel() {
    const date=this._latestSessionDate();
    return date ? ` du ${date}` : '';
  },

  _renderCommunicationTemplate(template, vars={}) {
    const str=String(template||'').trim();
    if(!str) return '';
    return str.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g,(_m,key)=>String(vars[key]??''));
  },

  async copyCommunicationMessage() {
    await this.copyPreparationSms(this.communicationDraft.message||'');
  },

  async sendCommunication() {
    const c=this.activeClient;
    if(!c) {showToast('Client introuvable','error'); return false;}
    const channel=this.communicationDraft.channel==='email' ? 'email' : 'sms';
    const message=String(this.communicationDraft.message||'').trim();
    const subject=String(this.communicationDraft.subject||'').trim();
    const followUpAt=String(this.communicationDraft.followUpAt||'').trim();
    if(!message) {showToast('Message vide','error'); return false;}

    if(channel==='sms'&&!String(c.phone||'').trim()) {
      showToast('Numéro de téléphone manquant','error');
      return false;
    }
    if(channel==='email'&&!String(c.email||'').trim()) {
      showToast('Email manquant','error');
      return false;
    }

    const transport=channel==='sms'
      ? await this._sendClientSms(String(c.phone||''), message)
      : this._openClientEmail(String(c.email||''), subject, message);

    await this.logCommunication({
      channel,
      to: channel==='sms' ? String(c.phone||'').trim() : String(c.email||'').trim(),
      subject,
      message,
      followUpAt,
      transport,
      status: transport==='api' ? 'sent' : (transport==='cancelled' ? 'cancelled' : 'prepared'),
    });
    this.initCommunicationDraft(channel);
    return true;
  },

  async _sendClientSms(phone, message) {
    const cleanPhone=String(phone||'').replace(/\s+/g,'');
    let shouldFallbackToLocal=true;

    if(this.smsEnabled) {
      const resp=await apiCall('POST','/api/cabinet/sms/preparation',{phone:cleanPhone,message});
      if(resp?.ok) {
        showToast('SMS envoyé ✓');
        return 'api';
      }
      // API échoue : afficher erreur et fallback
      showToast('Erreur API : '+(resp?.error||'inconnue'),'error');
      shouldFallbackToLocal=confirm('L\'envoi API a échoué. Ouvrir l\'application SMS locale ?');
    } else {
      shouldFallbackToLocal=confirm('Envoi API désactivé. Ouvrir l\'application SMS locale ?');
    }

    if(!shouldFallbackToLocal) {
      showToast('Envoi annulé');
      return 'cancelled';
    }

    showToast('Basculement mode local...');

    // Fallback : ouvrir le lien SMS dans une nouvelle fenêtre
    const smsLink=`sms:${encodeURIComponent(cleanPhone)}?body=${encodeURIComponent(message)}`;
    try {
      window.open(smsLink, '_blank', 'noopener,noreferrer');
      showToast('SMS préparé dans l\'appareil');
    } catch(_) {
      // Si window.open échoue, fallback à location.href
      window.location.href=smsLink;
      showToast('SMS préparé...');
    }
    return 'deeplink';
  },

  _openClientEmail(email, subject, message) {
    const to=String(email||'').trim();
    const mailto=`mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject||'Suivi séance')}&body=${encodeURIComponent(message)}`;
    try {
      window.open(mailto, '_blank', 'noopener,noreferrer');
      showToast('Email préparé dans votre messagerie');
    } catch(_) {
      // Fallback: si window.open échoue, utiliser location.href
      window.location.href=mailto;
      showToast('Email en cours...');
    }
    return 'mailto';
  },

  async logCommunication(entry) {
    if(!this.activeId) return;
    if(!this.communications[this.activeId]) this.communications[this.activeId]=[];
    this.communications[this.activeId].push({
      id: uid(),
      createdAt: new Date().toISOString(),
      status: 'prepared',
      ...entry,
    });
    this.saveCommunications();
    await this.persistCommunicationsForClient(this.activeId);
  },

  async deleteCommunication(entryId) {
    if(!this.activeId||!entryId) return;
    const list=this.communications[this.activeId]||[];
    const idx=list.findIndex(x=>x.id===entryId);
    if(idx===-1) return;
    list.splice(idx,1);
    this.saveCommunications();
    await this.persistCommunicationsForClient(this.activeId);
  },

  async markCommunicationDone(entryId) {
    if(!this.activeId||!entryId) return;
    const list=this.communications[this.activeId]||[];
    const item=list.find(x=>x.id===entryId);
    if(!item) return;
    item.status=item.status==='done' ? 'prepared' : 'done';
    this.saveCommunications();
    await this.persistCommunicationsForClient(this.activeId);
  },

  saveCommunications() {
    try {
      localStorage.setItem('cabinet_communications_v1',JSON.stringify(this.communications||{}));
    } catch(_e) {
      // Ignore storage errors (private mode, quota, etc.)
    }
  },

  loadCommunications(serverByClient={}) {
    const byClient=asPlainObject(serverByClient);
    Object.keys(this.clients||{}).forEach(cid=>{
      if(!Array.isArray(byClient[cid])) byClient[cid]=[];
    });
    try {
      const raw=localStorage.getItem('cabinet_communications_v1');
      const parsed=raw ? JSON.parse(raw) : {};
      const local=asPlainObject(parsed);
      Object.keys(local).forEach(cid=>{
        if((byClient[cid]||[]).length===0&&Array.isArray(local[cid])) byClient[cid]=local[cid];
      });
      this.communications=byClient;
    } catch(_e) {
      this.communications=byClient;
    }
  },

  async persistCommunicationsForClient(clientId) {
    const id=String(clientId||'');
    if(!id||!this.clients[id]) return false;
    const payload=(this.communications[id]||[]).slice();
    const ok=await apiCall('PUT','/api/cabinet/communications/'+encodeURIComponent(id),{
      communications:payload,
    });
    if(!ok) showToast('Historique communication non synchronisé','error');
    return !!ok;
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
        const serverComms=asPlainObject(data.communications||{});
      const cfg=data.config||{};
      if(cfg.google_oauth_client_id) localStorage.setItem('gdrive_client_id',cfg.google_oauth_client_id);
      if(cfg.google_calendar_id)     localStorage.setItem('gcal_calendar_id',cfg.google_calendar_id);
      if(cfg.drive_bilan_path)       {this.driveBilanPath=cfg.drive_bilan_path; _bilanFolderIdCache=null;}
      this.smsEnabled=!!cfg.sms_enabled;
      this.communicationSettings={
        googleReviewUrl:String(cfg.communication_google_review_url||''),
        templates:{
          prepVisite:String(cfg.communication_template_prep_visite||''),
          relance:String(cfg.communication_template_relance||''),
          compteRendu:String(cfg.communication_template_compte_rendu||''),
        },
      };
      this.loadCommunications(serverComms);
      Object.keys(this.communications).forEach(cid=>{
        if(!Array.isArray(this.communications[cid])) this.communications[cid]=[];
      });
      this.renderList();
      this.loadState='loaded';
    } catch(e) {
      this.loadState='error';
      this.loadError='Impossible de charger les données';
      console.error('Erreur chargement données',e);
    }
  },
};
