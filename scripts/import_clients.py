#!/usr/bin/env python3
"""
Import clients from CSV into the Cabinet plugin via its API.

CSV expected columns: email, prenom, nom, telephone, code_postal

Usage:
    BASE_URL=https://example.com API_KEY=your_key python3 import_clients.py clients.csv

Or with defaults:
    python3 import_clients.py [csv_file]

Environment variables:
    BASE_URL  - Site base URL (default: http://localhost)
    API_KEY   - Cabinet plugin API key (cabinet.yaml → api_key)
    DRY_RUN   - Set to "1" to preview without making changes
"""

"""
* Dry run (preview only)
DRY_RUN=1 BASE_URL=https://your-site.com API_KEY=your_key python3 import_clients.py

* Live import
BASE_URL=https://your-site.com API_KEY=your_key python3 import_clients.py
"""

import csv
import json
import os
import sys
import uuid
import urllib.request
import urllib.parse
import urllib.error

BASE_URL = os.environ.get("BASE_URL", "http://shiatsu-dev:8080").rstrip("/")
API_KEY  = os.environ.get("API_KEY", "")
DRY_RUN  = os.environ.get("DRY_RUN", "0") == "1"

import glob as _glob

def _find_csv() -> str:
    matches = sorted(_glob.glob("user/data/clients_praticien_90790_*.csv"))
    if not matches:
        print("ERROR: no CSV file matching user/data/clients_praticien_90790_*.csv", file=sys.stderr)
        sys.exit(1)
    if len(matches) > 1:
        print(f"Multiple CSV files found, using most recent: {matches[-1]}")
    return matches[-1]

CSV_FILE = sys.argv[1] if len(sys.argv) > 1 else _find_csv()


def api(method: str, path: str, body: dict | None = None) -> dict:
    url = BASE_URL + path
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    req.add_header("X-Api-Key", API_KEY)
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8")
        try:
            return json.loads(body)
        except Exception:
            return {"error": f"HTTP {e.code}: {body}"}


def search_by_phone(phone: str) -> dict:
    path = "/api/contacts/search?" + urllib.parse.urlencode({"phone": phone})
    return api("GET", path)


def search_by_email(email: str) -> dict:
    path = "/api/contacts/search?" + urllib.parse.urlencode({"email": email})
    return api("GET", path)


def create_client(payload: dict) -> dict:
    return api("POST", "/api/cabinet/clients", payload)


def update_client(client_uuid: str, payload: dict) -> dict:
    return api("PUT", f"/api/cabinet/clients/{urllib.parse.quote(client_uuid)}", payload)


def normalize_phone(raw: str) -> str:
    phone = raw.strip()
    # Convert leading 0 to +33 for French numbers
    if phone.startswith("0") and not phone.startswith("00"):
        phone = "+33" + phone[1:]
    # Fix double country code (+330...)
    if phone.startswith("+330"):
        phone = "+33" + phone[4:]
    return phone


def main():
    if not API_KEY:
        print("ERROR: API_KEY environment variable is required.", file=sys.stderr)
        print("  Set it to the value of api_key in user/plugins/cabinet/cabinet.yaml", file=sys.stderr)
        sys.exit(1)

    if DRY_RUN:
        print("DRY RUN — no changes will be made.\n")

    created = updated = skipped = errors = 0

    with open(CSV_FILE, newline="", encoding="utf-8") as fh:
        reader = csv.DictReader(fh)
        rows = list(reader)

    print(f"Processing {len(rows)} rows from {CSV_FILE}\n")

    for row in rows:
        email      = row.get("email", "").strip()
        first_name = row.get("prenom", "").strip()
        last_name  = row.get("nom", "").strip()
        phone      = normalize_phone(row.get("telephone", ""))
        postal     = row.get("code_postal", "").strip()

        if not email or not first_name or not last_name:
            print(f"  SKIP (missing fields): {row}")
            skipped += 1
            continue

        payload = {
            "first_name": first_name,
            "last_name":  last_name,
            "email":      email,
            "phone":      phone,
        }
        if postal:
            payload["notes"] = f"Code postal : {postal}"

        # Search by phone first, fall back to email
        result = search_by_phone(phone) if phone else {"found": False}
        if not result.get("found") and email:
            result = search_by_email(email)

        if result.get("found"):
            client_uuid = result["uuid"]
            print(f"  UPDATE {last_name}, {first_name} <{email}> (uuid={client_uuid})")
            if not DRY_RUN:
                resp = update_client(client_uuid, payload)
                if resp.get("ok"):
                    updated += 1
                else:
                    print(f"    ERROR: {resp}")
                    errors += 1
            else:
                updated += 1
        else:
            client_uuid = str(uuid.uuid4())
            payload["id"] = client_uuid
            print(f"  CREATE {last_name}, {first_name} <{email}> (new uuid={client_uuid})")
            if not DRY_RUN:
                resp = create_client(payload)
                if resp.get("ok"):
                    created += 1
                else:
                    print(f"    ERROR: {resp}")
                    errors += 1
            else:
                created += 1

    print(f"\nDone. Created: {created}  Updated: {updated}  Skipped: {skipped}  Errors: {errors}")


if __name__ == "__main__":
    main()
