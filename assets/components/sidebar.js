/* Cabinet — Sidebar & Agenda components */

function cabinetSidebar() {
  return {
    view: 'clients',

    setView(v) {
      this.view = v;
      if(v === 'agenda') this.$nextTick(() => this.$dispatch('render-agenda'));
    },
  };
}

function cabinetAgenda() {
  const safeMonth = (ctx) => {
    const m = ctx && ctx.month;
    if(m instanceof Date && Number.isFinite(m.getTime())) return m;
    return new Date();
  };

  const buildByDate = () => {
    const store  = Alpine.store('cab');
    const byDate = {};
    Object.entries(store.sessions).forEach(([cid, ss]) => {
      const client = store.clients[cid];
      if(!client) return;
      ss.forEach(s => {
        if(!s.date) return;
        const d = s.date.slice(0, 10);
        if(!byDate[d]) byDate[d] = [];
        byDate[d].push({...s, cid, clientName: `${client.first_name} ${client.last_name}`});
      });
    });
    Object.values(byDate).forEach(list => list.sort((a,b) => (a.heure||'').localeCompare(b.heure||'')));
    return byDate;
  };

  return {
    month: new Date(),

    get year()       { return safeMonth(this).getFullYear(); },
    get monthIndex() { return safeMonth(this).getMonth(); },
    get monthLabel() {
      const l = safeMonth(this).toLocaleDateString('fr-FR', {month:'long', year:'numeric'});
      return l.charAt(0).toUpperCase() + l.slice(1);
    },

    get calRows() {
      const firstDay    = new Date(this.year, this.monthIndex, 1);
      const daysInMonth = new Date(this.year, this.monthIndex + 1, 0).getDate();
      const startDow    = (firstDay.getDay() + 6) % 7;
      const today       = new Date().toISOString().slice(0, 10);
      const byDate      = buildByDate();
      const cells       = [];
      for(let i = 0; i < startDow; i++) cells.push({empty: true});
      for(let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${this.year}-${String(this.monthIndex+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        cells.push({d, dateStr, isToday: dateStr === today, hasSession: !!byDate[dateStr]});
      }
      const endDow = (new Date(this.year, this.monthIndex + 1, 0).getDay() + 6) % 7;
      for(let i = endDow + 1; i < 7; i++) cells.push({empty: true});
      return cells;
    },

    get monthGroups() {
      const prefix = `${this.year}-${String(this.monthIndex+1).padStart(2,'0')}`;
      const today  = new Date().toISOString().slice(0, 10);
      const byDate = buildByDate();
      return Object.keys(byDate).filter(d => d.startsWith(prefix)).sort().map(dateStr => {
        const dateObj = new Date(dateStr + 'T12:00:00');
        const label   = dateObj.toLocaleDateString('fr-FR', {weekday:'long', day:'numeric', month:'long'});
        return {dateStr, label, isPast: dateStr < today, entries: byDate[dateStr]};
      });
    },

    changeMonth(dir) {
      const base=safeMonth(this);
      this.month = new Date(base.getFullYear(), base.getMonth() + dir, 1);
    },

    scrollToDate(dateStr) {
      this.$nextTick(() => {
        document.getElementById('date_' + dateStr)?.scrollIntoView({behavior:'smooth', block:'start'});
      });
    },

    goToClient(cid) {
      Alpine.store('cab').selectClient(cid);
      this.$dispatch('set-sidebar-view', 'clients');
    },
  };
}
