#!/usr/bin/env python3
"""
Import rendez-vous from a Google Calendar ICS export into the Cabinet plugin.

Each VEVENT is matched to a client by first_name + last_name extracted from
the SUMMARY field ("Firstname LASTNAME | Resalib.fr").  If a matching
rendez-vous already exists on the same date/time for that client it is
updated; otherwise it is created.

Usage:
    BASE_URL=https://example.com API_KEY=your_key python3 import_rendezvous.py [file.ics]

Environment variables:
    BASE_URL  - Site base URL (default: http://shiatsu-dev:8080)
    API_KEY   - Cabinet plugin API key (cabinet.yaml → api_key)
    DRY_RUN   - Set to "1" to preview without making changes

Dry run:
    DRY_RUN=1 BASE_URL=https://your-site.com API_KEY=your_key python3 import_rendezvous.py

Live import:
    BASE_URL=https://your-site.com API_KEY=your_key python3 import_rendezvous.py
"""

import glob as _glob
import json
import os
import re
import sys
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone, timedelta

BASE_URL = os.environ.get("BASE_URL", "http://shiatsu-dev:8080").rstrip("/")
API_KEY  = os.environ.get("API_KEY", "")
DRY_RUN  = os.environ.get("DRY_RUN", "0") == "1"

# Europe/Paris UTC offset (handles both CET +1 and CEST +2)
# Python stdlib has no IANA tz database; we compute the offset at parse time
# using a simple DST rule (last Sunday of March → last Sunday of October).
def _paris_offset(dt_utc: datetime) -> timedelta:
    """Return the UTC offset for Europe/Paris at the given UTC datetime."""
    year = dt_utc.year
    def last_sunday(month: int) -> datetime:
        # Find last Sunday of the given month (in year)
        d = datetime(year, month, 31 if month in (1,3,5,7,8,10,12) else 30)
        # Walk back to Sunday (weekday 6)
        while d.weekday() != 6:
            d = d.replace(day=d.day - 1)
        return d
    # DST starts last Sunday March at 02:00 UTC, ends last Sunday October at 01:00 UTC
    dst_start = last_sunday(3).replace(hour=1, tzinfo=timezone.utc)
    dst_end   = last_sunday(10).replace(hour=1, tzinfo=timezone.utc)
    if dst_start <= dt_utc < dst_end:
        return timedelta(hours=2)   # CEST
    return timedelta(hours=1)       # CET


def utc_to_paris(dt_utc: datetime) -> datetime:
    """Convert a UTC datetime to Europe/Paris local time."""
    offset = _paris_offset(dt_utc)
    return (dt_utc + offset).replace(tzinfo=None)


# ── ICS parsing ──────────────────────────────────────────────────────────────

def _unfold(text: str) -> str:
    """Unfold RFC 5545 folded lines (CRLF or LF followed by a space/tab)."""
    return re.sub(r'\r?\n[ \t]', '', text)


def _parse_dt(value: str) -> datetime:
    """Parse DTSTART/DTEND value; handles UTC (Z) and basic DATE-TIME."""
    value = value.strip()
    if value.endswith('Z'):
        dt = datetime.strptime(value, '%Y%m%dT%H%M%SZ').replace(tzinfo=timezone.utc)
        return utc_to_paris(dt)
    if 'T' in value:
        return datetime.strptime(value, '%Y%m%dT%H%M%S')
    return datetime.strptime(value, '%Y%m%d')


def _unescape(value: str) -> str:
    """Unescape ICS text escapes (\\n → newline, \\, \\; \\:)."""
    value = value.replace('\\n', '\n').replace('\\N', '\n')
    value = value.replace('\\,', ',').replace('\\;', ';').replace('\\:', ':')
    return value


def parse_ics(path: str) -> list[dict]:
    """Return a list of event dicts parsed from the ICS file."""
    with open(path, encoding='utf-8') as fh:
        text = fh.read()

    text = _unfold(text)
    events = []
    for block in re.findall(r'BEGIN:VEVENT(.*?)END:VEVENT', text, re.DOTALL):
        props = {}
        for line in block.strip().splitlines():
            if ':' not in line:
                continue
            key, _, val = line.partition(':')
            # Strip property parameters (e.g. DTSTART;TZID=...)
            key = key.split(';')[0].upper()
            props[key] = _unescape(val)
        if props:
            events.append(props)
    return events


def extract_name(summary: str) -> tuple[str, str]:
    """
    Extract (first_name, last_name) from a SUMMARY like:
        "Anne Pierre  FLOC'H | Resalib.fr"
    Strategy: strip the " | Resalib.fr" suffix, split tokens.
    The last ALL-CAPS token (allowing hyphens/apostrophes) is the last name;
    everything before it is the first name.
    """
    summary = re.sub(r'\s*\|.*$', '', summary).strip()
    tokens = summary.split()
    if not tokens:
        return '', ''
    # Find rightmost token that looks like an ALL-CAPS last name
    last_idx = len(tokens) - 1
    for i in range(len(tokens) - 1, -1, -1):
        clean = re.sub(r"['\-]", '', tokens[i])
        if clean.isupper() and clean.isalpha():
            last_idx = i
            break
    last_name  = tokens[last_idx]
    first_name = ' '.join(tokens[:last_idx]).strip()
    return first_name, last_name


def ics_status_to_cabinet(ics_status: str) -> str:
    """Map ICS STATUS to cabinet status."""
    mapping = {
        'CONFIRMED':  'confirmed',
        'TENTATIVE':  'planned',
        'CANCELLED':  'cancelled',
    }
    return mapping.get(ics_status.upper(), 'planned')


def appointment_type_from_description(description: str) -> str:
    """Guess appointment_type from the event description text."""
    desc = description.lower()
    if 'chaise' in desc:
        return 'shiatsu_chair'
    if 'sophrologie' in desc:
        return 'sophrologie'
    return 'shiatsu_futon'


# ── API helpers ───────────────────────────────────────────────────────────────

def api(method: str, path: str, body: dict | None = None) -> dict:
    url = BASE_URL + path
    data = json.dumps(body).encode('utf-8') if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header('Content-Type', 'application/json')
    req.add_header('X-Api-Key', API_KEY)
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        body_text = e.read().decode('utf-8')
        try:
            return json.loads(body_text)
        except Exception:
            return {'error': f'HTTP {e.code}: {body_text}'}


def strip_accents(value: str) -> str:
    """Remove diacritics so 'Céline' matches 'Celine'."""
    return ''.join(
        c for c in unicodedata.normalize('NFD', value)
        if unicodedata.category(c) != 'Mn'
    )


def search_client_by_name(first_name: str, last_name: str) -> dict:
    path = '/api/contacts/search?' + urllib.parse.urlencode({
        'first_name': strip_accents(first_name),
        'last_name':  strip_accents(last_name),
    })
    return api('GET', path)


def get_all_rendezvous() -> list[dict]:
    result = api('GET', '/api/cabinet/rendezvous')
    if isinstance(result, list):
        return result
    # The endpoint returns {"items": [...]} or a list directly
    if isinstance(result, dict) and 'items' in result:
        return result['items']
    return []


def create_rendezvous(payload: dict) -> dict:
    return api('POST', '/api/cabinet/rendezvous', payload)


def update_rendezvous(flex_id: str, payload: dict) -> dict:
    return api('PUT', f'/api/cabinet/rendezvous/{urllib.parse.quote(flex_id)}', payload)


# ── Main ──────────────────────────────────────────────────────────────────────

def _find_ics() -> str:
    matches = sorted(_glob.glob('user/data/*.ics'))
    if not matches:
        print('ERROR: no .ics file found under user/data/', file=sys.stderr)
        sys.exit(1)
    if len(matches) > 1:
        print(f'Multiple ICS files found, using most recent: {matches[-1]}')
    return matches[-1]


def main():
    if not API_KEY:
        print('ERROR: API_KEY environment variable is required.', file=sys.stderr)
        print('  Set it to the value of api_key in user/plugins/cabinet/cabinet.yaml', file=sys.stderr)
        sys.exit(1)

    ics_path = sys.argv[1] if len(sys.argv) > 1 else _find_ics()

    if DRY_RUN:
        print('DRY RUN — no changes will be made.\n')

    events = parse_ics(ics_path)
    print(f'Parsed {len(events)} events from {ics_path}\n')

    # Build index of existing rendez-vous keyed by (contact_uuid, date, hour)
    existing_rdv: dict[tuple, dict] = {}
    print('Fetching existing rendez-vous…')
    for rdv in get_all_rendezvous():
        key = (
            str(rdv.get('client_id') or rdv.get('contact_uuid') or ''),
            str(rdv.get('date') or rdv.get('appointment_date') or ''),
            str(rdv.get('heure') or rdv.get('appointment_hour') or ''),
        )
        flex_id = str(rdv.get('flex_id') or rdv.get('id') or '')
        if key[0] and key[1] and flex_id:
            existing_rdv[key] = rdv
    print(f'Found {len(existing_rdv)} existing rendez-vous.\n')

    created = updated = skipped = errors = 0

    for ev in events:
        summary = ev.get('SUMMARY', '')
        first_name, last_name = extract_name(summary)

        if not first_name or not last_name:
            print(f'  SKIP (cannot parse name): {summary!r}')
            skipped += 1
            continue

        dtstart_raw = ev.get('DTSTART', '')
        dtend_raw   = ev.get('DTEND', '')
        if not dtstart_raw:
            print(f'  SKIP (no DTSTART): {summary!r}')
            skipped += 1
            continue

        dtstart = _parse_dt(dtstart_raw)
        date_str = dtstart.strftime('%Y-%m-%d')
        hour_str = dtstart.strftime('%H:%M')

        duration_min = 60
        if dtend_raw:
            dtend = _parse_dt(dtend_raw)
            diff  = int((dtend - dtstart).total_seconds() / 60)
            if diff > 0:
                duration_min = diff

        status        = ics_status_to_cabinet(ev.get('STATUS', 'CONFIRMED'))
        appt_type     = appointment_type_from_description(ev.get('DESCRIPTION', ''))
        ics_uid       = ev.get('UID', '')
        motif_raw     = ev.get('DESCRIPTION', '').split('\n')[0] if ev.get('DESCRIPTION') else ''
        motif         = motif_raw if motif_raw.lower() not in ('à domicile',) else ''

        # Find client
        client = search_client_by_name(first_name, last_name)
        if not client.get('found'):
            print(f'  SKIP (client not found): {last_name}, {first_name}')
            skipped += 1
            continue

        contact_uuid = client['uuid']

        payload = {
            'client_id':        contact_uuid,
            'date':             date_str,
            'heure':            hour_str,
            'status':           status,
            'appointment_type': appt_type,
            'duree':            duration_min,
        }
        if motif:
            payload['motif'] = motif
        # Store ICS UID in observations for traceability
        if ics_uid:
            payload['observations'] = f'ics_uid:{ics_uid}'

        # Check for existing rdv on same client/date/hour
        rdv_key = (contact_uuid, date_str, hour_str)
        existing = existing_rdv.get(rdv_key)

        if existing:
            flex_id = str(existing.get('flex_id') or existing.get('id') or '')
            print(f'  UPDATE {date_str} {hour_str}  {last_name}, {first_name} '
                  f'({duration_min}min, {appt_type}, {status}) [flex_id={flex_id}]')
            if not DRY_RUN:
                resp = update_rendezvous(flex_id, payload)
                if resp.get('ok'):
                    updated += 1
                else:
                    print(f'    ERROR: {resp}')
                    errors += 1
            else:
                updated += 1
        else:
            print(f'  CREATE {date_str} {hour_str}  {last_name}, {first_name} '
                  f'({duration_min}min, {appt_type}, {status})')
            if not DRY_RUN:
                resp = create_rendezvous(payload)
                if resp.get('ok'):
                    created += 1
                else:
                    print(f'    ERROR: {resp}')
                    errors += 1
            else:
                created += 1

    print(f'\nDone. Created: {created}  Updated: {updated}  Skipped: {skipped}  Errors: {errors}')


if __name__ == '__main__':
    main()
