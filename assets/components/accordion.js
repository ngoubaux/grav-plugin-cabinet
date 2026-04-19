/* Cabinet — Séances list & Bilan components */

function cabinetSeances() {
  return {
    openCards: {},
    cardTabs:  {},

    toggleCard(id) { this.openCards[id] = !this.openCards[id]; },
    setCardTab(id, tab) { this.cardTabs[id] = tab; },
    getCardTab(id) { return this.cardTabs[id] || 'clinique'; },

    stateClass(val) { return STATE_CLASS[val||''] || 'e-nd'; },
    stateLabel(val) { return MERIDIAN_STATES.find(s => s.val === val)?.label || '—'; },
    exercicePills(str) { return str ? str.split(',').map(e => e.trim()).filter(Boolean) : []; },

    meridians() { return MERIDIANS; },
    activeMeridians(bilan) {
      if(!bilan) return [];
      return MERIDIANS.filter(m => bilan[m.id]).map(m => ({...m, state: bilan[m.id]}));
    },
  };
}

function cabinetBilan() {
  return {
    init() {},

    get sessionsWithBilan() {
      const store = Alpine.store('cab');
      return (store.sessions[store.activeId] || [])
        .filter(s => s.bilan && Object.keys(s.bilan).length > 0)
        .sort((a,b) => a.date.localeCompare(b.date));
    },

    stateClass(val) { return STATE_CLASS[val||''] || 'e-nd'; },
    stateLabel(val) { return MERIDIAN_STATES.find(s => s.val === val)?.label || val; },

    activeMeridians(bilan) {
      if(!bilan) return [];
      return MERIDIANS.filter(m => bilan[m.id]).map(m => ({...m, state: bilan[m.id]}));
    },

    legendEntries() {
      return Object.entries(STATE_CLASS)
        .filter(([k]) => k)
        .map(([k, cls]) => ({val: k, cls, label: MERIDIAN_STATES.find(s => s.val === k)?.label || k}));
    },

    async uploadTemplate() {
      await uploadBilanTemplate(Alpine.store('cab').activeId);
    },
  };
}
