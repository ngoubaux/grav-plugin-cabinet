/* Cabinet — Alpine.data() component definitions */

document.addEventListener('alpine:init', () => {

  // ── Sidebar ──────────────────────────────────────────────────────────────

  Alpine.data('cabinetSidebar', () => ({
    view: 'clients',

    setView(v) {
      this.view = v;
      if(v==='agenda') this.$nextTick(()=>this.$dispatch('render-agenda'));
    },
  }));

  // ── Agenda ───────────────────────────────────────────────────────────────

  Alpine.data('cabinetAgenda', () => ({
    month: new Date(),

    get year()  { return this.month.getFullYear(); },
    get monthIndex() { return this.month.getMonth(); },
    get monthLabel() {
      const l = this.month.toLocaleDateString('fr-FR',{month:'long',year:'numeric'});
      return l.charAt(0).toUpperCase()+l.slice(1);
    },

    get calRows() {
      const firstDay = new Date(this.year, this.monthIndex, 1);
      const daysInMonth = new Date(this.year, this.monthIndex+1, 0).getDate();
      const startDow = (firstDay.getDay()+6)%7;
      const today = new Date().toISOString().slice(0,10);
      const byDate = this._byDate();
      const cells = [];
      for(let i=0;i<startDow;i++) cells.push({empty:true});
      for(let d=1;d<=daysInMonth;d++){
        const dateStr=`${this.year}-${String(this.monthIndex+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        cells.push({d, dateStr, isToday:dateStr===today, hasSession:!!byDate[dateStr]});
      }
      const endDow=(new Date(this.year,this.monthIndex+1,0).getDay()+6)%7;
      for(let i=endDow+1;i<7;i++) cells.push({empty:true});
      return cells;
    },

    get monthGroups() {
      const prefix=`${this.year}-${String(this.monthIndex+1).padStart(2,'0')}`;
      const today=new Date().toISOString().slice(0,10);
      const byDate=this._byDate();
      return Object.keys(byDate).filter(d=>d.startsWith(prefix)).sort().map(dateStr=>{
        const dateObj=new Date(dateStr+'T12:00:00');
        const label=dateObj.toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long'});
        return {dateStr, label, isPast:dateStr<today, entries:byDate[dateStr]};
      });
    },

    _byDate() {
      const store=Alpine.store('cab');
      const byDate={};
      Object.entries(store.sessions).forEach(([cid,ss])=>{
        const client=store.clients[cid];
        if(!client) return;
        ss.forEach(s=>{
          if(!s.date) return;
          const d=s.date.slice(0,10);
          if(!byDate[d]) byDate[d]=[];
          byDate[d].push({...s, cid, clientName:`${client.first_name} ${client.last_name}`});
        });
      });
      Object.values(byDate).forEach(list=>list.sort((a,b)=>(a.heure||'').localeCompare(b.heure||'')));
      return byDate;
    },

    changeMonth(dir) {
      this.month = new Date(this.year, this.monthIndex+dir, 1);
    },

    scrollToDate(dateStr) {
      this.$nextTick(()=>{
        document.getElementById('date_'+dateStr)?.scrollIntoView({behavior:'smooth',block:'start'});
      });
    },

    goToClient(cid) {
      this.$dispatch('set-sidebar-view', 'clients');
      Alpine.store('cab').selectClient(cid);
    },
  }));

  // ── Main area ─────────────────────────────────────────────────────────────

  Alpine.data('cabinetMain', () => ({}));

  // ── Séances ───────────────────────────────────────────────────────────────

  Alpine.data('cabinetSeances', () => ({
    openCards: {},
    cardTabs: {},

    toggleCard(id) { this.openCards[id] = !this.openCards[id]; },
    setCardTab(id, tab) { this.cardTabs[id] = tab; },
    getCardTab(id) { return this.cardTabs[id] || 'clinique'; },

    stateClass(val) { return STATE_CLASS[val||''] || 'e-nd'; },
    stateLabel(val) { return MERIDIAN_STATES.find(s=>s.val===val)?.label || '—'; },
    exercicePills(str) { return str ? str.split(',').map(e=>e.trim()).filter(Boolean) : []; },

    meridians() { return MERIDIANS; },
    activeMeridians(bilan) {
      if(!bilan) return [];
      return MERIDIANS.filter(m=>bilan[m.id]).map(m=>({...m, state:bilan[m.id]}));
    },
  }));

  // ── Bilan ─────────────────────────────────────────────────────────────────

  Alpine.data('cabinetBilan', () => ({
    init() {},

    get sessionsWithBilan() {
      const store = Alpine.store('cab');
      return (store.sessions[store.activeId]||[])
        .filter(s=>s.bilan&&Object.keys(s.bilan).length>0)
        .sort((a,b)=>a.date.localeCompare(b.date));
    },

    stateClass(val) { return STATE_CLASS[val||''] || 'e-nd'; },
    stateLabel(val) { return MERIDIAN_STATES.find(s=>s.val===val)?.label || val; },
    activeMeridians(bilan) {
      if(!bilan) return [];
      return MERIDIANS.filter(m=>bilan[m.id]).map(m=>({...m, state:bilan[m.id]}));
    },
    legendEntries() {
      return Object.entries(STATE_CLASS).filter(([k])=>k).map(([k,cls])=>({val:k,cls,label:MERIDIAN_STATES.find(s=>s.val===k)?.label||k}));
    },

    async uploadTemplate() {
      await uploadBilanTemplate(Alpine.store('cab').activeId);
    },
  }));

  // ── Session modal ─────────────────────────────────────────────────────────

  Alpine.data('cabinetSessionModal', () => ({
    modalTab: 'clinique',
    form: {},
    bilan: {},

    meridians() { return MERIDIANS; },
    meridianStates() { return MERIDIAN_STATES; },
    statusOpts() { return STATUS_OPTS; },
    typeOpts() { return TYPE_OPTS; },
    elementOpts() { return ELEMENT_OPTS; },

    init() {
      this.$watch('$store.cab.modal.sessionData', () => this.resetForm());
      this.$watch('$store.cab.modal.open', (open) => { if(open) this.resetForm(); });
      this.resetForm();
    },

    resetForm() {
      const s = Alpine.store('cab').modal.sessionData;
      const today = new Date().toISOString().slice(0,10);
      const b = s?.bilan||{};
      this.modalTab = 'clinique';
      this.form = {
        date:  s?.date||today,
        heure: s?.heure||'09:00',
        duree: s?.duree||'60',
        status: s?.status||'scheduled',
        appointment_type: s?.appointment_type||'shiatsu_futon',
        motif: s?.motif||'',
        observations: s?.observations||'',
        exercices: s?.exercices||'',
        prochaine: s?.prochaine||'',
        sms_rappel_disabled: !!s?.sms_rappel_disabled,
      };
      this.bilan = {};
      MERIDIANS.forEach(m=>{ this.bilan[m.id] = b[m.id]||''; });
      this.bilan.element_dominant = b.element_dominant||'';
      this.bilan.evolution = b.evolution||'';
      this.bilan.synthese_mtc = b.synthese_mtc||'';
      this.bilan.prise_en_charge = b.prise_en_charge||'';
    },

    get isEdit() { return !!Alpine.store('cab').modal.sessionData; },
    get sessionId() { return Alpine.store('cab').modal.sessionData?.id||null; },
    get smsEnabled() { return Alpine.store('cab').smsEnabled; },

    _buildPayload() {
      const bilan={};
      MERIDIANS.forEach(m=>{ if(this.bilan[m.id]) bilan[m.id]=this.bilan[m.id]; });
      if(this.bilan.element_dominant) bilan.element_dominant=this.bilan.element_dominant;
      if(this.bilan.evolution)        bilan.evolution=this.bilan.evolution;
      if(this.bilan.synthese_mtc)     bilan.synthese_mtc=this.bilan.synthese_mtc;
      if(this.bilan.prise_en_charge)  bilan.prise_en_charge=this.bilan.prise_en_charge;
      return {
        ...this.form,
        duree: String(Math.max(1,parseInt(this.form.duree||'60',10)||60)),
        datetime: this.form.date ? `${this.form.date}T${this.form.heure}` : '',
        bilan: Object.keys(bilan).length ? bilan : null,
      };
    },

    async submit() {
      const store = Alpine.store('cab');
      const payload = this._buildPayload();
      if(this.isEdit)
        await store.updateSession(this.sessionId, payload);
      else
        await store.saveSession(payload);
    },
  }));

  // ── New client modal ──────────────────────────────────────────────────────

  Alpine.data('cabinetNewClientModal', () => ({
    form: {first_name:'', last_name:'', phone:'', email:'', motif:''},

    init() {
      this.$watch('$store.cab.modal.open', (open) => {
        if(open && Alpine.store('cab').modal.type==='new-client')
          this.form={first_name:'',last_name:'',phone:'',email:'',motif:''};
      });
    },

    async submit() {
      if(!this.form.first_name.trim()||!this.form.last_name.trim()){
        alert('Prénom et nom requis');
        return;
      }
      await Alpine.store('cab').createClient({...this.form});
    },
  }));

  // ── Settings modal ────────────────────────────────────────────────────────

  Alpine.data('cabinetSettingsModal', () => ({
    clientId: '',
    calId: '',

    init() {
      this.$watch('$store.cab.modal.open', (open) => {
        if(open && Alpine.store('cab').modal.type==='settings') this.loadValues();
      });
      this.loadValues();
    },

    loadValues() {
      this.clientId = localStorage.getItem('gdrive_client_id')||'';
      this.calId    = localStorage.getItem('gcal_calendar_id')||'';
    },

    save() {
      Alpine.store('cab').saveGoogleSettings(this.clientId.trim(), this.calId.trim());
    },
  }));

  // ── Drive bar ─────────────────────────────────────────────────────────────

  Alpine.data('cabinetDriveBar', () => ({
    toggleDrive() {
      const store = Alpine.store('cab');
      if(store.driveConnected) driveSignOut();
      else driveAuth();
    },
    openVerif() {
      const store = Alpine.store('cab');
      store.openModal('verif');
      runGlobalVerification();
    },
    openSettings() {
      Alpine.store('cab').openModal('settings');
    },
  }));

});
