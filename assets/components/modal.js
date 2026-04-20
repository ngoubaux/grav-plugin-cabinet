/* Cabinet — Modal components (session, new client, settings) */

function cabinetSessionModal() {
  return {
    modalTab: 'clinique',
    form: {},
    bilan: {},

    meridians()     { return MERIDIANS; },
    meridianStates(){ return MERIDIAN_STATES; },
    statusOpts()    { return STATUS_OPTS; },
    typeOpts()      { return TYPE_OPTS; },
    elementOpts()   { return ELEMENT_OPTS; },

    init() {
      this.$watch('$store.cab.modal.sessionData', () => this.resetForm());
      this.$watch('$store.cab.modal.open', (open) => { if(open) this.resetForm(); });
      this.resetForm();
    },

    resetForm() {
      const s     = Alpine.store('cab').modal.sessionData;
      const today = new Date().toISOString().slice(0, 10);
      const b     = s?.bilan || {};
      this.modalTab = 'clinique';
      this.form = {
        date:                s?.date                || today,
        heure:               s?.heure               || '09:00',
        duree:               s?.duree               || '60',
        status:              s?.status              || 'scheduled',
        appointment_type:    s?.appointment_type    || 'shiatsu_futon',
        motif:               s?.motif               || '',
        observations:        s?.observations        || '',
        exercices:           s?.exercices           || '',
        prochaine:           s?.prochaine           || '',
        sms_rappel_disabled: !!s?.sms_rappel_disabled,
      };
      this.bilan = {};
      MERIDIANS.forEach(m => { this.bilan[m.id] = b[m.id] || ''; });
      this.bilan.element_dominant = b.element_dominant || '';
      this.bilan.evolution        = b.evolution        || '';
      this.bilan.synthese_mtc     = b.synthese_mtc     || '';
      this.bilan.prise_en_charge  = b.prise_en_charge  || '';
    },

    get isEdit()    { return !!Alpine.store('cab').modal.sessionData; },
    get sessionId() { return Alpine.store('cab').modal.sessionData?.id || null; },
    get smsEnabled(){ return Alpine.store('cab').smsEnabled; },

    _buildPayload() {
      const bilan = {};
      MERIDIANS.forEach(m => { if(this.bilan[m.id]) bilan[m.id] = this.bilan[m.id]; });
      if(this.bilan.element_dominant) bilan.element_dominant = this.bilan.element_dominant;
      if(this.bilan.evolution)        bilan.evolution        = this.bilan.evolution;
      if(this.bilan.synthese_mtc)     bilan.synthese_mtc     = this.bilan.synthese_mtc;
      if(this.bilan.prise_en_charge)  bilan.prise_en_charge  = this.bilan.prise_en_charge;
      return {
        ...this.form,
        duree:    String(Math.max(1, parseInt(this.form.duree || '60', 10) || 60)),
        datetime: this.form.date ? `${this.form.date}T${this.form.heure}` : '',
        bilan:    Object.keys(bilan).length ? bilan : null,
      };
    },

    async submit() {
      const store   = Alpine.store('cab');
      const payload = this._buildPayload();
      if(this.isEdit) await store.updateSession(this.sessionId, payload);
      else            await store.saveSession(payload);
    },
  };
}

function cabinetNewClientModal() {
  return {
    form: {first_name:'', last_name:'', phone:'', email:'', motif:''},

    init() {
      this.$watch('$store.cab.modal.open', (open) => {
        if(open && Alpine.store('cab').modal.type === 'new-client')
          this.form = {first_name:'', last_name:'', phone:'', email:'', motif:''};
      });
    },

    async submit() {
      if(!this.form.first_name.trim() || !this.form.last_name.trim()) {
        alert('Prénom et nom requis');
        return;
      }
      await Alpine.store('cab').createClient({...this.form});
    },
  };
}

function cabinetSettingsModal() {
  return {
    clientId: '',
    calId:    '',
    pageSize: 7,

    init() {
      this.$watch('$store.cab.modal.open', (open) => {
        if(open && Alpine.store('cab').modal.type === 'settings') this.loadValues();
      });
      this.loadValues();
    },

    loadValues() {
      this.clientId = localStorage.getItem('gdrive_client_id') || '';
      this.calId    = localStorage.getItem('gcal_calendar_id') || '';
      this.pageSize = Alpine.store('cab').pageSize;
    },

    save() {
      Alpine.store('cab').setPageSize(this.pageSize);
      Alpine.store('cab').saveGoogleSettings(this.clientId.trim(), this.calId.trim());
    },
  };
}
