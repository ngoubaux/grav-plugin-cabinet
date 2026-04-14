<?php

namespace Grav\Plugin\Cabinet;

use Grav\Common\Grav;

class Seances
{
    /** @var \Grav\Plugin\Cabinet\Core */
    private $core;

    /** @var \Grav\Plugin\Cabinet\Facturation */
    private $facturation;

    public function __construct(
        \Grav\Plugin\Cabinet\Core $core,
        \Grav\Plugin\Cabinet\Facturation $facturation
    )
    {
        $this->core = $core;
        $this->facturation = $facturation;
    }

    public function getData(): void
    {
        $this->core->jsonExit($this->buildDataPayload());
    }

    public function buildDataPayload(): array
    {
        $data = $this->loadData();

        $records = $data['rendez_vous_records'] ?? [];
        $rendezVous = $this->collectFromDirectory($records, $data['clients']);
        $facturation = $this->facturation->summarize($data['sessions']);

        $config = Grav::instance()['config'];
        return [
            'clients' => $data['clients'],
            'sessions' => $data['sessions'],
            'rendez_vous' => $rendezVous,
            'rendez_vous_by_day' => $this->indexByDay($rendezVous),
            'facturation' => $facturation,
            'config' => [
                'google_oauth_client_id' => (string) $config->get('plugins.cabinet.google_oauth_client_id', ''),
                'google_calendar_id'     => (string) $config->get('plugins.cabinet.google_calendar_id', ''),
                'drive_bilan_path'       => (string) $config->get('plugins.cabinet.drive_bilan_path', 'onyx/NoteAir5c/Cahiers/clients'),
                'sms_enabled'            => (bool)   $config->get('plugins.cabinet.sms_enabled', false),
            ],
        ];
    }

    public function buildRendezVousPayload(): array
    {
        $data = $this->loadData();
        $records = $data['rendez_vous_records'] ?? [];
        $rendezVous = $this->collectFromDirectory($records, $data['clients']);

        return [
            'rendez_vous' => $rendezVous,
            'rendez_vous_by_day' => $this->indexByDay($rendezVous),
        ];
    }

    public function buildFacturationPayload(): array
    {
        $data = $this->loadData();

        return [
            'facturation' => $this->facturation->summarize($data['sessions']),
        ];
    }

    // ── CRUD : clients ────────────────────────────────────────────────────────

    public function createClientRecord(): void
    {
        $data = $this->requireJsonBody();
        $uuid = $this->normalizeUuid((string) ($data['id'] ?? ($data['grav_uuid'] ?? '')));
        if ($uuid === '') {
            $this->core->jsonExit(['error' => 'Client ID required'], 400);
        }

        $dir = $this->requireClientsDirectory();
        if ($dir->getObject($uuid)) {
            $this->core->jsonExit(['error' => 'Client already exists'], 409);
        }

        $contact = $dir->createObject([], $uuid);
        $this->applyClientFields($contact, $data, $uuid);
        if ($contact->save() === false) {
            $this->core->jsonExit(['error' => 'Save failed'], 500);
        }

        $this->core->jsonExit(['ok' => true, 'id' => $uuid]);
    }

    public function updateClientRecord(string $id): void
    {
        $data = $this->requireJsonBody();
        $uuid = $this->normalizeUuid($id);

        $dir = $this->requireClientsDirectory();
        $contact = $dir->getObject($uuid);
        if (!$contact) {
            $this->core->jsonExit(['error' => 'Client not found'], 404);
        }

        $this->applyClientFields($contact, $data, $uuid);
        if ($contact->save() === false) {
            $this->core->jsonExit(['error' => 'Save failed'], 500);
        }

        $this->core->jsonExit(['ok' => true]);
    }

    public function deleteClientRecord(string $id): void
    {
        $uuid = $this->normalizeUuid($id);
        $dir = $this->requireClientsDirectory();
        $contact = $dir->getObject($uuid);
        if ($contact && method_exists($contact, 'delete')) {
            $contact->delete();
        }
        $this->core->jsonExit(['ok' => true]);
    }

    // ── CRUD : rendez-vous ────────────────────────────────────────────────────

    public function createRendezvousRecord(): void
    {
        $data = $this->requireJsonBody();
        $contactUuid = $this->normalizeUuid((string) ( $data['client_id'] ?? ''));
        if ($contactUuid === '') {
            $this->core->jsonExit(['error' => 'client_id required'], 400);
        }

        $sessionId = (string) ($data['id'] ?? '');
        if ($sessionId === '') {
            $sessionId = substr(sha1($contactUuid . '|' . microtime()), 0, 24);
        }

        $flexId = substr(sha1($contactUuid . '|' . $sessionId), 0, 32);
        $dir = $this->requireRendezVousDirectory();

        $record = $dir->createObject([], $flexId);
        $this->applyRendezvousFields($record, $data, $contactUuid, $sessionId);
        if ($record->save() === false) {
            $this->core->jsonExit(['error' => 'Save failed — check required fields (date, duration)'], 500);
        }

        $this->core->jsonExit(['ok' => true, 'flex_id' => $flexId, 'session_id' => $sessionId]);
    }

    public function updateRendezvousRecord(string $flexId): void
    {
        $data = $this->requireJsonBody();
        $dir = $this->requireRendezVousDirectory();

        $record = $dir->getObject($flexId);
        if (!$record) {
            $this->core->jsonExit(['error' => 'Rendez-vous not found'], 404);
        }

        $contactUuid = (string) ($record->contact_uuid ?? '');
        $sessionId = (string) ($record->session_id ?? $flexId);
        $this->applyRendezvousFields($record, $data, $contactUuid, $sessionId);
        if ($record->save() === false) {
            $this->core->jsonExit(['error' => 'Save failed'], 500);
        }

        $this->core->jsonExit(['ok' => true]);
    }

    public function deleteRendezvousRecord(string $flexId): void
    {
        $dir = $this->requireRendezVousDirectory();
        $record = $dir->getObject($flexId);
        if ($record && method_exists($record, 'delete')) {
            $record->delete();
        }
        $this->core->jsonExit(['ok' => true]);
    }

    // ── Private CRUD helpers ──────────────────────────────────────────────────

    private function requireJsonBody(): array
    {
        $raw = file_get_contents('php://input');
        $data = json_decode($raw, true);
        if (!is_array($data)) {
            $this->core->jsonExit(['error' => 'Invalid JSON body'], 400);
        }
        return $data;
    }

    private function requireClientsDirectory()
    {
        $grav = Grav::instance();
        $flex = $grav['flex'] ?? null;
        $dir = $flex ? $flex->getDirectory('clients') : null;
        if (!$dir) {
            $this->core->jsonExit(['error' => 'clients directory unavailable'], 500);
        }
        return $dir;
    }

    private function requireRendezVousDirectory()
    {
        $grav = Grav::instance();
        $flex = $grav['flex'] ?? null;
        $dir = $this->getRendezVousDirectory($flex);
        if (!$dir) {
            $this->core->jsonExit(['error' => 'rendez_vous directory unavailable'], 500);
        }
        return $dir;
    }

    private function applyClientFields($contact, array $data, string $uuid): void
    {
        foreach (['first_name', 'last_name', 'email', 'motif', 'ddn', 'antecedents', 'notes'] as $field) {
            if (array_key_exists($field, $data)) {
                $contact->$field = (string) $data[$field];
            }
        }
        if (array_key_exists('phone', $data)) {
            $contact->phone1 = (string) $data['phone'];
        }
        foreach (['grav_uuid', 'gdoc_anamn_id', 'gdoc_bilan_id', 'grav_rdv'] as $field) {
            if (array_key_exists($field, $data)) {
                $contact->$field = (string) $data[$field];
            }
        }
        if (!isset($contact->published)) {
            $contact->published = true;
        }
    }

    private function applyRendezvousFields($record, array $data, string $contactUuid, string $sessionId): void
    {
        $dateSource = (string) ($data['datetime'] ?? '');
        if ($dateSource === '') {
            $date = (string) ($data['date'] ?? '');
            $heure = (string) ($data['heure'] ?? '00:00');
            if ($date !== '') {
                $dateSource = $date . 'T' . $heure;
            }
        }
        $parts = $this->splitDatetime($dateSource);

        $record->published = true;
        $record->session_id = $sessionId;
        $record->contact_uuid = $contactUuid;
        $record->appointment_date = $parts['date'];
        $record->appointment_hour = $parts['hour'];
        $record->status = $this->frontendStatusToFlex((string) ($data['status'] ?? 'scheduled'));
        $record->appointment_type = (string) ($data['appointment_type'] ?? 'shiatsu_futon');
        $duration = (int) ($data['duree'] ?? ($data['duration'] ?? 60));
        $record->duration_minutes = $duration > 0 ? $duration : 60;
        $record->motif = (string) ($data['motif'] ?? '');
        $record->observations = (string) ($data['observations'] ?? '');
        $record->notes = (string) ($data['observations'] ?? '');
        $record->exercices = (string) ($data['exercices'] ?? '');
        $record->prochaine = (string) ($data['prochaine'] ?? '');
        $record->bilan = is_array($data['bilan'] ?? null) ? $data['bilan'] : [];
        if (array_key_exists('google_event_id', $data)) {
            $record->google_event_id = (string) $data['google_event_id'];
        }
        if (array_key_exists('google_event_link', $data)) {
            $record->google_event_link = (string) $data['google_event_link'];
        }
        $record->sms_rappel_disabled = !empty($data['sms_rappel_disabled']);
    }

    private function loadData(): array
    {
        $grav = Grav::instance();
        $flex = $grav['flex'] ?? null;
        $clientsDir = $flex ? $flex->getDirectory('clients') : null;
        $rendezVousDir = $this->getRendezVousDirectory($flex);

        $sessions = [];
        $rendezVousRecords = [];

        if ($rendezVousDir) {
            foreach ($rendezVousDir->getCollection() as $storageKey => $record) {
                $arr = $this->flexObjectToArray($record);
                $arr['_flex_key'] = (string) $storageKey;
                $rendezVousRecords[] = $arr;
            }

            $sessions = $this->sessionsFromRendezVousRecords($rendezVousRecords);
        }

        $appointmentsFromRendezVous = $this->recordsToClientAppointmentsIndex($rendezVousRecords);

        if (!$clientsDir) {
            return [
                'clients' => [],
                'sessions' => $sessions,
                'rendez_vous_records' => $rendezVousRecords,
            ];
        }

        $clients = [];

        foreach ($clientsDir->getCollection() as $uuid => $contact) {
            $data = $this->flexObjectToArray($contact);

            $appointments = $appointmentsFromRendezVous[$uuid] ?? [];

            $clients[$uuid] = [
                'first_name' => $data['first_name'] ?? '',
                'last_name' => $data['last_name'] ?? '',
                'email' => $data['email'] ?? '',
                'phone' => $data['phone1'] ?? '',
                'grav_uuid' => $uuid,
                'created' => $data['created'] ?? date('Y-m-d H:i:s'),
                'appointments' => $appointments,
                'ddn' => $data['ddn'] ?? '',
                'motif' => $data['motif'] ?? '',
                'antecedents' => $data['antecedents'] ?? '',
                'notes' => $data['notes'] ?? '',
            ];
        }

        return [
            'clients' => $clients,
            'sessions' => $sessions,
            'rendez_vous_records' => $rendezVousRecords,
        ];
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
            $data = $object->toArray();
            return is_array($data) ? $data : [];
        }

        if (method_exists($object, 'jsonSerialize')) {
            $data = $object->jsonSerialize();
            return is_array($data) ? $data : [];
        }

        return [];
    }

    private function collectFromDirectory(array $records, array $clientsById): array
    {
        $items = [];

        foreach ($records as $record) {
            if (!is_array($record)) {
                continue;
            }

            $clientId = (string) ($record['contact_uuid'] ?? '');
            $client = $clientsById[$clientId] ?? [];
            $clientName = trim((string) (($client['first_name'] ?? '') . ' ' . ($client['last_name'] ?? '')));

            $date = (string) ($record['appointment_date'] ?? '');
            $hour = (string) ($record['appointment_hour'] ?? '00:00');
            $datetime = $date !== '' ? ($date . 'T' . $hour) : '';

            $items[] = [
                'id' => (string) ($record['session_id'] ?? substr(sha1($clientId . '|' . $datetime), 0, 24)),
                'flex_id' => (string) ($record['_flex_key'] ?? ''),
                'client_id' => $clientId,
                'client_name' => $clientName,
                'datetime' => $datetime,
                'date' => $date,
                'heure' => $hour,
                'duration' => (int) ($record['duration_minutes'] ?? 0),
                'duree' => (string) ((int) ($record['duration_minutes'] ?? 0)),
                'status' => $this->flexStatusToFrontend((string) ($record['status'] ?? 'planned')),
                'notes' => (string) ($record['notes'] ?? ''),
                'type' => (string) ($record['appointment_type'] ?? 'shiatsu_futon'),
                'appointment_type' => (string) ($record['appointment_type'] ?? 'shiatsu_futon'),
                'motif' => (string) ($record['motif'] ?? ''),
                'observations' => (string) ($record['observations'] ?? ''),
                'exercices' => (string) ($record['exercices'] ?? ''),
                'prochaine' => (string) ($record['prochaine'] ?? ''),
                'bilan' => is_array($record['bilan'] ?? null) ? $record['bilan'] : null,
                'google_event_id'      => (string) ($record['google_event_id']      ?? ''),
                'google_event_link'    => (string) ($record['google_event_link']    ?? ''),
                'sms_rappel_disabled'  => !empty($record['sms_rappel_disabled']),
            ];
        }

        usort($items, static function (array $a, array $b): int {
            return strcmp($a['datetime'], $b['datetime']);
        });

        return $items;
    }

    private function recordsToClientAppointmentsIndex(array $records): array
    {
        $index = [];

        foreach ($records as $record) {
            if (!is_array($record)) {
                continue;
            }

            $clientId = (string) ($record['contact_uuid'] ?? '');
            if ($clientId === '') {
                continue;
            }

            $date = (string) ($record['appointment_date'] ?? '');
            $hour = (string) ($record['appointment_hour'] ?? '00:00');
            $datetime = $date !== '' ? ($date . 'T' . $hour) : '';

            if (!isset($index[$clientId])) {
                $index[$clientId] = [];
            }

            $index[$clientId][] = [
                'datetime' => $datetime,
                'duration' => (int) ($record['duration_minutes'] ?? 0),
                'status' => $this->flexStatusToFrontend((string) ($record['status'] ?? 'planned')),
                'notes' => (string) ($record['notes'] ?? ''),
            ];
        }

        return $index;
    }

    private function frontendStatusToFlex(string $status): string
    {
        $status = strtolower(trim($status));

        if ($status === 'completed' || $status === 'done') {
            return 'done';
        }

        if ($status === 'cancelled') {
            return 'cancelled';
        }

        if ($status === 'confirmed') {
            return 'confirmed';
        }

        return 'planned';
    }

    private function splitDatetime(string $datetime): array
    {
        $value = trim($datetime);
        if ($value === '') {
            return ['date' => '', 'hour' => '00:00'];
        }

        $value = str_replace(' ', 'T', $value);
        $parts = explode('T', $value, 2);
        $date = $parts[0] ?? '';
        $hour = $parts[1] ?? '00:00';

        if (strlen($hour) >= 5) {
            $hour = substr($hour, 0, 5);
        }

        return ['date' => $date, 'hour' => $hour ?: '00:00'];
    }

    private function indexByDay(array $rendezVous): array
    {
        $byDay = [];

        foreach ($rendezVous as $item) {
            $date = substr((string) ($item['datetime'] ?? ''), 0, 10);
            if ($date === '') {
                continue;
            }

            if (!isset($byDay[$date])) {
                $byDay[$date] = [];
            }

            $byDay[$date][] = $item;
        }

        ksort($byDay);

        return $byDay;
    }

    private function sessionsFromRendezVousRecords(array $records): array
    {
        $sessions = [];

        foreach ($records as $record) {
            if (!is_array($record)) {
                continue;
            }

            $sessionId = (string) ($record['session_id'] ?? '');
            if ($sessionId === '') {
                continue;
            }

            $clientId = (string) ($record['contact_uuid'] ?? '');
            if ($clientId === '') {
                continue;
            }

            if (!isset($sessions[$clientId])) {
                $sessions[$clientId] = [];
            }

            $date = (string) ($record['appointment_date'] ?? '');
            $hour = (string) ($record['appointment_hour'] ?? '00:00');
            $datetime = $date !== '' ? $date . 'T' . $hour : '';
            $bilan = $record['bilan'] ?? null;

            $sessions[$clientId][] = [
                'id' => $sessionId,
                'flex_id' => (string) ($record['_flex_key'] ?? ''),
                'date' => $date,
                'heure' => $hour,
                'datetime' => $datetime,
                'duree' => (string) ((int) ($record['duration_minutes'] ?? 60)),
                'status' => $this->flexStatusToSessionStatus((string) ($record['status'] ?? 'planned')),
                'appointment_type' => (string) ($record['appointment_type'] ?? 'shiatsu_futon'),
                'motif' => (string) ($record['motif'] ?? ''),
                'observations' => (string) ($record['observations'] ?? ''),
                'exercices' => (string) ($record['exercices'] ?? ''),
                'prochaine' => (string) ($record['prochaine'] ?? ''),
                'bilan'               => is_array($bilan) ? $bilan : null,
                'sms_rappel_disabled'  => !empty($record['sms_rappel_disabled']),
            ];
        }

        return $sessions;
    }

    private function normalizeUuid(string $value): string
    {
        return strtolower(str_replace('-', '', trim($value)));
    }

    private function getRendezVousDirectory($flex)
    {
        if (!$flex) {
            return null;
        }

        $directory = $flex->getDirectory('rendez_vous');
        if ($directory) {
            return $directory;
        }

        $blueprint = dirname(__DIR__) . '/blueprints/flex-objects/rendez_vous.yaml';
        if (!file_exists($blueprint)) {
            return null;
        }

        try {
            $flex->addDirectoryType('rendez_vous', $blueprint);
        } catch (\Throwable $e) {
            $this->core->debugLog('rendez_vous addDirectoryType failed', ['error' => $e->getMessage()]);
            return null;
        }

        return $flex->getDirectory('rendez_vous');
    }

    private function flexStatusToSessionStatus(string $status): string
    {
        $status = strtolower(trim($status));

        if ($status === 'done') {
            return 'completed';
        }

        if ($status === 'cancelled') {
            return 'cancelled';
        }

        if ($status === 'confirmed') {
            return 'confirmed';
        }

        return 'scheduled';
    }

    private function flexStatusToFrontend(string $status): string
    {
        $status = strtolower(trim($status));

        if ($status === 'done') {
            return 'completed';
        }

        if ($status === 'cancelled') {
            return 'cancelled';
        }

        return 'scheduled';
    }
}
