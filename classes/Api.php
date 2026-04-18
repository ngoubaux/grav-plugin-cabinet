<?php

namespace Grav\Plugin\Cabinet;

use Grav\Common\Grav;

class Api
{
    /** @var \Grav\Plugin\Cabinet\Core */
    private $core;

    /** @var \Grav\Plugin\Cabinet\Clients */
    private $clients;

    /** @var \Grav\Plugin\Cabinet\Seances */
    private $seances;

    /** @var \Grav\Plugin\Cabinet\Facturation */
    private $facturation;

    /** @var \Grav\Plugin\Cabinet\Sms */
    private $sms;

    public function __construct(
        \Grav\Plugin\Cabinet\Core $core,
        \Grav\Plugin\Cabinet\Clients $clients,
        \Grav\Plugin\Cabinet\Seances $seances,
        \Grav\Plugin\Cabinet\Facturation $facturation,
        \Grav\Plugin\Cabinet\Sms $sms
    ) {
        $this->core = $core;
        $this->clients = $clients;
        $this->seances = $seances;
        $this->facturation = $facturation;
        $this->sms = $sms;
    }

    public function handleRequest(): void
    {
        $path = rtrim(Grav::instance()['uri']->path(), '/');
        $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

        if ($method === 'OPTIONS') {
            $this->core->corsHeaders();
            http_response_code(204);
            exit;
        }

        if ($path === '/cabinet') {
            // Let Grav page routing and frontmatter access rules handle auth.
            return;
        }

        if ($path === '/cabinet/cabinet.css') {
            $this->serveAsset('cabinet.css', 'text/css');
        }

        if (preg_match('#^/cabinet/([\w\-]+\.js)$#', $path, $m)) {
            $this->serveAsset($m[1], 'application/javascript');
        }

        if ($path === '/cabinet/manifest.json') {
            $this->serveAsset('manifest.json', 'application/manifest+json');
        }


        if ($path === '/cabinet/bilan-template.pdf') {
            $this->core->requireGravSession();
            $file = dirname(__DIR__) . '/assets/Fiche Client - Shiatsu.pdf';
            if (!file_exists($file)) {
                http_response_code(404);
                echo 'Not found';
                exit;
            }
            header('Content-Type: application/pdf');
            header('Content-Disposition: inline; filename="Fiche-Client-Shiatsu.pdf"');
            header('Content-Length: ' . filesize($file));
            readfile($file);
            exit;
        }

        if ($path === '/api/cabinet/data') {
            $this->core->requireGravSession();
            if ($method === 'GET') {
                $this->seances->getData();
            }
            // POST no longer handled — use /api/cabinet/clients and /api/cabinet/rendezvous
        }

        // ── Clients CRUD ─────────────────────────────────────────────────────
        if ($path === '/api/cabinet/clients' && $method === 'POST') {
            $this->core->requireSessionOrApiKey();
            $this->seances->createClientRecord();
        }

        if (preg_match('#^/api/cabinet/clients/([a-zA-Z0-9_%-]+)$#', $path, $m)) {
            $this->core->requireSessionOrApiKey();
            $id = rawurldecode($m[1]);
            if ($method === 'PUT') $this->seances->updateClientRecord($id);
            if ($method === 'DELETE') $this->seances->deleteClientRecord($id);
        }

        // ── Rendez-vous CRUD ─────────────────────────────────────────────────
        if ($path === '/api/cabinet/rendezvous' && $method === 'POST') {
            $this->core->requireSessionOrApiKey();
            $this->seances->createRendezvousRecord();
        }

        if (preg_match('#^/api/cabinet/rendezvous/([a-zA-Z0-9_%-]+)$#', $path, $m)) {
            $this->core->requireSessionOrApiKey();
            $id = rawurldecode($m[1]);
            if ($method === 'PUT') $this->seances->updateRendezvousRecord($id);
            if ($method === 'DELETE') $this->seances->deleteRendezvousRecord($id);
        }

        if ($path === '/api/cabinet/rendezvous' && $method === 'GET') {
            $this->core->requireSessionOrApiKey();
            $this->core->jsonExit($this->seances->buildRendezVousPayload());
        }

        if ($path === '/api/cabinet/facturation' && $method === 'GET') {
            $this->core->requireGravSession();
            $this->core->jsonExit($this->seances->buildFacturationPayload());
        }

        if ($path === '/api/contacts/search' && $method === 'GET') {
            $this->core->requireSessionOrApiKey();
            $this->clients->searchContact();
        }

        // ── SMS ──────────────────────────────────────────────────────────────────
        if ($path === '/api/cabinet/sms/preparation' && $method === 'POST') {
            $this->core->requireGravSession();
            $this->sms->handleSendPreparation();
        }

        if ($path === '/api/cabinet/sms/rappels' && $method === 'POST') {
            $this->core->requireSessionOrApiKey();
            $this->sms->handleSendRappels();
        }

        $this->core->jsonExit(['error' => 'Route not found'], 404);
    }

    private function serveAsset(string $name, string $type): void
    {
        $file = dirname(__DIR__) . '/assets/' . $name;
        if (!file_exists($file)) {
            http_response_code(404);
            echo 'File not found';
            exit;
        }

        header('Content-Type: ' . $type . '; charset=utf-8');
        echo file_get_contents($file);
        exit;
    }
}
