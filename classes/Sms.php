<?php

namespace Grav\Plugin\Cabinet;

use Grav\Common\Grav;

class Sms
{
    private const API_URL = 'https://api.smsmobileapi.com/sendsms/';
    private const DEFAULT_PROVIDER = 'smsmobileapi';
    private const SIMPLE_GATEWAY_PROVIDER = 'simple_sms_gateway';
    private const LEGACY_HTTP_GATEWAY_PROVIDER = 'http_gateway';
    private const ANDROID_QUEUE_PROVIDER = 'android_queue';

    /** @var \Grav\Plugin\Cabinet\Core */
    private $core;

    public function __construct(\Grav\Plugin\Cabinet\Core $core)
    {
        $this->core = $core;
    }

    // ── Public API ────────────────────────────────────────────────────────────

    /**
     * Send a single SMS.
     *
     * @param string $clientUuid Optional — used by android_queue provider to link the queued
     *                           SMS to a client record in the communications history.
     * @return array{ok: bool, error?: string}
     */
    public function send(string $phone, string $message, string $clientUuid = ''): array
    {
        $phone = $this->normalizePhone($phone);
        if ($phone === '') {
            return ['ok' => false, 'error' => 'Numéro de téléphone invalide'];
        }

        $this->core->debugLog('SMS send', ['to' => $phone, 'len' => strlen($message)]);

        $provider = $this->getProvider();

        if ($provider === self::ANDROID_QUEUE_PROVIDER) {
            return $this->queueViaAndroid($phone, $message, $clientUuid);
        }

        if ($provider === self::SIMPLE_GATEWAY_PROVIDER || $provider === self::LEGACY_HTTP_GATEWAY_PROVIDER) {
            return $this->sendViaSimpleGateway($phone, $message);
        }

        return $this->sendViaSmsMobileApi($phone, $message);
    }

    /**
     * android_queue provider: write a `prepared` SMS into the communications queue.
     * MacroDroid or Termux polls GET /api/cabinet/sms/queue, sends via Android SMS radio,
     * then calls POST /api/cabinet/sms/queue/{id}/ack to mark it sent.
     *
     * @return array{ok: bool, queued?: bool, error?: string}
     */
    private function queueViaAndroid(string $phone, string $message, string $clientUuid = ''): array
    {
        $clientUuid = $this->normalizeUuid($clientUuid);

        $grav = Grav::instance();
        $flex = $grav['flex'] ?? null;
        if (!$flex) {
            return ['ok' => false, 'error' => 'Flex Objects non disponible'];
        }

        $dir = $flex->getDirectory('communications');
        if (!$dir) {
            // Try to register the directory from the blueprint.
            $blueprint = dirname(__DIR__) . '/blueprints/flex-objects/communications.yaml';
            if (file_exists($blueprint)) {
                try {
                    $flex->addDirectoryType('communications', $blueprint);
                } catch (\Throwable $e) {
                    $this->core->debugLog('android_queue: addDirectoryType failed', ['error' => $e->getMessage()]);
                }
            }
            $dir = $flex->getDirectory('communications');
        }

        if (!$dir) {
            return ['ok' => false, 'error' => 'Communications directory unavailable'];
        }

        $id  = substr(sha1($phone . '|' . $message . '|' . microtime(true)), 0, 32);
        $obj = $dir->createObject([], $id);
        $obj->published   = true;
        $obj->channel     = 'sms';
        $obj->to          = $phone;
        $obj->message     = $message;
        $obj->status      = 'prepared';
        $obj->created_at  = date('c');
        $obj->transport   = 'android_queue';
        $obj->client_uuid = $clientUuid;
        $obj->practitioner_id = $this->resolvePractitionerId();
        $obj->save();

        $this->core->debugLog('SMS queued for Android', ['id' => $id, 'to' => $phone]);

        return ['ok' => true, 'queued' => true];
    }

    private function sendViaSmsMobileApi(string $phone, string $message): array
    {
        $apiKey = $this->getSmsProviderToken();
        if ($apiKey === '') {
            return ['ok' => false, 'error' => 'Token SMS provider non configuré', 'status' => 400];
        }

        $payload = http_build_query([
            'apikey'     => $apiKey,
            'recipients' => $phone,
            'message'    => $message,
        ]);

        $ctx = stream_context_create([
            'http' => [
                'method'  => 'POST',
                'header'  => "Content-Type: application/x-www-form-urlencoded\r\n"
                           . "Content-Length: " . strlen($payload) . "\r\n",
                'content' => $payload,
                'timeout' => 10,
                'ignore_errors' => true,
            ],
        ]);

        $raw = @file_get_contents(self::API_URL, false, $ctx);
        if ($raw === false) {
            return ['ok' => false, 'error' => 'Erreur réseau', 'status' => 502];
        }

        $resp = json_decode($raw, true);
        $this->core->debugLog('SMS response', ['raw' => $raw]);

        // SMSMobileAPI returns either {"status":"success",...}
        // or {"result":{"error":"...","sent":"no"}}
        if (is_array($resp) && isset($resp['status']) && strtolower((string) $resp['status']) === 'success') {
            return ['ok' => true];
        }

        if (!is_array($resp)) {
            return ['ok' => false, 'error' => 'Réponse API invalide', 'status' => 502];
        }

        if (isset($resp['result']) && is_array($resp['result'])) {
            $result = $resp['result'];
            $sent = strtolower((string) ($result['sent'] ?? ''));
            if ($sent === 'yes') {
                return ['ok' => true];
            }

            $providerError = trim((string) ($result['error'] ?? ''));
            if ($providerError !== '') {
                return [
                    'ok' => false,
                    'error' => $this->mapProviderError($providerError),
                    'status' => 422,
                ];
            }
        }

        $errMsg = $resp['message'] ?? $resp['error'] ?? $raw;
        return ['ok' => false, 'error' => (string) $errMsg, 'status' => 422];
    }

    private function sendViaSimpleGateway(string $phone, string $message): array
    {
        $url = $this->getSimpleGatewayUrl();
        if ($url === '') {
            return ['ok' => false, 'error' => 'URL Simple SMS Gateway non configurée'];
        }

        $body = json_encode([
            'phone' => $phone,
            'message' => $message,
        ]);

        if ($body === false) {
            return ['ok' => false, 'error' => 'Impossible de sérialiser le payload'];
        }

        $headers = [
            'Content-Type: application/json',
            'Content-Length: ' . strlen($body),
        ];

        $token = $this->getSimpleGatewayToken();
        if ($token !== '') {
            $headers[] = 'Authorization: Bearer ' . $token;
        }

        $ctx = stream_context_create([
            'http' => [
                'method' => 'POST',
                'header' => implode("\r\n", $headers) . "\r\n",
                'content' => $body,
                'timeout' => 10,
                'ignore_errors' => true,
            ],
        ]);

        $raw = @file_get_contents($url, false, $ctx);
        if ($raw === false) {
            return ['ok' => false, 'error' => 'Simple SMS Gateway injoignable'];
        }

        $statusCode = $this->extractHttpStatusCode($http_response_header ?? []);
        $resp = json_decode($raw, true);
        $this->core->debugLog('SMS Simple Gateway response', ['code' => $statusCode, 'raw' => $raw]);

        if ($statusCode >= 200 && $statusCode < 300) {
            if (!is_array($resp)) {
                return ['ok' => true];
            }

            $ok = $resp['ok'] ?? null;
            $status = strtolower((string) ($resp['status'] ?? ''));
            if ($ok === true || $status === 'success' || $status === 'ok') {
                return ['ok' => true];
            }

            if ($ok === false || $status === 'error') {
                $errMsg = $resp['message'] ?? $resp['error'] ?? 'Erreur inconnue de la passerelle';
                return ['ok' => false, 'error' => (string) $errMsg];
            }

            return ['ok' => true];
        }

        if (is_array($resp)) {
            $errMsg = $resp['message'] ?? $resp['error'] ?? ('HTTP ' . $statusCode);
            return ['ok' => false, 'error' => (string) $errMsg];
        }

        return ['ok' => false, 'error' => 'HTTP ' . $statusCode . ' — ' . trim((string) $raw)];
    }

    /**
     * Send J-1 reminders to all tomorrow's non-cancelled, non-disabled appointments.
     *
     * @return array{sent: int, skipped: int, errors: array<string>}
     */
    public function sendRappelsJ1(): array
    {
        $tomorrow = (new \DateTime('tomorrow'))->format('Y-m-d');
        $results  = ['sent' => 0, 'skipped' => 0, 'errors' => []];
        $practitionerId = $this->core->getCurrentPractitionerId();

        $grav = Grav::instance();
        $flex = $grav['flex'] ?? null;
        if (!$flex) {
            return $results;
        }

        $rdvDir     = $flex->getDirectory('rendez_vous');
        $clientsDir = $flex->getDirectory('clients');
        if (!$rdvDir || !$clientsDir) {
            return $results;
        }

        foreach ($rdvDir->getCollection() as $record) {
            $data = $this->flexObjectToArray($record);
            if (!$this->belongsToPractitioner($data, $practitionerId)) {
                continue;
            }

            // Only tomorrow
            if (($data['appointment_date'] ?? '') !== $tomorrow) {
                continue;
            }

            // Skip cancelled
            $status = strtolower((string) ($data['status'] ?? ''));
            if ($status === 'cancelled') {
                $results['skipped']++;
                continue;
            }

            // Skip if reminder disabled on this appointment
            if (!empty($data['sms_rappel_disabled'])) {
                $results['skipped']++;
                continue;
            }

            // Skip if already sent today
            $sentDate = (string) ($data['sms_rappel_sent_date'] ?? '');
            if ($sentDate === date('Y-m-d')) {
                $results['skipped']++;
                continue;
            }

            // Fetch client phone
            $clientUuid = (string) ($data['contact_uuid'] ?? '');
            $client     = $clientsDir->getObject($clientUuid);
            if (!$client) {
                $results['skipped']++;
                continue;
            }
            if (!$this->belongsToPractitioner($this->flexObjectToArray($client), $practitionerId)) {
                $results['skipped']++;
                continue;
            }

            $phone     = (string) ($client->phone1 ?? '');
            $firstName = (string) ($client->first_name ?? '');
            $lastName  = (string) ($client->last_name ?? '');
            $heure     = (string) ($data['appointment_hour'] ?? '');

            if ($phone === '') {
                $results['errors'][] = "$firstName $lastName — pas de téléphone";
                continue;
            }

            $message = $this->buildRappelMessage($firstName, $heure);
            $result  = $this->send($phone, $message, $clientUuid);

            if ($result['ok']) {
                // Mark sent
                $record->sms_rappel_sent_date = date('Y-m-d');
                $record->save();
                $results['sent']++;
            } else {
                $results['errors'][] = "$firstName $lastName — " . ($result['error'] ?? 'erreur');
            }
        }

        return $results;
    }

    // ── HTTP endpoint handlers ─────────────────────────────────────────────────

    public function handleSendPreparation(): void
    {
        $raw  = file_get_contents('php://input');
        $body = json_decode($raw, true) ?? [];

        $phone   = trim((string) ($body['phone']   ?? ''));
        $message = trim((string) ($body['message'] ?? ''));

        if ($phone === '' || $message === '') {
            $this->core->jsonExit(['ok' => false, 'error' => 'phone et message requis'], 400);
        }

        $result = $this->send($phone, $message);
        $this->core->jsonExit($result, (int) ($result['status'] ?? ($result['ok'] ? 200 : 422)));
    }

    /**
     * Send preparation SMS directly from client_id — constructs message from template.
     */
    public function handleSendPreparationDirect(): void
    {
        $raw  = file_get_contents('php://input');
        $body = json_decode($raw, true) ?? [];
        $clientIdRaw = trim((string) ($body['client_id'] ?? ''));
        $clientId = $this->normalizeUuid($clientIdRaw);

        if ($clientIdRaw === '') {
            $this->core->jsonExit(['ok' => false, 'error' => 'client_id requis'], 400);
            return;
        }

        $grav = Grav::instance();
        $flex = $grav['flex'] ?? null;
        if (!$flex) {
            $this->core->jsonExit(['ok' => false, 'error' => 'Flex Objects non disponible'], 500);
            return;
        }

        $clientsDir = $flex->getDirectory('clients');
        if (!$clientsDir) {
            $this->core->jsonExit(['ok' => false, 'error' => 'Clients directory not found'], 500);
            return;
        }

        $client = $clientsDir->getObject($clientId);
        if (!$client && $clientIdRaw !== $clientId) {
            $client = $clientsDir->getObject($clientIdRaw);
        }
        if (!$client) {
            $this->core->jsonExit(['ok' => false, 'error' => 'Client non trouvé'], 404);
            return;
        }
        if (!$this->isOwnedByCurrentPractitioner($this->flexObjectToArray($client))) {
            $this->core->jsonExit(['ok' => false, 'error' => 'Forbidden'], 403);
            return;
        }

        $phone = (string) ($client->phone1 ?? '');
        if ($phone === '') {
            $this->core->jsonExit(['ok' => false, 'error' => 'Numéro de téléphone manquant'], 400);
            return;
        }

        // Build message from template + client data
        $message = $this->buildPreparationMessage($client, $clientId);
        if ($message === '') {
            $this->core->jsonExit(['ok' => false, 'error' => 'Template SMS préparation visite non configuré'], 400);
            return;
        }
        $result = $this->send($phone, $message, $clientId);
        $this->core->jsonExit($result, (int) ($result['status'] ?? ($result['ok'] ? 200 : 422)));
    }

    public function handleSendRappels(): void
    {
        $results = $this->sendRappelsJ1();
        $this->core->jsonExit($results);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private function getSmsProviderToken(): string
    {
        $config = Grav::instance()['config'];

        $value = trim((string) $config->get('plugins.cabinet.sms_push_token', ''));
        if ($value !== '') {
            return $value;
        }

        // Backward compatibility with previous dedicated SMSMobileAPI key.
        return trim((string) $config->get('plugins.cabinet.sms_api_key', ''));
    }

    private function getProvider(): string
    {
        $provider = trim((string) $this->core->getPractitionerConfig('sms_provider', self::DEFAULT_PROVIDER));
        if ($provider === '') {
            return self::DEFAULT_PROVIDER;
        }

        return strtolower($provider);
    }

    private function getSimpleGatewayUrl(): string
    {
        $config = Grav::instance()['config'];
        $value = trim((string) $config->get('plugins.cabinet.sms_simple_gateway_url', ''));
        if ($value !== '') {
            return $value;
        }

        // Backward compatibility with previous key name.
        return trim((string) $config->get('plugins.cabinet.sms_http_gateway_url', ''));
    }

    private function getSimpleGatewayToken(): string
    {
        $config = Grav::instance()['config'];

        // Unified push token (preferred).
        $value = trim((string) $config->get('plugins.cabinet.sms_push_token', ''));
        if ($value !== '') {
            return $value;
        }

        // Backward compatibility with previous key names.
        $value = trim((string) $config->get('plugins.cabinet.sms_simple_gateway_token', ''));
        if ($value !== '') {
            return $value;
        }

        return trim((string) $config->get('plugins.cabinet.sms_http_gateway_token', ''));
    }

    private function mapProviderError(string $code): string
    {
        $normalized = strtolower($code);

        $messages = [
            'subscription_expire' => 'Abonnement SMSMobileAPI expiré',
            'invalid_recipient' => 'Destinataire SMS invalide',
            'invalid_api_key' => 'Clé API SMS invalide',
            'insufficient_balance' => 'Crédit SMS insuffisant',
        ];

        return $messages[$normalized] ?? ('Erreur SMSMobileAPI: ' . $code);
    }

    /**
     * @param array<int, string> $headers
     */
    private function extractHttpStatusCode(array $headers): int
    {
        if (empty($headers[0])) {
            return 0;
        }

        if (preg_match('#^HTTP/\S+\s+(\d{3})#', $headers[0], $m)) {
            return (int) $m[1];
        }

        return 0;
    }

    private function normalizePhone(string $phone): string
    {
        // Strip spaces and keep +, digits only
        $phone = preg_replace('/[^\d+]/', '', $phone);
        if ($phone === '') {
            return '';
        }
        // French local → international
        if (str_starts_with($phone, '0')) {
            $phone = '+33' . substr($phone, 1);
        }
        return $phone;
    }

    private function normalizeUuid(string $value): string
    {
        return strtolower(str_replace('-', '', trim($value)));
    }

    private function buildRappelMessage(string $firstName, string $heure): string
    {
        $greeting = $firstName !== '' ? "Bonjour $firstName," : 'Bonjour,';
        $heureStr = $heure !== '' ? " à $heure" : '';
        return "$greeting\n\nRappel : vous avez une séance de shiatsu demain{$heureStr}.\n\n"
             . "📍 60 chemin du Val Fleuri 🔐 Code : 2507A 🏢 Bât B6 appt 08, 3ème étage\n\n"
             . "À demain, Nicolas";
    }

    /**
     * Build preparation SMS message from template and client data.
     *
     * @return string
     */
    private function buildPreparationMessage($client, string $clientId): string
    {
        // Get template from config
        $template = (string) $this->core->getPractitionerConfig('communication_template_prep_visite', '');
        if ($template === '') {
            return '';
        }

        // Build variables
        $vars = $this->buildTemplateVariables($client, $clientId);

        // Replace placeholders
        return $this->renderTemplate($template, $vars);
    }

    /**
     * Build template variables from client and their next session.
     *
     * @return array<string, string>
     */
    private function buildTemplateVariables($client, string $clientId): array
    {
        $grav = Grav::instance();
        $flex = $grav['flex'] ?? null;
        $practitionerId = $this->core->getCurrentPractitionerId();

        $firstName = (string) ($client->first_name ?? '');
        $googleReviewUrl = (string) $this->core->getPractitionerConfig('communication_google_review_url', '');
        $sessionSlot = '';
        $duration = '1h15';
        $sessionDate = '';

        // Get next session
        if ($flex) {
            $rdvDir = $flex->getDirectory('rendez_vous');
            if ($rdvDir) {
                $sessions = [];
                foreach ($rdvDir->getCollection() as $record) {
                    $recordData = $this->flexObjectToArray($record);
                    if (($recordData['contact_uuid'] ?? '') === $clientId
                        && $this->belongsToPractitioner($recordData, $practitionerId)) {
                        $sessions[] = $recordData;
                    }
                }

                if ($sessions) {
                    // Sort and find next future session
                    usort($sessions, function ($a, $b) {
                        $dateA = strtotime(($a['appointment_date'] ?? '') . ' ' . ($a['appointment_hour'] ?? '00:00'));
                        $dateB = strtotime(($b['appointment_date'] ?? '') . ' ' . ($b['appointment_hour'] ?? '00:00'));
                        return ($dateA ?: 0) - ($dateB ?: 0);
                    });

                    $now = time();
                    foreach ($sessions as $s) {
                        $sessionTime = strtotime(($s['appointment_date'] ?? '') . ' ' . ($s['appointment_hour'] ?? '00:00'));
                           if ($sessionTime !== false && $sessionTime >= $now) {
                               $dayLabel = is_numeric($sessionTime) ? date('l d F', (int)$sessionTime) : '';
                            $timeLabel = $s['appointment_hour'] ?? '00:00';
                            $sessionSlot = " de {$dayLabel} à {$timeLabel}";
                            $duration = $this->formatDuration((int) ($s['duree'] ?? 75));
                            $sessionDate = date('Y-m-d', $sessionTime);
                            break;
                        }
                    }
                }
            }
        }

        $preparationLink = $this->buildPreparationLink($client, $clientId);

        return [
            'first_name'          => $firstName,
            'session_slot'        => $sessionSlot,
            'preparation_link'    => $preparationLink,
            'duration'            => $duration,
            'session_date'        => $sessionDate,
            'session_date_label'  => $sessionDate ? ' du ' . date('d F Y', strtotime($sessionDate)) : '',
            'google_review_url'   => $googleReviewUrl,
        ];
    }

    /**
     * Render template by replacing {{variable}} placeholders.
     *
     * @param string $template
     * @param array<string, string> $vars
     * @return string
     */
    private function renderTemplate(string $template, array $vars): string
    {
        $result = $template;
        foreach ($vars as $key => $value) {
            $result = str_replace('{{' . $key . '}}', (string) $value, $result);
        }
        return $result;
    }

    /**
     * Build preparation visit link.
     *
     * @return string
     */
    private function buildPreparationLink($client, string $clientId): string
    {
        $grav = Grav::instance();
        $base = rtrim($grav['uri']->rootUrl(true), '/') . '/preparons-votre-visite';
        $cleanId = $this->compactUuid($clientId);
        return $cleanId ? "$base/id:$cleanId" : $base . '/';
    }

    /**
     * Compact UUID (remove dashes and take last 8 chars for brevity).
     */
    private function compactUuid(string $uuid): string
    {
        $uuid = str_replace('-', '', $uuid);
        return substr($uuid, -8) ?: '';
    }

    /**
     * Format duration in minutes to readable string.
     */
    private function formatDuration(int $minutes): string
    {
        $h = (int) ($minutes / 60);
        $m = $minutes % 60;
        if ($h > 0 && $m > 0) {
            return "{$h}h" . str_pad((string) $m, 2, '0', STR_PAD_LEFT);
        } elseif ($h > 0) {
            return "{$h}h";
        }
        return "{$m} min";
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

    private function resolvePractitionerId(): string
    {
        $id = $this->core->getCurrentPractitionerId();
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

    private function isOwnedByCurrentPractitioner(array $record): bool
    {
        return $this->belongsToPractitioner($record, $this->core->getCurrentPractitionerId());
    }
}
