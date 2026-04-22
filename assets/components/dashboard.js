/* Cabinet — Dashboard component (activité du praticien) */

function cabinetDashboard() {
  return {
    stats: {
      totalClients: 0, newThisMonth: 0, activeClients: 0,
      sessionsThisMonth: 0, prevMonthSessions: 0,
      totalSessions: 0, totalHours: 0,
      nextRdv: null,
    },
    upcomingAppointments: [],
    recentClients: [],
    _byMonth: {},
    _byClientMonth: {},
    _byType: {},
    _charts: {},

    init() {
      this._compute();
      this.$watch('$store.cab.loadState', state => {
        if (state === 'loaded') {
          this._compute();
          if (Alpine.store('cab').showDashboard) this.$nextTick(() => this._buildCharts());
        }
      });
      this.$watch('$store.cab.showDashboard', show => {
        if (show) { this._compute(); this.$nextTick(() => this._buildCharts()); }
      });
    },

    destroy() {
      Object.values(this._charts).forEach(c => { try { c.destroy(); } catch(_) {} });
      this._charts = {};
    },

    _compute() {
      const store  = Alpine.store('cab');
      const now    = new Date();
      const ymNow  = now.toISOString().slice(0, 7);
      const ymPrev = (() => { const d = new Date(now.getFullYear(), now.getMonth() - 1, 1); return d.toISOString().slice(0, 7); })();
      const today  = now.toISOString().slice(0, 10);
      const d90str = (() => { const d = new Date(); d.setDate(d.getDate() - 90); return d.toISOString().slice(0, 10); })();

      const allDone = Object.values(store.sessions || {}).flat().filter(s => s.status === 'completed');
      const doneThisMonth = allDone.filter(s => (s.date || '').startsWith(ymNow));
      const donePrevMonth = allDone.filter(s => (s.date || '').startsWith(ymPrev));
      const totalMin = allDone.reduce((n, s) => n + (parseInt(s.duree || '0', 10) || 0), 0);

      const clients = Object.values(store.clients || {});

      const parseCreated = raw => {
        if (!raw) return null;
        try { const d = typeof raw === 'number' ? new Date(raw) : new Date(String(raw).replace(' ', 'T')); return isNaN(d) ? null : d; }
        catch(_) { return null; }
      };

      const newThisMonth = clients.filter(c => { const d = parseCreated(c.created); return d && d.toISOString().slice(0, 7) === ymNow; }).length;
      const activeClients = Object.keys(store.clients || {}).filter(cid =>
        (store.sessions[cid] || []).some(s => s.status === 'completed' && (s.date || '') >= d90str)
      ).length;

      // Upcoming
      const upcoming = (store.rendez_vous || [])
        .filter(r => (r.date || '') >= today && r.status !== 'cancelled' && r.status !== 'completed')
        .sort((a, b) => (a.datetime || '').localeCompare(b.datetime || ''));

      // By month (last 12)
      const byMonth = {}, byClientMonth = {};
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = d.toISOString().slice(0, 7);
        byMonth[key] = allDone.filter(s => (s.date || '').startsWith(key)).length;
        byClientMonth[key] = clients.filter(c => { const cd = parseCreated(c.created); return cd && cd.toISOString().slice(0, 7) === key; }).length;
      }

      // By type
      const byType = {};
      allDone.forEach(s => { const t = s.appointment_type || 'shiatsu_futon'; byType[t] = (byType[t] || 0) + 1; });

      // Recent clients
      const recent = [];
      Object.entries(store.sessions || {}).forEach(([cid, slist]) => {
        const done = slist.filter(s => s.status === 'completed');
        if (!done.length) return;
        const latest = done.reduce((a, b) => (a.date || '') > (b.date || '') ? a : b);
        const c = (store.clients || {})[cid];
        if (!c) return;
        recent.push({ id: cid, name: `${c.first_name || ''} ${c.last_name || ''}`.trim(), lastDate: latest.date || '', sessionCount: done.length });
      });
      recent.sort((a, b) => (b.lastDate || '').localeCompare(a.lastDate || ''));

      this.stats = {
        totalClients: clients.length,
        newThisMonth,
        activeClients,
        sessionsThisMonth: doneThisMonth.length,
        prevMonthSessions: donePrevMonth.length,
        totalSessions: allDone.length,
        totalHours: Math.round(totalMin / 60),
        nextRdv: upcoming[0] || null,
      };
      this.upcomingAppointments = upcoming.slice(0, 8);
      this.recentClients = recent.slice(0, 6);
      this._byMonth = byMonth;
      this._byClientMonth = byClientMonth;
      this._byType = byType;
    },

    _buildCharts() {
      if (typeof Chart === 'undefined') return;
      this._buildActivityChart();
      this._buildTypeChart();
    },

    _buildActivityChart() {
      const canvas = this.$el.querySelector('#dash-activity-chart');
      if (!canvas) return;
      if (this._charts.activity) { try { this._charts.activity.destroy(); } catch(_) {} }
      const dark      = document.documentElement.classList.contains('dark');
      const grid      = dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
      const text      = dark ? '#9ca3af' : '#71717a';
      const tooltipBg = dark ? '#27272a' : '#ffffff';
      const tooltipBd = dark ? '#3f3f46' : '#e4e4e7';
      const tooltipTx = dark ? '#e4e4e7' : '#18181b';
      const labels    = Object.keys(this._byMonth).map(k => this._monthLabel(k));
      this._charts.activity = new Chart(canvas, {
        type: 'bar',
        data: {
          labels,
          datasets: [
            {
              label: 'Séances',
              data: Object.values(this._byMonth),
              backgroundColor: '#4a7c59',
              borderRadius: 4,
              order: 1,
            },
            {
              label: 'Nouveaux clients',
              data: Object.values(this._byClientMonth),
              type: 'line',
              borderColor: '#f59e0b',
              backgroundColor: 'rgba(245,158,11,0.08)',
              borderWidth: 2,
              pointRadius: 3,
              pointBackgroundColor: '#f59e0b',
              fill: true,
              tension: 0.35,
              order: 0,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { labels: { color: text, font: { size: 11 }, boxWidth: 10, padding: 14 } },
            tooltip: { backgroundColor: tooltipBg, titleColor: tooltipTx, bodyColor: text, borderColor: tooltipBd, borderWidth: 1 },
          },
          scales: {
            x: { grid: { color: grid }, ticks: { color: text, font: { size: 10 } } },
            y: { grid: { color: grid }, ticks: { color: text, font: { size: 10 }, stepSize: 1 }, beginAtZero: true },
          },
        },
      });
    },

    _buildTypeChart() {
      const canvas = this.$el.querySelector('#dash-type-chart');
      if (!canvas) return;
      if (this._charts.type) { try { this._charts.type.destroy(); } catch(_) {} }
      const entries = Object.entries(this._byType);
      if (!entries.length) return;
      const dark      = document.documentElement.classList.contains('dark');
      const text      = dark ? '#9ca3af' : '#71717a';
      const tooltipBg = dark ? '#27272a' : '#ffffff';
      const tooltipBd = dark ? '#3f3f46' : '#e4e4e7';
      const tooltipTx = dark ? '#e4e4e7' : '#18181b';
      this._charts.type = new Chart(canvas, {
        type: 'doughnut',
        data: {
          labels: entries.map(([t]) => this._typeLabel(t)),
          datasets: [{ data: entries.map(([, v]) => v), backgroundColor: ['#4a7c59','#6d9b7f','#92bba5','#b8d4c0','#2d5236'], borderWidth: 0, hoverOffset: 4 }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '62%',
          plugins: {
            legend: { position: 'bottom', labels: { color: text, font: { size: 11 }, padding: 8, boxWidth: 10 } },
            tooltip: { backgroundColor: tooltipBg, titleColor: tooltipTx, bodyColor: text, borderColor: tooltipBd, borderWidth: 1 },
          },
        },
      });
    },

    _monthLabel(key) {
      const [y, m] = key.split('-').map(Number);
      const names = ['jan','fév','mar','avr','mai','jun','jul','aoû','sep','oct','nov','déc'];
      const label = names[m - 1] || key;
      return y !== new Date().getFullYear() ? label + ` '${String(y).slice(2)}` : label;
    },

    _typeLabel(type) {
      const map = { shiatsu_futon: 'Shiatsu futon', shiatsu_chair: 'Shiatsu chaise', sophrologie: 'Sophrologie', 'seance_échange': 'Échange' };
      return map[type] || type;
    },

    formatDate(dateStr) {
      if (!dateStr) return '—';
      try {
        const [y, m, d] = dateStr.split('-').map(Number);
        const days   = ['dim','lun','mar','mer','jeu','ven','sam'];
        const months = ['jan','fév','mar','avr','mai','jun','jul','aoû','sep','oct','nov','déc'];
        return `${days[new Date(y, m - 1, d).getDay()]} ${d} ${months[m - 1]}`;
      } catch(_) { return dateStr; }
    },

    statusLabel(s) {
      return { scheduled: 'Prévu', confirmed: 'Confirmé', cancelled: 'Annulé', completed: 'Effectué' }[s] || s;
    },

    goToClient(rdv) {
      const cid = rdv.client_id;
      if (!cid) return;
      Alpine.store('cab').showDashboard = false;
      Alpine.store('cab').selectClient(cid);
    },
  };
}
