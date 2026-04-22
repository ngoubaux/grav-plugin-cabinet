<?php

namespace Grav\Plugin\Cabinet;

use Grav\Common\Grav;

class Import
{
    /** @var Core */
    private $core;

    public function __construct(Core $core)
    {
        $this->core = $core;
    }

    // ── Entry points ──────────────────────────────────────────────────────────

    public function handleImportClients(): void
    {
        $dryRun  = !empty($_POST['dry_run']) && $_POST['dry_run'] !== '0';
        $content = $this->readUploadedFile('file');
        if ($content === null) {
            $this->core->jsonExit(['error' => 'No file uploaded'], 400);
        }

        $result = $this->importClients($content, $dryRun);
        $this->core->jsonExit(['ok' => true, 'dry_run' => $dryRun] + $result);
    }

    public function handleImportRendezvous(): void
    {
        $dryRun  = !empty($_POST['dry_run']) && $_POST['dry_run'] !== '0';
        $content = $this->readUploadedFile('file');
        if ($content === null) {
            $this->core->jsonExit(['error' => 'No file uploaded'], 400);
        }

        $result = $this->importRendezvous($content, $dryRun);
        $this->core->jsonExit(['ok' => true, 'dry_run' => $dryRun] + $result);
    }

    // ── Clients import ────────────────────────────────────────────────────────

    private function importClients(string $csvContent, bool $dryRun): array
    {
        $rows    = $this->parseCsv($csvContent);
        $log     = [];
        $created = $updated = $skipped = $errors = 0;
        $practitionerId = $this->core->getCurrentPractitionerId();

        $flex = Grav::instance()['flex'] ?? null;
        $dir  = $this->getClientsDir($flex);
        if (!$dir) {
            return ['stats' => [], 'log' => [['action' => 'ERROR', 'msg' => 'Répertoire clients indisponible']]];
        }

        foreach ($rows as $row) {
            $email     = trim((string) ($row['email'] ?? ''));
            $firstName = trim((string) ($row['prenom'] ?? ''));
            $lastName  = trim((string) ($row['nom'] ?? ''));
            $phone     = $this->normalizePhone(trim((string) ($row['telephone'] ?? '')));
            $postal    = trim((string) ($row['code_postal'] ?? ''));

            if (!$email || !$firstName || !$lastName) {
                $log[] = ['action' => 'SKIP', 'msg' => 'Champs manquants : ' . implode(', ', array_filter([$email ? '' : 'email', $firstName ? '' : 'prenom', $lastName ? '' : 'nom']))];
                $skipped++;
                continue;
            }

            $payload = [
                'first_name' => $firstName,
                'last_name'  => $lastName,
                'email'      => $email,
                'phone'      => $phone,
            ];
            if ($postal) {
                $payload['notes'] = "Code postal : $postal";
            }

            $found = $phone ? $this->findClientByPhone($dir, $phone, $practitionerId) : null;
            if (!$found && $email) {
                $found = $this->findClientByEmail($dir, $email, $practitionerId);
            }

            if ($found) {
                ['uuid' => $uuid, 'contact' => $contact] = $found;
                $log[] = ['action' => 'UPDATE', 'msg' => "$lastName, $firstName <$email> (uuid=$uuid)"];
                if (!$dryRun) {
                    try {
                        $this->applyClientFields($contact, $payload);
                        if ($contact->save() === false) {
                            $log[] = ['action' => 'ERROR', 'msg' => "Échec sauvegarde : $lastName, $firstName"];
                            $errors++;
                        } else {
                            $updated++;
                        }
                    } catch (\Throwable $e) {
                        $log[] = ['action' => 'ERROR', 'msg' => $e->getMessage()];
                        $errors++;
                    }
                } else {
                    $updated++;
                }
            } else {
                $uuid          = $this->generateUuid();
                $payload['id'] = $uuid;
                $log[]         = ['action' => 'CREATE', 'msg' => "$lastName, $firstName <$email> (uuid=$uuid)"];
                if (!$dryRun) {
                    try {
                        $contact            = $dir->createObject([], $uuid);
                        $contact->published = true;
                        $contact->practitioner_id = $this->resolvePractitionerId();
                        $this->applyClientFields($contact, $payload);
                        if ($contact->save() === false) {
                            $log[] = ['action' => 'ERROR', 'msg' => "Échec création : $lastName, $firstName"];
                            $errors++;
                        } else {
                            $created++;
                        }
                    } catch (\Throwable $e) {
                        $log[] = ['action' => 'ERROR', 'msg' => $e->getMessage()];
                        $errors++;
                    }
                } else {
                    $created++;
                }
            }
        }

        return [
            'stats' => compact('created', 'updated', 'skipped', 'errors'),
            'log'   => $log,
        ];
    }

    // ── Rendez-vous import ────────────────────────────────────────────────────

    private function importRendezvous(string $icsContent, bool $dryRun): array
    {
        $events  = $this->parseIcs($icsContent);
        $log     = [];
        $created = $updated = $skipped = $errors = 0;
        $practitionerId = $this->core->getCurrentPractitionerId();

        $flex       = Grav::instance()['flex'] ?? null;
        $clientsDir = $this->getClientsDir($flex);
        $rdvDir     = $this->getRdvDir($flex);

        if (!$clientsDir || !$rdvDir) {
            return ['stats' => [], 'log' => [['action' => 'ERROR', 'msg' => 'Répertoires indisponibles']]];
        }

        // Build index of existing rdv: "uuid|date|hour" => {flex_id, record}
        $existingIndex = [];
        foreach ($rdvDir->getCollection() as $flexId => $record) {
            $arr  = $this->flexObjectToArray($record);
            if (!$this->belongsToPractitioner($arr, $practitionerId)) {
                continue;
            }
            $cid  = (string) ($arr['contact_uuid'] ?? '');
            $date = (string) ($arr['appointment_date'] ?? '');
            $hour = (string) ($arr['appointment_hour'] ?? '');
            if ($cid && $date) {
                $existingIndex["$cid|$date|$hour"] = ['flex_id' => (string) $flexId, 'record' => $record];
            }
        }

        foreach ($events as $ev) {
            $summary = (string) ($ev['SUMMARY'] ?? '');
            [$firstName, $lastName] = $this->extractName($summary);

            if (!$firstName || !$lastName) {
                $log[] = ['action' => 'SKIP', 'msg' => "Nom illisible : $summary"];
                $skipped++;
                continue;
            }

            $dtstart = (string) ($ev['DTSTART'] ?? '');
            if (!$dtstart) {
                $log[] = ['action' => 'SKIP', 'msg' => "DTSTART manquant : $summary"];
                $skipped++;
                continue;
            }

            [$dateStr, $hourStr] = $this->parseDt($dtstart);
            $durationMin = 60;
            if (!empty($ev['DTEND'])) {
                [$endDate, $endHour] = $this->parseDt((string) $ev['DTEND']);
                $start = strtotime("$dateStr $hourStr");
                $end   = strtotime("$endDate $endHour");
                if ($end > $start) {
                    $durationMin = (int) (($end - $start) / 60);
                }
            }

            $status   = $this->icsStatusToCabinet((string) ($ev['STATUS'] ?? 'CONFIRMED'));
            $apptType = $this->appointmentTypeFromDesc((string) ($ev['DESCRIPTION'] ?? ''));
            $icsUid   = (string) ($ev['UID'] ?? '');
            $descLine = explode("\n", (string) ($ev['DESCRIPTION'] ?? ''))[0] ?? '';
            $motif    = strtolower(trim($descLine)) !== 'à domicile' ? trim($descLine) : '';

            $client = $this->findClientByName($clientsDir, $firstName, $lastName, $practitionerId);
            if (!$client) {
                $log[] = ['action' => 'SKIP', 'msg' => "Client introuvable : $lastName, $firstName"];
                $skipped++;
                continue;
            }

            $contactUuid = $client['uuid'];
            $payload     = [
                'client_id'        => $contactUuid,
                'date'             => $dateStr,
                'heure'            => $hourStr,
                'status'           => $status,
                'appointment_type' => $apptType,
                'duree'            => $durationMin,
                'motif'            => $motif,
                'observations'     => $icsUid ? "ics_uid:$icsUid" : '',
            ];

            $key      = "$contactUuid|$dateStr|$hourStr";
            $existing = $existingIndex[$key] ?? null;

            if ($existing) {
                $flexId = $existing['flex_id'];
                $record = $existing['record'];
                $log[]  = ['action' => 'UPDATE', 'msg' => "$dateStr $hourStr  $lastName, $firstName ({$durationMin}min, $apptType, $status) [flex_id=$flexId]"];
                if (!$dryRun) {
                    try {
                        $this->applyRdvFields($record, $payload);
                        if ($record->save() === false) {
                            $log[] = ['action' => 'ERROR', 'msg' => "Échec UPDATE rdv $dateStr $hourStr $lastName"];
                            $errors++;
                        } else {
                            $updated++;
                        }
                    } catch (\Throwable $e) {
                        $log[] = ['action' => 'ERROR', 'msg' => $e->getMessage()];
                        $errors++;
                    }
                } else {
                    $updated++;
                }
            } else {
                $log[] = ['action' => 'CREATE', 'msg' => "$dateStr $hourStr  $lastName, $firstName ({$durationMin}min, $apptType, $status)"];
                if (!$dryRun) {
                    try {
                        $sessionId = substr(sha1(uniqid('rdv', true)), 0, 24);
                        $flexId    = substr(sha1("$contactUuid|$sessionId"), 0, 32);
                        $record    = $rdvDir->createObject([], $flexId);
                        $this->applyRdvFields($record, $payload, $sessionId);
                        $record->published = true;
                        $record->practitioner_id = $this->resolvePractitionerId();
                        if ($record->save() === false) {
                            $log[] = ['action' => 'ERROR', 'msg' => "Échec CREATE rdv $dateStr $hourStr $lastName"];
                            $errors++;
                        } else {
                            $created++;
                        }
                    } catch (\Throwable $e) {
                        $log[] = ['action' => 'ERROR', 'msg' => $e->getMessage()];
                        $errors++;
                    }
                } else {
                    $created++;
                }
            }
        }

        return [
            'stats' => compact('created', 'updated', 'skipped', 'errors'),
            'log'   => $log,
        ];
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private function readUploadedFile(string $field): ?string
    {
        if (isset($_FILES[$field]['tmp_name']) && is_uploaded_file($_FILES[$field]['tmp_name'])) {
            $content = file_get_contents($_FILES[$field]['tmp_name']);
            return $content !== false ? $content : null;
        }
        return null;
    }

    private function parseCsv(string $content): array
    {
        $content = str_replace("\r\n", "\n", $content);
        $lines   = explode("\n", $content);
        if (!$lines) {
            return [];
        }
        $header = str_getcsv(trim(array_shift($lines)));
        $rows   = [];
        foreach ($lines as $line) {
            $line = trim($line);
            if ($line === '') {
                continue;
            }
            $values = str_getcsv($line);
            if (count($values) === count($header)) {
                $rows[] = array_combine($header, $values);
            }
        }
        return $rows;
    }

    private function parseIcs(string $content): array
    {
        $content = preg_replace('/\r?\n[ \t]/', '', $content);
        $events  = [];
        preg_match_all('/BEGIN:VEVENT(.*?)END:VEVENT/s', $content, $matches);
        foreach ($matches[1] as $block) {
            $props = [];
            foreach (explode("\n", trim($block)) as $line) {
                $line = trim($line);
                if (strpos($line, ':') === false) {
                    continue;
                }
                [$key, $val] = explode(':', $line, 2);
                $key         = strtoupper(explode(';', $key)[0]);
                $val         = str_replace(['\\n', '\\N'], "\n", $val);
                $val         = str_replace(['\\,', '\\;', '\\:'], [',', ';', ':'], $val);
                $props[$key] = $val;
            }
            if ($props) {
                $events[] = $props;
            }
        }
        return $events;
    }

    private function extractName(string $summary): array
    {
        $summary = (string) preg_replace('/\s*\|.*$/', '', $summary);
        $tokens  = preg_split('/\s+/', trim($summary));
        if (!$tokens || $tokens === [false]) {
            return ['', ''];
        }
        $tokens  = array_values(array_filter($tokens));
        $lastIdx = count($tokens) - 1;
        for ($i = count($tokens) - 1; $i >= 0; $i--) {
            $clean = (string) preg_replace("/['\-]/", '', $tokens[$i]);
            if ($clean !== '' && ctype_upper($clean) && ctype_alpha($clean)) {
                $lastIdx = $i;
                break;
            }
        }
        $lastName  = $tokens[$lastIdx];
        $firstName = trim(implode(' ', array_slice($tokens, 0, $lastIdx)));
        return [$firstName, $lastName];
    }

    private function parseDt(string $value): array
    {
        $value = trim($value);
        if (substr($value, -1) === 'Z') {
            $utc = \DateTime::createFromFormat('Ymd\THis\Z', $value, new \DateTimeZone('UTC'));
            if ($utc) {
                $utc->setTimezone(new \DateTimeZone('Europe/Paris'));
                return [$utc->format('Y-m-d'), $utc->format('H:i')];
            }
        }
        if (strpos($value, 'T') !== false) {
            $dt = \DateTime::createFromFormat('Ymd\THis', $value);
            if ($dt) {
                return [$dt->format('Y-m-d'), $dt->format('H:i')];
            }
        }
        $dt = \DateTime::createFromFormat('Ymd', $value);
        if ($dt) {
            return [$dt->format('Y-m-d'), '00:00'];
        }
        return ['', '00:00'];
    }

    private function normalizePhone(string $phone): string
    {
        if (strpos($phone, '0') === 0 && strpos($phone, '00') !== 0) {
            $phone = '+33' . substr($phone, 1);
        }
        if (strpos($phone, '+330') === 0) {
            $phone = '+33' . substr($phone, 4);
        }
        return $phone;
    }

    private function icsStatusToCabinet(string $status): string
    {
        switch (strtoupper($status)) {
            case 'CONFIRMED': return 'confirmed';
            case 'CANCELLED': return 'cancelled';
            default:          return 'planned';
        }
    }

    private function appointmentTypeFromDesc(string $desc): string
    {
        $desc = strtolower($desc);
        if (strpos($desc, 'chaise') !== false) {
            return 'shiatsu_chair';
        }
        if (strpos($desc, 'sophrologie') !== false) {
            return 'sophrologie';
        }
        return 'shiatsu_futon';
    }

    private function generateUuid(): string
    {
        return sprintf(
            '%08x%04x%04x%04x%012x',
            random_int(0, 0xFFFFFFFF),
            random_int(0, 0xFFFF),
            random_int(0x4000, 0x4FFF),
            random_int(0x8000, 0xBFFF),
            random_int(0, 0xFFFFFFFFFFFF)
        );
    }

    private function getClientsDir($flex)
    {
        return $flex ? $flex->getDirectory('clients') : null;
    }

    private function getRdvDir($flex)
    {
        return $flex ? $flex->getDirectory('rendez_vous') : null;
    }

    private function flexObjectToArray($object): array
    {
        if (is_array($object)) {
            return $object;
        }
        if (!is_object($object)) {
            return [];
        }
        if (method_exists($object, 'toArray')) {
            $d = $object->toArray();
            return is_array($d) ? $d : [];
        }
        if (method_exists($object, 'jsonSerialize')) {
            $d = $object->jsonSerialize();
            return is_array($d) ? $d : [];
        }
        return [];
    }

    private function normalizeForSearch(string $value): string
    {
        if (class_exists('Normalizer')) {
            $value = \Normalizer::normalize($value, \Normalizer::FORM_D);
        }
        $value = (string) preg_replace('/[\x{0300}-\x{036f}]/u', '', $value);
        return strtolower($value);
    }

    private function findClientByEmail($dir, string $email, string $practitionerId): ?array
    {
        foreach ($dir->getCollection() as $uuid => $contact) {
            $data = $this->flexObjectToArray($contact);
            if (!$this->belongsToPractitioner($data, $practitionerId)) {
                continue;
            }
            if (!empty($data['email']) && strtolower((string) $data['email']) === strtolower($email)) {
                return ['uuid' => (string) $uuid, 'contact' => $contact];
            }
        }
        return null;
    }

    private function findClientByPhone($dir, string $phone, string $practitionerId): ?array
    {
        $needle = (string) preg_replace('/\s+/', '', $phone);
        if ($needle === '') {
            return null;
        }
        foreach ($dir->getCollection() as $uuid => $contact) {
            $data   = $this->flexObjectToArray($contact);
            if (!$this->belongsToPractitioner($data, $practitionerId)) {
                continue;
            }
            $stored = (string) preg_replace('/\s+/', '', (string) ($data['phone1'] ?? ''));
            if ($stored !== '' && $stored === $needle) {
                return ['uuid' => (string) $uuid, 'contact' => $contact];
            }
        }
        return null;
    }

    private function findClientByName($dir, string $firstName, string $lastName, string $practitionerId): ?array
    {
        $nFirst = $this->normalizeForSearch($firstName);
        $nLast  = $this->normalizeForSearch($lastName);
        foreach ($dir->getCollection() as $uuid => $contact) {
            $data = $this->flexObjectToArray($contact);
            if (!$this->belongsToPractitioner($data, $practitionerId)) {
                continue;
            }
            if (
                $this->normalizeForSearch((string) ($data['first_name'] ?? '')) === $nFirst
                && $this->normalizeForSearch((string) ($data['last_name'] ?? '')) === $nLast
            ) {
                return ['uuid' => (string) $uuid];
            }
        }
        return null;
    }

    private function applyClientFields($contact, array $data): void
    {
        foreach (['first_name', 'last_name', 'email', 'notes'] as $field) {
            if (array_key_exists($field, $data)) {
                $contact->$field = (string) $data[$field];
            }
        }
        if (array_key_exists('phone', $data)) {
            $contact->phone1 = (string) $data['phone'];
        }
    }

    private function applyRdvFields($record, array $data, string $sessionId = ''): void
    {
        $contactUuid = (string) ($data['client_id'] ?? '');
        $date        = (string) ($data['date'] ?? '');
        $hour        = (string) ($data['heure'] ?? '00:00');
        $duration    = (int) ($data['duree'] ?? 60);

        if ($sessionId === '') {
            $sessionId = (string) ($record->session_id ?? '');
            if ($sessionId === '') {
                $sessionId = substr(sha1(uniqid('rdv', true)), 0, 24);
            }
        }

        $record->session_id       = $sessionId;
        $record->contact_uuid     = $contactUuid;
        $record->appointment_date = $date;
        $record->appointment_hour = $hour;
        $record->status           = (string) ($data['status'] ?? 'planned');
        $record->appointment_type = (string) ($data['appointment_type'] ?? 'shiatsu_futon');
        $record->duration_minutes = $duration > 0 ? $duration : 60;
        $record->motif            = (string) ($data['motif'] ?? '');
        $record->observations     = (string) ($data['observations'] ?? '');
        $record->notes            = (string) ($data['observations'] ?? '');
        $record->published        = true;
    }

    private function resolvePractitionerId(): string
    {
        $id = $this->core->getCurrentPractitionerId();
        if ($id === '') {
            $this->core->jsonExit(['error' => 'Practitioner context required'], 401);
        }
        return $id;
    }

    private function belongsToPractitioner(array $record, string $practitionerId): bool
    {
        if ($practitionerId === '') {
            return false;
        }
        $pid = (string) ($record['practitioner_id'] ?? '');
        return $pid !== '' && $pid === $practitionerId;
    }
}
