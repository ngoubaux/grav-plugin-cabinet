#!/usr/bin/env python3
"""
termux_sms_cron.py — Termux SMS cron worker
============================================
Polls the Grav cabinet API for pending SMS jobs and sends them
via Android's native SMS radio using `termux-sms-send` (Termux:API).

Setup on Android (Termux)
--------------------------
1. Install Termux + Termux:API from F-Droid (same source — do NOT mix Play/F-Droid builds).
2. In Termux:
       pkg update && pkg install termux-api python cronie termux-services
3. Grant "Send SMS" permission to Termux:API in Android settings.
4. Copy this file to Termux home:
       scp termux_sms_cron.py user@phone:/data/data/com.termux/files/home/
   or share it and open with Termux.
5. Create config (once):
       python ~/termux_sms_cron.py --init
6. Enable the cron service and add the job:
       sv-enable crond
       crontab -e
   Add the line (runs every 10 minutes):
       */10 * * * * python $HOME/termux_sms_cron.py >> $HOME/sms_cron.log 2>&1
7. Start the cron daemon:
       sv up crond

Dry-run test (no SMS sent, no ack):
       python ~/termux_sms_cron.py --dry-run
"""

import argparse
import json
import logging
import os
import subprocess
import sys
import urllib.request
import urllib.error
from pathlib import Path
from typing import Optional

CONFIG_PATH = Path.home() / ".config" / "cabinet_sms.json"
LOG_FORMAT   = "%(asctime)s  %(levelname)-7s  %(message)s"
LOG_DATE_FMT = "%Y-%m-%d %H:%M:%S"

logging.basicConfig(format=LOG_FORMAT, datefmt=LOG_DATE_FMT, level=logging.INFO)
log = logging.getLogger("sms_cron")


# ── Config ────────────────────────────────────────────────────────────────────

def load_config() -> dict:
    if not CONFIG_PATH.exists():
        log.error("Config not found: %s  →  run with --init first.", CONFIG_PATH)
        sys.exit(1)
    with CONFIG_PATH.open() as fh:
        cfg = json.load(fh)
    for key in ("grav_url", "api_key"):
        if not cfg.get(key):
            log.error("Missing '%s' in config %s", key, CONFIG_PATH)
            sys.exit(1)
    return cfg


def init_config() -> None:
    print("=== Cabinet SMS Cron — first-time setup ===")
    grav_url = input("Grav site URL (e.g. https://yoursite.com): ").strip().rstrip("/")
    api_key  = input("Cabinet API key (cabinet.yaml → api_key): ").strip()
    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    config = {"grav_url": grav_url, "api_key": api_key}
    with CONFIG_PATH.open("w") as fh:
        json.dump(config, fh, indent=2)
    CONFIG_PATH.chmod(0o600)          # readable only by owner
    print(f"Config saved to {CONFIG_PATH}")


# ── HTTP helpers ──────────────────────────────────────────────────────────────

def _auth_header(api_key: str) -> dict:
    return {"Authorization": f"Bearer {api_key}", "Accept": "application/json"}


def fetch_queue(grav_url: str, api_key: str) -> list:
    url = f"{grav_url}/api/cabinet/sms/queue"
    req = urllib.request.Request(url, headers=_auth_header(api_key))
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read())
            return data.get("items", [])
    except urllib.error.HTTPError as exc:
        log.error("Queue fetch HTTP %s: %s", exc.code, exc.read().decode(errors="replace"))
        return []
    except Exception as exc:
        log.error("Queue fetch error: %s", exc)
        return []


def ack_item(grav_url: str, api_key: str, item_id: str) -> bool:
    url = f"{grav_url}/api/cabinet/sms/queue/{urllib.parse.quote(item_id, safe='')}/ack"
    req = urllib.request.Request(
        url,
        data=b"{}",
        headers={**_auth_header(api_key), "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            result = json.loads(resp.read())
            return result.get("ok") is True
    except Exception as exc:
        log.warning("Ack failed for %s: %s", item_id, exc)
        return False


# ── SMS sending via Termux:API ────────────────────────────────────────────────

def send_sms(to: str, message: str, dry_run: bool = False) -> bool:
    """Send an SMS using termux-sms-send. Returns True on success."""
    if dry_run:
        log.info("[DRY-RUN] Would send SMS to %s: %s", to, message[:60])
        return True

    try:
        result = subprocess.run(
            ["termux-sms-send", "-n", to, message],
            capture_output=True,
            text=True,
            timeout=30,
        )
        if result.returncode == 0:
            log.info("SMS sent → %s", to)
            return True
        else:
            log.error(
                "termux-sms-send failed (exit %s) → %s: %s",
                result.returncode, to, result.stderr.strip(),
            )
            return False
    except FileNotFoundError:
        log.error(
            "termux-sms-send not found. Install Termux:API: pkg install termux-api"
        )
        return False
    except subprocess.TimeoutExpired:
        log.error("termux-sms-send timed out for %s", to)
        return False
    except Exception as exc:
        log.error("Unexpected error sending SMS: %s", exc)
        return False


# ── Main ──────────────────────────────────────────────────────────────────────

def run(dry_run: bool = False) -> None:
    cfg       = load_config()
    grav_url  = cfg["grav_url"]
    api_key   = cfg["api_key"]

    items = fetch_queue(grav_url, api_key)

    if not items:
        log.info("No pending SMS in queue.")
        return

    log.info("Found %d pending SMS.", len(items))

    sent = skipped = 0
    for item in items:
        item_id = item.get("id", "")
        to      = item.get("to", "")
        message = item.get("message", "")

        if not to or not message or not item_id:
            log.warning("Skipping malformed item: %s", item)
            skipped += 1
            continue

        ok = send_sms(to, message, dry_run=dry_run)
        if ok:
            if dry_run or ack_item(grav_url, api_key, item_id):
                sent += 1
            else:
                log.warning("SMS sent but ack failed for item %s", item_id)
                sent += 1   # don't retry the send; ack will be retried next run
        else:
            skipped += 1

    log.info("Done. sent=%d  skipped=%d", sent, skipped)


def main() -> None:
    import urllib.parse  # ensure available for ack_item

    parser = argparse.ArgumentParser(description="Cabinet SMS cron worker for Termux")
    parser.add_argument("--init",    action="store_true", help="Interactive first-time setup")
    parser.add_argument("--dry-run", action="store_true", help="Fetch queue but do NOT send or ack")
    args = parser.parse_args()

    if args.init:
        init_config()
        return

    run(dry_run=args.dry_run)


if __name__ == "__main__":
    import urllib.parse
    main()
