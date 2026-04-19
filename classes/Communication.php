<?php

namespace Grav\Plugin\Cabinet;

use Grav\Common\Grav;

class Communication
{
    /** @var \Grav\Plugin\Cabinet\Core */
    private $core;

    public function __construct(\Grav\Plugin\Cabinet\Core $core)
    {
        $this->core = $core;
    }

    public function communicationsByClient(): array
    {
        $result = [];
        $dir = $this->getCommunicationsDirectory(Grav::instance()['flex'] ?? null);
        if (!$dir) {
            return $result;
        }

        foreach ($dir->getCollection() as $storageKey => $record) {
            $arr = $this->flexObjectToArray($record);
            $clientId = (string) ($arr['client_uuid'] ?? '');
            if ($clientId === '') {
                continue;
            }

            if (!isset($result[$clientId])) {
                $result[$clientId] = [];
            }

            $result[$clientId][] = [
                'id' => (string) ($storageKey ?: ($arr['id'] ?? '')),
                'createdAt' => (string) ($arr['created_at'] ?? ''),
                'channel' => (string) ($arr['channel'] ?? 'sms'),
                'to' => (string) ($arr['to'] ?? ''),
                'subject' => (string) ($arr['subject'] ?? ''),
                'message' => (string) ($arr['message'] ?? ''),
                'status' => (string) ($arr['status'] ?? 'prepared'),
                'followUpAt' => (string) ($arr['follow_up_at'] ?? ''),
                'transport' => (string) ($arr['transport'] ?? ''),
            ];
        }

        return $result;
    }

    public function updateClientCommunicationsRecord(string $id): void
    {
        $data = $this->requireJsonBody();
        $uuid = $this->normalizeUuid($id);

        $clients = $this->requireClientsDirectory();
        if (!$clients->getObject($uuid)) {
            $this->core->jsonExit(['error' => 'Client not found'], 404);
        }

        $entries = is_array($data['communications'] ?? null) ? $data['communications'] : [];
        $dir = $this->requireCommunicationsDirectory();

        $this->deleteCommunicationsForClient($uuid, $dir);

        foreach ($entries as $entry) {
            if (!is_array($entry)) {
                continue;
            }

            $objectId = (string) ($entry['id'] ?? '');
            if ($objectId === '') {
                $objectId = substr(sha1($uuid . '|' . json_encode($entry) . '|' . microtime()), 0, 32);
            }

            $obj = $dir->createObject([], $objectId);
            $obj->published = true;
            $obj->client_uuid = $uuid;
            $obj->created_at = (string) ($entry['createdAt'] ?? date('c'));
            $obj->channel = (string) ($entry['channel'] ?? 'sms');
            $obj->to = (string) ($entry['to'] ?? '');
            $obj->subject = (string) ($entry['subject'] ?? '');
            $obj->message = (string) ($entry['message'] ?? '');
            $obj->status = (string) ($entry['status'] ?? 'prepared');
            $obj->follow_up_at = (string) ($entry['followUpAt'] ?? '');
            $obj->transport = (string) ($entry['transport'] ?? '');
            $obj->save();
        }

        $this->core->jsonExit(['ok' => true]);
    }

    public function deleteCommunicationsForClient(string $clientUuid, $dir = null): void
    {
        $communicationsDir = $dir ?: $this->getCommunicationsDirectory(Grav::instance()['flex'] ?? null);
        if (!$communicationsDir) {
            return;
        }

        foreach ($communicationsDir->getCollection() as $storageKey => $record) {
            $arr = $this->flexObjectToArray($record);
            if ((string) ($arr['client_uuid'] ?? '') !== $clientUuid) {
                continue;
            }
            $obj = $communicationsDir->getObject((string) $storageKey);
            if ($obj && method_exists($obj, 'delete')) {
                $obj->delete();
            }
        }
    }

    private function requireJsonBody(): array
    {
        $raw = file_get_contents('php://input');
        $data = json_decode($raw, true);
        if (!is_array($data)) {
            $this->core->jsonExit(['error' => 'Invalid JSON body'], 400);
        }
        return $data;
    }

    private function normalizeUuid(string $value): string
    {
        return strtolower(str_replace('-', '', trim($value)));
    }

    private function requireClientsDirectory()
    {
        $grav = Grav::instance();
        $flex = $grav['flex'] ?? null;
        $dir = $this->getClientsDirectory($flex);
        if (!$dir) {
            $this->core->jsonExit(['error' => 'clients directory unavailable'], 500);
        }
        return $dir;
    }

    private function requireCommunicationsDirectory()
    {
        $grav = Grav::instance();
        $flex = $grav['flex'] ?? null;
        $dir = $this->getCommunicationsDirectory($flex);
        if (!$dir) {
            $this->core->jsonExit(['error' => 'communications directory unavailable'], 500);
        }
        return $dir;
    }

    private function getClientsDirectory($flex)
    {
        if (!$flex) {
            return null;
        }

        $directory = $flex->getDirectory('clients');
        if ($directory) {
            return $directory;
        }

        $blueprint = dirname(__DIR__) . '/blueprints/flex-objects/clients.yaml';
        if (!file_exists($blueprint)) {
            return null;
        }

        try {
            $flex->addDirectoryType('clients', $blueprint);
        } catch (\Throwable $e) {
            $this->core->debugLog('clients addDirectoryType failed', ['error' => $e->getMessage()]);
            return null;
        }

        return $flex->getDirectory('clients');
    }

    private function getCommunicationsDirectory($flex)
    {
        if (!$flex) {
            return null;
        }

        $directory = $flex->getDirectory('communications');
        if ($directory) {
            return $directory;
        }

        $blueprint = dirname(__DIR__) . '/blueprints/flex-objects/communications.yaml';
        if (!file_exists($blueprint)) {
            return null;
        }

        try {
            $flex->addDirectoryType('communications', $blueprint);
        } catch (\Throwable $e) {
            $this->core->debugLog('communications addDirectoryType failed', ['error' => $e->getMessage()]);
            return null;
        }

        return $flex->getDirectory('communications');
    }

    // ── SMS queue (Termux cron) ───────────────────────────────────────────────

    /**
     * Return all SMS communications whose status is 'prepared'.
     * Used by the Termux cron script to fetch pending messages.
     */
    public function getSmsQueue(): void
    {
        $dir = $this->requireCommunicationsDirectory();
        $items = [];

        foreach ($dir->getCollection() as $storageKey => $record) {
            $arr = $this->flexObjectToArray($record);
            if (strtolower((string) ($arr['channel'] ?? '')) !== 'sms') {
                continue;
            }
            if (strtolower((string) ($arr['status'] ?? '')) !== 'prepared') {
                continue;
            }
            $to = (string) ($arr['to'] ?? '');
            if ($to === '') {
                continue;
            }
            $items[] = [
                'id'      => (string) $storageKey,
                'to'      => $to,
                'message' => (string) ($arr['message'] ?? ''),
            ];
        }

        $this->core->jsonExit(['items' => $items]);
    }

    /**
     * Update a queued SMS status after a send attempt.
     * Body: {"status": "sent"} or {"status": "error", "error": "reason"}
     * Called by the Termux cron script after termux-sms-send succeeds or fails.
     */
    public function ackSmsQueueItem(string $id): void
    {
        $dir = $this->requireCommunicationsDirectory();
        $obj = $dir->getObject($id);

        if (!$obj) {
            $this->core->jsonExit(['error' => 'SMS queue item not found'], 404);
        }

        $arr = $this->flexObjectToArray($obj);
        if (strtolower((string) ($arr['channel'] ?? '')) !== 'sms') {
            $this->core->jsonExit(['error' => 'Not an SMS record'], 400);
        }

        $body   = json_decode(file_get_contents('php://input'), true) ?? [];
        $status = strtolower(trim((string) ($body['status'] ?? 'sent')));

        if (!in_array($status, ['sent', 'error'], true)) {
            $this->core->jsonExit(['error' => "Invalid status '$status'. Use 'sent' or 'error'."], 400);
        }

        $obj->status = $status;
        if ($status === 'sent') {
            $obj->sent_at = date('c');
        } else {
            $obj->error_at      = date('c');
            $obj->error_message = (string) ($body['error'] ?? '');
        }
        $obj->save();

        $this->core->jsonExit(['ok' => true]);
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
}
