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

function cabinetImportModal() {
  return {
    tab: 'clients',
    dryRun: true,
    file: null,
    running: false,
    result: null,

    init() {
      this.$watch('$store.cab.modal.open', (open) => {
        if (open && Alpine.store('cab').modal.type === 'import') this.reset();
      });
    },

    reset() {
      this.file    = null;
      this.running = false;
      this.result  = null;
      const inp    = this.$el?.querySelector('input[type=file]');
      if (inp) inp.value = '';
    },

    switchTab(t) {
      this.tab    = t;
      this.result = null;
      this.file   = null;
      const inp   = this.$el?.querySelector('input[type=file]');
      if (inp) inp.value = '';
    },

    onFile(e) {
      this.file   = e.target.files[0] || null;
      this.result = null;
    },

    async run() {
      if (!this.file) { alert('Sélectionnez un fichier'); return; }
      this.running = true;
      this.result  = null;
      const fd     = new FormData();
      fd.append('file',    this.file);
      fd.append('dry_run', this.dryRun ? '1' : '0');
      const endpoint = this.tab === 'clients'
        ? '/api/cabinet/import/clients'
        : '/api/cabinet/import/rendezvous';
      try {
        const resp = await fetch(endpoint, {method: 'POST', body: fd});
        const data = await resp.json();
        this.result = data;
        if (!data.ok && data.error) showToast(data.error, 'error');
        else if (data.ok && !this.dryRun) Alpine.store('cab').load();
      } catch(e) {
        showToast('Erreur réseau : ' + e.message, 'error');
      } finally {
        this.running = false;
      }
    },

    actionClass(action) {
      if (action === 'CREATE') return 'imp-create';
      if (action === 'UPDATE') return 'imp-update';
      if (action === 'SKIP')   return 'imp-skip';
      if (action === 'ERROR')  return 'imp-error';
      return '';
    },
  };
}

function cabinetSettingsModal() {
  return {
    tab: 'praticien',
    saving: false,
    loading: false,
    apiKeyVisible: false,
    apiKeyFull: '',
    form: {
      practitioner_name: '', practitioner_title: '', practitioner_phone: '',
      practitioner_website: '', practitioner_booking_url: '',
      practitioner_address_street: '', practitioner_address_details: '',
      practitioner_address_city: '', practitioner_access_code: '',
      practitioner_first_session_price: '',
      google_oauth_client_id: '', google_calendar_id: '', drive_bilan_path: '',
      sms_enabled: false,
      communication_google_review_url: '',
      communication_template_prep_visite: '',
      communication_template_relance: '',
      communication_template_compte_rendu: '',
      prep_page_content: '',
      prep_page_footer: '',
    },
    pageSize: 7,
    apiKeyMasked: '',
    hasApiKey: false,

    init() {
      this.$watch('$store.cab.modal.open', (open) => {
        if(open && Alpine.store('cab').modal.type === 'settings') this.loadFromServer();
      });
    },

    async loadFromServer() {
      this.loading = true;
      this.apiKeyFull = '';
      this.apiKeyVisible = false;
      this.pageSize = Alpine.store('cab').pageSize;
      try {
        const data = await apiCall('GET', '/api/cabinet/profile');
        if(!data) { this.loading = false; return; }
        const fields = Object.keys(this.form);
        fields.forEach(k => { if(k in data) this.form[k] = data[k]; });
        this.apiKeyMasked = data.api_key_masked || '';
        this.hasApiKey    = !!data.has_api_key;
        // Sync Google settings to localStorage for Drive/Calendar API
        if(this.form.google_oauth_client_id) localStorage.setItem('gdrive_client_id', this.form.google_oauth_client_id);
        if(this.form.google_calendar_id)     localStorage.setItem('gcal_calendar_id',  this.form.google_calendar_id);
      } catch(e) {
        showToast('Erreur chargement paramètres', 'error');
      }
      this.loading = false;
    },

    async save() {
      this.saving = true;
      Alpine.store('cab').setPageSize(this.pageSize);
      // Sync Google settings to localStorage for Drive/Calendar API
      if(this.form.google_oauth_client_id) localStorage.setItem('gdrive_client_id', this.form.google_oauth_client_id);
      if(this.form.google_calendar_id)     localStorage.setItem('gcal_calendar_id',  this.form.google_calendar_id);
      const ok = await apiCall('PUT', '/api/cabinet/profile', this.form);
      if(ok) {
        showToast('Paramètres enregistrés');
        // Reload store config so Drive/SMS pick up the new values immediately
        Alpine.store('cab').load();
        Alpine.store('cab').closeModal();
      }
      this.saving = false;
    },

    async regenerateApiKey() {
      if(!confirm('Générer une nouvelle clé API ? L\'ancienne sera immédiatement invalidée.')) return;
      const data = await apiCall('POST', '/api/cabinet/profile/api-key');
      if(data && data.api_key) {
        this.apiKeyFull    = data.api_key;
        this.apiKeyMasked  = data.api_key.slice(0,8) + '•'.repeat(data.api_key.length - 8);
        this.hasApiKey     = true;
        this.apiKeyVisible = true;
        showToast('Nouvelle clé API générée');
      }
    },

    toggleKeyVisibility() {
      this.apiKeyVisible = !this.apiKeyVisible;
    },
  };
}
