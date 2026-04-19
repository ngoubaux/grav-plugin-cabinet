#!/data/data/com.termux/files/usr/bin/bash
# termux-bootstrap.sh — version de référence (valeurs à compléter manuellement)
#
# Version pré-configurée disponible directement depuis Grav (recommandé) :
#   curl -fsSL "https://votre-site.com/api/cabinet/termux/bootstrap" \
#        -H "X-Api-Key: VOTRE_CLE_API" | bash
#
# Pour multi-SIM (SIM slot 0) :
#   curl -fsSL "https://votre-site.com/api/cabinet/termux/bootstrap?sim=0" \
#        -H "X-Api-Key: VOTRE_CLE_API" | bash
#
# La version Grav injecte automatiquement CABINET_URL, API_KEY et SIM_SLOT.
# Ce fichier sert de référence hors-ligne uniquement.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

CABINET_URL="https://votre-site.com"   # à remplacer
API_KEY="CHANGE_ME_BEFORE_DEPLOY"      # cabinet.yaml → api_key
SIM_SLOT=""                            # "" | "0" | "1"
CRON_INTERVAL="*/10 * * * *"

SCRIPT_NAME="termux-sms-queue.py"
SCRIPT_DIR="$HOME/scripts"
SCRIPT_PATH="$SCRIPT_DIR/$SCRIPT_NAME"
BOOT_DIR="$HOME/.termux/boot"
BOOT_SCRIPT="$BOOT_DIR/start-crond.sh"

red()   { printf '\033[0;31m%s\033[0m\n' "$*"; }
green() { printf '\033[0;32m%s\033[0m\n' "$*"; }
bold()  { printf '\033[1m%s\033[0m\n' "$*"; }
info()  { printf '  \033[0;34m→\033[0m %s\n' "$*"; }
ok()    { printf '  \033[0;32m✓\033[0m %s\n' "$*"; }
warn()  { printf '  \033[0;33m⚠\033[0m %s\n' "$*"; }
die()   { red "ERREUR : $*"; exit 1; }

[ -d "/data/data/com.termux" ] || die "Ce script doit être exécuté dans Termux sur Android."

echo
bold "╔══════════════════════════════════════════════════╗"
bold "║   Cabinet SMS Queue — Installation Termux        ║"
bold "╚══════════════════════════════════════════════════╝"
echo

bold "1. Mise à jour des paquets Termux"
pkg update -y -o Dpkg::Options::="--force-confold" 2>/dev/null || warn "pkg update partiel — on continue."
ok "Dépôts à jour"
echo

bold "2. Installation des dépendances"
for pkg in curl jq cronie termux-api; do
    if dpkg -s "$pkg" &>/dev/null; then
        ok "$pkg déjà installé"
    else
        info "Installation de $pkg..."
        pkg install -y "$pkg" 2>/dev/null && ok "$pkg installé" || warn "$pkg : échec"
    fi
done
command -v termux-sms-send &>/dev/null \
    || warn "termux-sms-send introuvable — installez l'app 'Termux:API' depuis F-Droid."
echo

bold "3. Installation du script SMS"
mkdir -p "$SCRIPT_DIR"
info "Téléchargement depuis $CABINET_URL/api/cabinet/termux/sms-queue"
if curl -fsSL --max-time 15 \
       -H "X-Api-Key: $API_KEY" \
       -o "$SCRIPT_PATH" \
       "$CABINET_URL/api/cabinet/termux/sms-queue"; then
    ok "Script téléchargé"
else
    die "Impossible de télécharger le script SMS. Vérifiez la connexion et la clé API."
fi
chmod +x "$SCRIPT_PATH"
ok "Script installé : $SCRIPT_PATH"
echo

bold "4. Configuration du cron"
CRON_JOB="$CRON_INTERVAL $SCRIPT_PATH >> $HOME/sms-queue.log 2>&1"
( crontab -l 2>/dev/null | grep -v "$SCRIPT_PATH"; echo "$CRON_JOB" ) | crontab -
ok "Tâche cron : $CRON_JOB"
if ! pgrep -x crond > /dev/null 2>&1; then
    crond && ok "crond démarré" || warn "Lancez 'crond' manuellement."
else
    ok "crond déjà actif"
fi
echo

bold "5. Démarrage automatique au boot Android"
if dpkg -s "termux-boot" &>/dev/null; then
    mkdir -p "$BOOT_DIR"
    printf '#!/data/data/com.termux/files/usr/bin/bash\ncrond\n' > "$BOOT_SCRIPT"
    chmod +x "$BOOT_SCRIPT"
    ok "Script de boot créé : $BOOT_SCRIPT"
    warn "Assurez-vous que l'app 'Termux:Boot' est installée et ouverte au moins une fois."
else
    info "Installation de termux-boot..."
    if pkg install -y termux-boot 2>/dev/null; then
        mkdir -p "$BOOT_DIR"
        printf '#!/data/data/com.termux/files/usr/bin/bash\ncrond\n' > "$BOOT_SCRIPT"
        chmod +x "$BOOT_SCRIPT"
        ok "termux-boot configuré"
        warn "Installez l'app 'Termux:Boot' depuis F-Droid et ouvrez-la une fois."
    else
        warn "termux-boot indisponible — relancez 'crond' manuellement après redémarrage."
    fi
fi
echo

bold "6. Test de connexion au serveur"
info "Appel de $CABINET_URL/api/cabinet/sms/queue ..."
test_out=$(curl -sf --max-time 10 \
    -H "X-Api-Key: $API_KEY" \
    -H "Accept: application/json" \
    "$CABINET_URL/api/cabinet/sms/queue" 2>&1) && test_ok=1 || test_ok=0

if [ "$test_ok" -eq 1 ] && echo "$test_out" | jq -e '.items' > /dev/null 2>&1; then
    count=$(echo "$test_out" | jq '.items | length')
    ok "Connexion réussie — $count SMS en attente"
else
    warn "Connexion échouée. Réponse : $test_out"
fi
echo

bold "╔══════════════════════════════════════════════════╗"
bold "║   Installation terminée                          ║"
bold "╚══════════════════════════════════════════════════╝"
echo
info "Script  : $SCRIPT_PATH"
info "Log     : $HOME/sms-queue.log"
info "Cron    : $CRON_INTERVAL"
[ -n "$SIM_SLOT" ] && info "SIM     : slot $SIM_SLOT" || info "SIM     : défaut"
echo
green "Lancer manuellement pour tester :"
echo "  python3 $SCRIPT_PATH"
echo
