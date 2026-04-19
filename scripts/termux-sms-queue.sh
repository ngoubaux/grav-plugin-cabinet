#!/data/data/com.termux/files/usr/bin/bash
# termux-sms-queue.sh — Envoie les SMS en queue depuis le plugin Cabinet (Grav)
#
# Prérequis Termux :
#   pkg install curl jq
#   pkg install termux-api        ← paquet Termux
#   Installer aussi l'app "Termux:API" depuis F-Droid / Play Store
#
# Installation du cron :
#   pkg install cronie
#   crond                         ← démarrer le daemon (une fois)
#   crontab -e                    ← ajouter la ligne suivante :
#   */10 * * * * /data/data/com.termux/files/home/scripts/termux-sms-queue.sh >> /data/data/com.termux/files/home/sms-queue.log 2>&1
#
# Rendre le script exécutable :
#   chmod +x ~/scripts/termux-sms-queue.sh
# ─────────────────────────────────────────────────────────────────────────────

# ── Configuration (à adapter) ─────────────────────────────────────────────────
CABINET_URL="https://votre-site.com"       # URL de votre site Grav (sans slash final)
API_KEY="CHANGE_ME_BEFORE_DEPLOY"          # cabinet.yaml → api_key
LOG_FILE="$HOME/sms-queue.log"
MAX_LOG_LINES=500                          # rotation légère du log
SIM_SLOT=""                                # "" = SIM par défaut, "0" ou "1" pour multi-SIM
CURL_TIMEOUT=15                            # secondes
# ─────────────────────────────────────────────────────────────────────────────

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

die() {
    log "ERREUR : $*"
    exit 1
}

# Rotation légère du fichier de log
if [ -f "$LOG_FILE" ] && [ "$(wc -l < "$LOG_FILE")" -gt "$MAX_LOG_LINES" ]; then
    tail -n "$MAX_LOG_LINES" "$LOG_FILE" > "${LOG_FILE}.tmp" && mv "${LOG_FILE}.tmp" "$LOG_FILE"
fi

# Vérifier les dépendances
for cmd in curl jq termux-sms-send; do
    command -v "$cmd" > /dev/null 2>&1 || die "Commande '$cmd' introuvable. Voir les prérequis en tête du script."
done

# ── 1. Récupérer la file d'attente SMS ────────────────────────────────────────
log "--- Démarrage ---"
log "Récupération de la file d'attente : $CABINET_URL/api/cabinet/sms/queue"

queue_response=$(curl -sf \
    --max-time "$CURL_TIMEOUT" \
    -H "X-Api-Key: $API_KEY" \
    -H "Accept: application/json" \
    "$CABINET_URL/api/cabinet/sms/queue")

curl_exit=$?
if [ $curl_exit -ne 0 ]; then
    die "Impossible de joindre le serveur (curl exit=$curl_exit). Vérifiez l'URL et la connexion réseau."
fi

# Valider le JSON reçu
if ! echo "$queue_response" | jq -e '.items' > /dev/null 2>&1; then
    die "Réponse inattendue du serveur : $queue_response"
fi

count=$(echo "$queue_response" | jq '.items | length')
log "$count SMS en attente"

if [ "$count" -eq 0 ]; then
    log "File vide — rien à faire."
    exit 0
fi

# ── 2. Traiter chaque SMS ─────────────────────────────────────────────────────
sent=0
failed=0

while IFS= read -r item; do
    id=$(echo "$item"      | jq -r '.id')
    to=$(echo "$item"      | jq -r '.to')
    message=$(echo "$item" | jq -r '.message')

    if [ -z "$id" ] || [ -z "$to" ] || [ -z "$message" ]; then
        log "SKIP : item malformé — $(echo "$item" | jq -c '.')"
        continue
    fi

    log "Envoi SMS id=$id vers $to"

    # Construire la commande termux-sms-send
    sms_cmd=(termux-sms-send -n "$to")
    if [ -n "$SIM_SLOT" ]; then
        sms_cmd+=(-s "$SIM_SLOT")
    fi
    sms_cmd+=("$message")

    send_output=$("${sms_cmd[@]}" 2>&1)
    send_exit=$?

    if [ $send_exit -eq 0 ]; then
        log "SMS id=$id envoyé avec succès"

        # ── 3. Signaler l'envoi au serveur (ACK) ─────────────────────────────
        ack_response=$(curl -sf \
            --max-time "$CURL_TIMEOUT" \
            -X POST \
            -H "X-Api-Key: $API_KEY" \
            -H "Content-Type: application/json" \
            "$CABINET_URL/api/cabinet/sms/queue/$id/ack")

        ack_exit=$?
        if [ $ack_exit -eq 0 ] && echo "$ack_response" | jq -e '.ok' > /dev/null 2>&1; then
            log "ACK id=$id → statut mis à jour : 'sent'"
            sent=$((sent + 1))
        else
            log "AVERTISSEMENT : ACK échoué pour id=$id (curl=$ack_exit, réponse=$ack_response)"
            # Le SMS est parti mais le statut serveur n'a pas été mis à jour.
            # Il repassera dans la queue au prochain cycle et sera renvoyé —
            # à surveiller si vous constatez des doublons.
            failed=$((failed + 1))
        fi
    else
        log "ERREUR : termux-sms-send a échoué pour id=$id (exit=$send_exit) : $send_output"
        failed=$((failed + 1))
    fi

done < <(echo "$queue_response" | jq -c '.items[]')

log "Terminé — $sent envoyé(s), $failed échec(s)"
