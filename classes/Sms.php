<?php

namespace Grav\Plugin\Cabinet;

use Grav\Common\Grav;

class Sms
{
    private const API_URL = 'https://api.smsmobileapi.com/sendsms/';

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
     * @return array{ok: bool, error?: string}
     */
    public function send(string $phone, string $message): array
    {
        $apiKey = $this->getApiKey();
        if ($apiKey === '') {
            return ['ok' => false, 'error' => 'Clé API SMS non configurée'];
        }

        $phone = $this->normalizePhone($phone);
        if ($phone === '') {
            return ['ok' => false, 'error' => 'Numéro de téléphone invalide'];
        }

        $this->core->debugLog('SMS send', ['to' => $phone, 'len' => strlen($message)]);

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
            return ['ok' => false, 'error' => 'Erreur réseau'];
        }

        $resp = json_decode($raw, true);
        $this->core->debugLog('SMS response', ['raw' => $raw]);

        // SMSMobileAPI returns {"status":"success",...} or {"status":"error","message":"..."}
        if (isset($resp['status']) && strtolower($resp['status']) === 'success') {
            return ['ok' => true];
        }

        $errMsg = $resp['message'] ?? $resp['error'] ?? $raw;
        return ['ok' => false, 'error' => (string) $errMsg];
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
            $data = method_exists($record, 'toArray') ? $record->toArray() : [];

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

            $phone     = (string) ($client->phone1 ?? '');
            $firstName = (string) ($client->first_name ?? '');
            $lastName  = (string) ($client->last_name ?? '');
            $heure     = (string) ($data['appointment_hour'] ?? '');

            if ($phone === '') {
                $results['errors'][] = "$firstName $lastName — pas de téléphone";
                continue;
            }

            $message = $this->buildRappelMessage($firstName, $heure);
            $result  = $this->send($phone, $message);

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
        $this->core->jsonExit($result, $result['ok'] ? 200 : 502);
    }

    public function handleSendRappels(): void
    {
        $results = $this->sendRappelsJ1();
        $this->core->jsonExit($results);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private function getApiKey(): string
    {
        return trim((string) Grav::instance()['config']->get('plugins.cabinet.sms_api_key', ''));
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

    private function buildRappelMessage(string $firstName, string $heure): string
    {
        $greeting = $firstName !== '' ? "Bonjour $firstName," : 'Bonjour,';
        $heureStr = $heure !== '' ? " à $heure" : '';
        return "$greeting\n\nRappel : vous avez une séance de shiatsu demain{$heureStr}.\n\n"
             . "📍 60 chemin du Val Fleuri 🔐 Code : 2507A 🏢 Bât B6 appt 08, 3ème étage\n\n"
             . "À demain, Nicolas";
    }
}
