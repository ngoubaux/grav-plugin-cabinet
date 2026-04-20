/* Cabinet — Alpine entry point
 *
 * Load order (Grav priorities, highest first):
 *   utils/constants.js (22) → utils/helpers.js (20) → utils/toast.js (18)
 *   → utils/api.js (17) → utils/sms.js (16) → cab-drive.js (14)
 *   → store/index.js (12) → components/* (8) → main.js (5)
 */

document.addEventListener('alpine:init', () => {
  Alpine.store('cab', cabStore);

  Alpine.data('cabToast',              cabToast);
  Alpine.data('cabinetMain',           cabinetMain);
  Alpine.data('cabinetSidebar',        cabinetSidebar);
  Alpine.data('cabinetAgenda',         cabinetAgenda);
  Alpine.data('cabinetSeances',        cabinetSeances);
  Alpine.data('cabinetBilan',          cabinetBilan);
  Alpine.data('cabinetSessionModal',   cabinetSessionModal);
  Alpine.data('cabinetNewClientModal', cabinetNewClientModal);
  Alpine.data('cabinetImportModal',    cabinetImportModal);
  Alpine.data('cabinetSettingsModal',  cabinetSettingsModal);
  Alpine.data('cabinetDriveBar',       cabinetDriveBar);
  Alpine.data('cabinetStatusBar',      cabinetStatusBar);

  Alpine.store('cab').load();
});
