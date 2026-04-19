#!/data/data/com.termux/files/usr/bin/bash
# termux-bootstrap.sh — Installation automatique du script SMS Cabinet dans Termux
#
# Usage (une seule fois, depuis Termux) :
#   curl -fsSL https://votre-site.com/user/plugins/cabinet/scripts/termux-bootstrap.sh | bash
#   — ou —
#   bash termux-bootstrap.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Constantes ────────────────────────────────────────────────────────────────
SCRIPT_NAME="termux-sms-queue.sh"
SCRIPT_DIR="$HOME/scripts"
SCRIPT_PATH="$SCRIPT_DIR/$SCRIPT_NAME"
CRON_INTERVAL="*/10 * * * *"
BOOT_DIR="$HOME/.termux/boot"
BOOT_SCRIPT="$BOOT_DIR/start-crond.sh"

# ── Helpers ───────────────────────────────────────────────────────────────────
red()   { printf '\033[0;31m%s\033[0m\n' "$*"; }
green() { printf '\033[0;32m%s\033[0m\n' "$*"; }
bold()  { printf '\033[1m%s\033[0m\n' "$*"; }
info()  { printf '  \033[0;34m→\033[0m %s\n' "$*"; }
ok()    { printf '  \033[0;32m✓\033[0m %s\n' "$*"; }
warn()  { printf '  \033[0;33m⚠\033[0m %s\n' "$*"; }

die() {
    red "ERREUR : $*"
    exit 1
}

ask() {
    # ask "Libellé" [valeur_par_défaut]
    local prompt="$1"
    local default="${2:-}"
    local value=""
    if [ -n "$default" ]; then
        printf '  %s [%s] : ' "$prompt" "$default"
    else
        printf '  %s : ' "$prompt"
    fi
    read -r value
    echo "${value:-$default}"
}

ask_secret() {
    local prompt="$1"
    local value=""
    printf '  %s : ' "$prompt"
    read -rs value
    echo
    echo "$value"
}

# ── Vérification Termux ───────────────────────────────────────────────────────
if [ ! -d "/data/data/com.termux" ]; then
    die "Ce script doit être exécuté dans Termux sur Android."
fi

# ── Bannière ──────────────────────────────────────────────────────────────────
echo
bold "╔══════════════════════════════════════════════════╗"
bold "║   Cabinet SMS Queue — Installation Termux        ║"
bold "╚══════════════════════════════════════════════════╝"
echo

# ── Étape 1 : Mise à jour des paquets ────────────────────────────────────────
bold "1. Mise à jour des paquets Termux"
pkg update -y -o Dpkg::Options::="--force-confold" 2>/dev/null || warn "pkg update partiel — on continue."
ok "Dépôts à jour"
echo

# ── Étape 2 : Installation des dépendances ───────────────────────────────────
bold "2. Installation des dépendances"

PKGS=(curl jq cronie termux-api)
for pkg in "${PKGS[@]}"; do
    if dpkg -s "$pkg" &>/dev/null; then
        ok "$pkg déjà installé"
    else
        info "Installation de $pkg..."
        pkg install -y "$pkg" 2>/dev/null && ok "$pkg installé" || warn "$pkg : échec d'installation"
    fi
done
echo

# Vérifier termux-sms-send (fourni par le paquet termux-api)
if ! command -v termux-sms-send &>/dev/null; then
    warn "termux-sms-send introuvable après installation de termux-api."
    warn "Assurez-vous que l'app 'Termux:API' est installée depuis F-Droid / Play Store."
fi

# ── Étape 3 : Configuration ───────────────────────────────────────────────────
bold "3. Configuration"
echo

CABINET_URL=$(ask "URL de votre site Grav (sans slash final)" "https://votre-site.com")
API_KEY=$(ask_secret "Clé API (cabinet.yaml → api_key)")

# SIM slot
echo
printf '  Téléphone multi-SIM ? (o/N) : '
read -r multisim
SIM_SLOT=""
if [[ "${multisim,,}" == "o" ]]; then
    SIM_SLOT=$(ask "SIM à utiliser" "0")
fi

# Intervalle cron
echo
CRON_INTERVAL=$(ask "Intervalle cron" "*/10 * * * *")
echo

# ── Étape 4 : Installation du script principal ────────────────────────────────
bold "4. Installation du script SMS"
mkdir -p "$SCRIPT_DIR"

# Détecter d'où télécharger le script (même hôte que CABINET_URL)
SCRIPT_URL="$CABINET_URL/user/plugins/cabinet/scripts/$SCRIPT_NAME"

info "Téléchargement depuis $SCRIPT_URL"
if curl -fsSL --max-time 15 -o "$SCRIPT_PATH" "$SCRIPT_URL" 2>/dev/null; then
    ok "Script téléchargé"
else
    warn "Téléchargement échoué — copie du script embarqué."
    # ── Script embarqué (fallback) ────────────────────────────────────────────
    cat > "$SCRIPT_PATH" << 'EMBEDDED'
#!/data/data/com.termux/files/usr/bin/bash
# termux-sms-queue.sh — généré par termux-bootstrap.sh
CABINET_URL="__CABINET_URL__"
API_KEY="__API_KEY__"
LOG_FILE="$HOME/sms-queue.log"
MAX_LOG_LINES=500
SIM_SLOT="__SIM_SLOT__"
CURL_TIMEOUT=15

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"; }
die() { log "ERREUR : $*"; exit 1; }

if [ -f "$LOG_FILE" ] && [ "$(wc -l < "$LOG_FILE")" -gt "$MAX_LOG_LINES" ]; then
    tail -n "$MAX_LOG_LINES" "$LOG_FILE" > "${LOG_FILE}.tmp" && mv "${LOG_FILE}.tmp" "$LOG_FILE"
fi

for cmd in curl jq termux-sms-send; do
    command -v "$cmd" > /dev/null 2>&1 || die "Commande '$cmd' introuvable."
done

log "--- Démarrage ---"
queue_response=$(curl -sf --max-time "$CURL_TIMEOUT" \
    -H "X-Api-Key: $API_KEY" -H "Accept: application/json" \
    "$CABINET_URL/api/cabinet/sms/queue")
[ $? -ne 0 ] && die "Impossible de joindre le serveur."
echo "$queue_response" | jq -e '.items' > /dev/null 2>&1 || die "Réponse inattendue : $queue_response"

count=$(echo "$queue_response" | jq '.items | length')
log "$count SMS en attente"
[ "$count" -eq 0 ] && { log "File vide."; exit 0; }

sent=0; failed=0
while IFS= read -r item; do
    id=$(echo "$item" | jq -r '.id')
    to=$(echo "$item" | jq -r '.to')
    message=$(echo "$item" | jq -r '.message')
    [ -z "$id" ] || [ -z "$to" ] || [ -z "$message" ] && { log "SKIP item malformé"; continue; }

    log "Envoi SMS id=$id vers $to"
    sms_cmd=(termux-sms-send -n "$to")
    [ -n "$SIM_SLOT" ] && sms_cmd+=(-s "$SIM_SLOT")
    sms_cmd+=("$message")

    send_output=$("${sms_cmd[@]}" 2>&1); send_exit=$?
    if [ $send_exit -eq 0 ]; then
        log "SMS id=$id envoyé"
        ack=$(curl -sf --max-time "$CURL_TIMEOUT" -X POST \
            -H "X-Api-Key: $API_KEY" -H "Content-Type: application/json" \
            "$CABINET_URL/api/cabinet/sms/queue/$id/ack")
        if [ $? -eq 0 ] && echo "$ack" | jq -e '.ok' > /dev/null 2>&1; then
            log "ACK id=$id OK"; sent=$((sent+1))
        else
            log "AVERT: ACK échoué id=$id"; failed=$((failed+1))
        fi
    else
        log "ERREUR termux-sms-send id=$id : $send_output"; failed=$((failed+1))
    fi
done < <(echo "$queue_response" | jq -c '.items[]')

log "Terminé — $sent envoyé(s), $failed échec(s)"
EMBEDDED
fi

# ── Étape 5 : Injection de la configuration ───────────────────────────────────
bold "5. Injection de la configuration"

# Remplacer les placeholders ou les lignes de config selon le format du script
sed -i "s|CABINET_URL=\".*\"|CABINET_URL=\"$CABINET_URL\"|" "$SCRIPT_PATH"
sed -i "s|API_KEY=\".*\"|API_KEY=\"$API_KEY\"|"             "$SCRIPT_PATH"
sed -i "s|SIM_SLOT=\".*\"|SIM_SLOT=\"$SIM_SLOT\"|"          "$SCRIPT_PATH"

# Remplacer aussi les placeholders embarqués si fallback utilisé
sed -i "s|__CABINET_URL__|$CABINET_URL|g" "$SCRIPT_PATH"
sed -i "s|__API_KEY__|$API_KEY|g"         "$SCRIPT_PATH"
sed -i "s|__SIM_SLOT__|$SIM_SLOT|g"       "$SCRIPT_PATH"

chmod +x "$SCRIPT_PATH"
ok "Script configuré : $SCRIPT_PATH"
echo

# ── Étape 6 : Cron ───────────────────────────────────────────────────────────
bold "6. Configuration du cron"

CRON_JOB="$CRON_INTERVAL $SCRIPT_PATH >> $HOME/sms-queue.log 2>&1"

# Supprimer toute entrée existante pour ce script avant d'ajouter
( crontab -l 2>/dev/null | grep -v "$SCRIPT_PATH" ; echo "$CRON_JOB" ) | crontab -
ok "Tâche cron enregistrée : $CRON_JOB"

# Démarrer crond si pas encore actif
if ! pgrep -x crond > /dev/null 2>&1; then
    crond && ok "crond démarré" || warn "Impossible de démarrer crond — lancez 'crond' manuellement."
else
    ok "crond déjà en cours d'exécution"
fi
echo

# ── Étape 7 : Démarrage automatique (termux-boot) ─────────────────────────────
bold "7. Démarrage automatique au redémarrage du téléphone (optionnel)"
echo

printf '  Configurer le démarrage automatique avec termux-boot ? (o/N) : '
read -r autoboot

if [[ "${autoboot,,}" == "o" ]]; then
    if dpkg -s "termux-boot" &>/dev/null; then
        mkdir -p "$BOOT_DIR"
        cat > "$BOOT_SCRIPT" << BOOT
#!/data/data/com.termux/files/usr/bin/bash
crond
BOOT
        chmod +x "$BOOT_SCRIPT"
        ok "Script de boot créé : $BOOT_SCRIPT"
        warn "Assurez-vous que l'app 'Termux:Boot' est installée depuis F-Droid / Play Store"
        warn "et qu'elle a été ouverte au moins une fois après installation."
    else
        info "Installation de termux-boot..."
        pkg install -y termux-boot 2>/dev/null && {
            mkdir -p "$BOOT_DIR"
            cat > "$BOOT_SCRIPT" << BOOT
#!/data/data/com.termux/files/usr/bin/bash
crond
BOOT
            chmod +x "$BOOT_SCRIPT"
            ok "termux-boot configuré"
            warn "Installez l'app 'Termux:Boot' depuis F-Droid et ouvrez-la une fois."
        } || warn "termux-boot indisponible — crond devra être relancé manuellement après redémarrage."
    fi
else
    info "Ignoré. Pour activer plus tard : pkg install termux-boot"
    info "puis créez $BOOT_SCRIPT contenant : crond"
fi
echo

# ── Étape 8 : Test de connexion ───────────────────────────────────────────────
bold "8. Test de connexion au serveur"
echo

info "Appel de $CABINET_URL/api/cabinet/sms/queue ..."
test_response=$(curl -sf --max-time 10 \
    -H "X-Api-Key: $API_KEY" \
    -H "Accept: application/json" \
    "$CABINET_URL/api/cabinet/sms/queue" 2>&1)
test_exit=$?

if [ $test_exit -eq 0 ] && echo "$test_response" | jq -e '.items' > /dev/null 2>&1; then
    count=$(echo "$test_response" | jq '.items | length')
    ok "Connexion réussie — $count SMS en attente actuellement"
else
    warn "Connexion échouée (curl exit=$test_exit)"
    warn "Réponse : $test_response"
    warn "Vérifiez l'URL, la clé API et que le plugin Cabinet est activé."
fi
echo

# ── Résumé ────────────────────────────────────────────────────────────────────
bold "╔══════════════════════════════════════════════════╗"
bold "║   Installation terminée                          ║"
bold "╚══════════════════════════════════════════════════╝"
echo
info "Script       : $SCRIPT_PATH"
info "Log          : $HOME/sms-queue.log"
info "Cron         : $CRON_JOB"
echo
green "Lancer manuellement pour tester :"
echo "  $SCRIPT_PATH"
echo
