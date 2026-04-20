/* Cabinet — Drive bar & main area components */

function cabinetMain() {
  return {};
}

function cabinetStatusBar() {
  return {
    gcalUrl: 'https://calendar.google.com/calendar/r',

    init() {
      const calId = localStorage.getItem('gcal_calendar_id');
      if (calId) this.gcalUrl = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(calId)}`;
    },
  };
}

function cabinetDriveBar() {
  return {
    connected:   false,
    statusState: '',
    statusLabel: 'Bilans non synchronisés',

    init() {
      const s = Alpine.store('cab');
      this.connected   = s.driveConnected;
      this.statusState = s.driveStatus.state;
      this.statusLabel = s.driveStatus.label;

      window.addEventListener('cab:drive-update', ({detail}) => {
        if(detail.connected !== null) this.connected = detail.connected;
        this.statusState = detail.state;
        this.statusLabel = detail.label;
      });
    },

    toggleDrive() {
      if(this.connected) driveSignOut();
      else driveAuth();
    },

    openVerif() {
      Alpine.store('cab').openModal('verif');
      runGlobalVerification();
    },

    openSettings() {
      Alpine.store('cab').openModal('settings');
    },
  };
}
