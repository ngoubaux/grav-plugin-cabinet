<?php

namespace Grav\Plugin\Cabinet;

use Grav\Common\Grav;

class Api
{
    /** @var \Grav\Plugin\Cabinet\Core */
    private $core;

    /** @var \Grav\Plugin\Cabinet\Clients */
    private $clients;

    /** @var \Grav\Plugin\Cabinet\Communication */
    private $communication;

    /** @var \Grav\Plugin\Cabinet\Seances */
    private $seances;

    /** @var \Grav\Plugin\Cabinet\Facturation */
    private $facturation;

    /** @var \Grav\Plugin\Cabinet\Import */
    private $import;

    /** @var \Grav\Plugin\Cabinet\Sms */
    private $sms;

    /** @var \Grav\Plugin\Cabinet\Profile */
    private $profile;

    public function __construct(
        \Grav\Plugin\Cabinet\Core $core,
        \Grav\Plugin\Cabinet\Clients $clients,
        \Grav\Plugin\Cabinet\Communication $communication,
        \Grav\Plugin\Cabinet\Seances $seances,
        \Grav\Plugin\Cabinet\Facturation $facturation,
        \Grav\Plugin\Cabinet\Import $import,
        \Grav\Plugin\Cabinet\Sms $sms,
        \Grav\Plugin\Cabinet\Profile $profile
    ) {
        $this->core = $core;
        $this->clients = $clients;
        $this->communication = $communication;
        $this->seances = $seances;
        $this->facturation = $facturation;
        $this->import = $import;
        $this->sms = $sms;
        $this->profile = $profile;
    }

    public function handleRequest(): void
    {
        $path = rtrim(Grav::instance()['uri']->path(), '/');
        $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
        $appBase = $this->core->getRouteAppBase();
        $apiBase = $this->core->getRouteApiBase();

        if ($method === 'OPTIONS') {
            $this->core->corsHeaders();
            http_response_code(204);
            exit;
        }

        // Page app elle-même — laisser Grav la router
        if ($path === $appBase) {
            return;
        }

        // Assets statiques
        if ($path === $appBase . '/cabinet.css') {
            $this->serveAsset('cabinet.css', 'text/css');
        }

        if (preg_match('#^' . preg_quote($appBase, '#') . '/([\w\-]+(?:/[\w\-]+)*\.js)$#', $path, $m)) {
            $this->serveAsset($m[1], 'application/javascript');
        }

        if ($path === $appBase . '/manifest.json') {
            $this->serveAsset('manifest.json', 'application/manifest+json');
        }

        if ($path === $appBase . '/client-template.pdf') {
            $this->core->requireGravSession();
            $this->serveTemplate('template_client_pdf', 'FicheTemplate_client.pdf');
        }

        if ($path === $appBase . '/seance-template.pdf') {
            $this->core->requireGravSession();
            $this->serveTemplate('template_seance_pdf', 'FicheTemplate_rendezvous.pdf', 'template_client_pdf');
        }

        // Backward compatibility
        if ($path === $appBase . '/bilan-template.pdf') {
            $this->core->requireGravSession();
            $this->serveTemplate('template_client_pdf', 'FicheTemplate_client.pdf');
        }

        if ($path === $apiBase . '/data') {
            $this->core->requireGravSession();
            if ($method === 'GET') {
                $this->seances->getData();
            }
        }

        // ── Clients CRUD ─────────────────────────────────────────────────────
        if ($path === $apiBase . '/clients' && $method === 'POST') {
            $this->core->requireSessionOrApiKey();
            $this->seances->createClientRecord();
        }

        if (preg_match('#^' . preg_quote($apiBase, '#') . '/clients/([a-zA-Z0-9_%-]+)$#', $path, $m)) {
            $this->core->requireSessionOrApiKey();
            $id = rawurldecode($m[1]);
            if ($method === 'PUT') $this->seances->updateClientRecord($id);
            if ($method === 'DELETE') $this->seances->deleteClientRecord($id);
        }

        // ── Rendez-vous CRUD ─────────────────────────────────────────────────
        if ($path === $apiBase . '/rendezvous' && $method === 'POST') {
            $this->core->requireSessionOrApiKey();
            $this->seances->createRendezvousRecord();
        }

        if (preg_match('#^' . preg_quote($apiBase, '#') . '/rendezvous/([a-zA-Z0-9_%-]+)$#', $path, $m)) {
            $this->core->requireSessionOrApiKey();
            $id = rawurldecode($m[1]);
            if ($method === 'PUT') $this->seances->updateRendezvousRecord($id);
            if ($method === 'DELETE') $this->seances->deleteRendezvousRecord($id);
        }

        // ── Communications (history) ───────────────────────────────────────
        if (preg_match('#^' . preg_quote($apiBase, '#') . '/communications/([a-zA-Z0-9_%-]+)$#', $path, $m)) {
            $this->core->requireSessionOrApiKey();
            $id = rawurldecode($m[1]);
            if ($method === 'PUT') $this->communication->updateClientCommunicationsRecord($id);
        }

        if ($path === $apiBase . '/rendezvous' && $method === 'GET') {
            $this->core->requireSessionOrApiKey();
            $this->core->jsonExit($this->seances->buildRendezVousPayload());
        }

        if ($path === $apiBase . '/facturation' && $method === 'GET') {
            $this->core->requireGravSession();
            $this->core->jsonExit($this->seances->buildFacturationPayload());
        }

        // ── Import ────────────────────────────────────────────────────────────
        if ($path === $apiBase . '/import/clients' && $method === 'POST') {
            $this->core->requireGravSession();
            $this->import->handleImportClients();
        }

        if ($path === $apiBase . '/import/rendezvous' && $method === 'POST') {
            $this->core->requireGravSession();
            $this->import->handleImportRendezvous();
        }

        if ($path === '/api/contacts/search' && $method === 'GET') {
            $this->core->requireSessionOrApiKey();
            $this->clients->searchContact();
        }

        // ── SMS ──────────────────────────────────────────────────────────────────
        if ($path === $apiBase . '/sms/preparation' && $method === 'POST') {
            $this->core->requireGravSession();
            $this->sms->handleSendPreparation();
        }

        if ($path === $apiBase . '/sms/send-preparation' && $method === 'POST') {
            $this->core->requireGravSession();
            $this->sms->handleSendPreparationDirect();
        }

        if ($path === $apiBase . '/sms/rappels' && $method === 'POST') {
            $this->core->requireSessionOrApiKey();
            $this->sms->handleSendRappels();
        }

        // ── SMS queue (Termux cron) ───────────────────────────────────────────
        if ($path === $apiBase . '/sms/queue' && $method === 'GET') {
            $this->core->requireSessionOrApiKey();
            $this->communication->getSmsQueue();
        }

        if (preg_match('#^' . preg_quote($apiBase, '#') . '/sms/queue/([a-zA-Z0-9_%-]+)/ack$#', $path, $m) && $method === 'POST') {
            $this->core->requireSessionOrApiKey();
            $this->communication->ackSmsQueueItem(rawurldecode($m[1]));
        }

        // ── Scripts Termux pré-configurés ─────────────────────────────────────
        if ($path === $apiBase . '/termux/bootstrap' && $method === 'GET') {
            $this->core->requireSessionOrApiKey();
            $this->serveTermuxScript('termux-bootstrap.sh.twig', 'termux-bootstrap.sh');
        }

        if ($path === $apiBase . '/termux/sms-queue' && $method === 'GET') {
            $this->core->requireSessionOrApiKey();
            $this->serveTermuxScript('termux-sms-queue.py.twig', 'termux-sms-queue.py');
        }

        if ($path === $apiBase . '/changelog' && $method === 'GET') {
            $this->core->requireGravSession();
            $this->serveChangelog();
        }

        // ── Profile / paramètres praticien ────────────────────────────────────
        if ($path === $apiBase . '/profile' && $method === 'GET') {
            $this->core->requireGravSession();
            $this->profile->getProfile();
        }

        if ($path === $apiBase . '/profile' && $method === 'PUT') {
            $this->core->requireGravSession();
            $this->profile->saveProfile();
        }

        if ($path === $apiBase . '/profile/api-key' && $method === 'POST') {
            $this->core->requireGravSession();
            $this->profile->regenerateApiKey();
        }

        if ($path === $apiBase . '/profile/template-upload' && $method === 'POST') {
            $this->core->requireGravSession();
            $this->profile->uploadTemplate();
        }

        if ($path === $apiBase . '/admin/migrate-practitioner-id' && $method === 'POST') {
            $this->core->requireGravSession();
            $this->seances->migratePractitionerIdToCurrentUser();
        }

        $this->core->jsonExit(['error' => 'Route not found'], 404);
    }

    private function serveTermuxScript(string $template, string $filename): void
    {
        $grav      = Grav::instance();
        $baseUrl   = rtrim((string) ($grav['base_url_absolute'] ?? ''), '/');
        $pushToken = trim((string) $grav['config']->get('plugins.cabinet.sms_push_token', ''));
        $apiKey    = $pushToken !== '' ? $pushToken : (string) $grav['config']->get('plugins.cabinet.api_key', '');
        $simSlot   = (string) ($grav['uri']->query('sim') ?? '');

        $vars = [
            'cabinet_url'  => $baseUrl,
            'api_key'      => $apiKey,
            'sim_slot'     => $simSlot,
            'generated_at' => date('d/m/Y H:i'),
        ];

        $templateFile = dirname(__DIR__) . '/templates/' . $template;
        if (!file_exists($templateFile)) {
            http_response_code(404);
            echo '# Template introuvable : ' . $template;
            exit;
        }

        try {
            $script = $grav['twig']->twig->render($template, $vars);
        } catch (\Throwable $e) {
            // Fallback : substitution simple si Twig n'est pas encore initialisé
            $script = file_get_contents($templateFile);
            foreach ($vars as $key => $value) {
                $script = str_replace('{{ ' . $key . ' }}', $value, $script);
            }
        }

        header('Content-Type: text/x-shellscript; charset=utf-8');
        header('Content-Disposition: attachment; filename="' . $filename . '"');
        echo $script;
        exit;
    }

    private function serveChangelog(): void
    {
        $file = dirname(__DIR__) . '/CHANGELOG.md';
        if (!file_exists($file)) {
            http_response_code(404);
            echo '<p>CHANGELOG introuvable.</p>';
            exit;
        }

        $raw = file_get_contents($file);

        // Parse versions: split on lines starting with "# "
        $entries = [];
        $blocks  = preg_split('/^(?=# )/m', $raw);
        foreach ($blocks as $block) {
            $block = trim($block);
            if (!preg_match('/^# (.+)/', $block, $vm)) {
                continue;
            }
            $version = trim($vm[1]);
            $date    = '';
            if (preg_match('/^## (.+)/m', $block, $dm)) {
                $date = trim($dm[1]);
            }
            // Strip version and date headers, keep the rest as Markdown
            $content = preg_replace('/^# .+\n?/m', '', $block);
            $content = preg_replace('/^## .+\n?/m', '', $content);
            // Remove markdownlint comments
            $content = preg_replace('/<!--.*?-->/s', '', $content);
            $entries[$version] = ['date' => $date, 'content' => trim($content)];
        }

        // Render Markdown with Grav's Parsedown
        $parsedown = new \Parsedown();
        $parsedown->setSafeMode(false);

        // Mirror the structure of changelog.html.twig
        $out  = '<section id="ajax" class="changelog">';
        $out .= '<a href="#" class="remodal-close"></a>';
        $out .= '<h1>Cabinet Changelog</h1>';
        $out .= '<div class="changelog-overflow">';
        foreach ($entries as $version => $log) {
            $id   = str_replace([' ', '.'], '-', $version);
            $out .= '<h3 id="' . htmlspecialchars($id) . '">v' . htmlspecialchars($version) . '</h3>';
            if ($log['date']) {
                $out .= '<h4>' . htmlspecialchars($log['date']) . '</h4>';
            }
            $out .= $parsedown->text($log['content']);
        }
        $out .= '</div></section>';

        header('Content-Type: text/html; charset=utf-8');
        echo $out;
        exit;
    }

    private function serveTemplate(string $configKey, string $downloadName, string $fallbackConfigKey = null): void
    {
        $grav    = Grav::instance();
        $default = dirname(__DIR__) . '/assets/Fiche Client - Shiatsu.pdf';
        $file    = null;

        foreach (array_filter([$configKey, $fallbackConfigKey]) as $key) {
            $data = $this->core->getPractitionerConfig($key, []);
            $resolved = $this->resolveTemplatePath($data);
            if ($resolved !== null) {
                $file = $resolved;
                break;
            }
        }

        if (!$file) {
            $file = $default;
        }

        if (!file_exists($file)) {
            http_response_code(404);
            echo 'Template not found';
            exit;
        }

        header('Content-Type: application/pdf');
        header('Content-Disposition: inline; filename="' . $downloadName . '"');
        header('Content-Length: ' . filesize($file));
        readfile($file);
        exit;
    }

    private function resolveTemplatePath($value): ?string
    {
        // Legacy Grav file field format: array where key is the stored path.
        if (is_array($value) && !empty($value)) {
            $candidate = '';
            $firstKey = array_key_first($value);
            if (is_string($firstKey) && $firstKey !== '') {
                $candidate = $firstKey;
            } elseif (isset($value['path']) && is_string($value['path'])) {
                $candidate = (string) $value['path'];
            } elseif (isset($value[0]) && is_string($value[0])) {
                $candidate = (string) $value[0];
            }

            if ($candidate !== '') {
                return $this->resolveTemplatePathCandidate($candidate);
            }

            return null;
        }

        // Practitioner profile format: direct string path.
        if (is_string($value) && trim($value) !== '') {
            return $this->resolveTemplatePathCandidate(trim($value));
        }

        return null;
    }

    private function resolveTemplatePathCandidate(string $candidate): ?string
    {
        $locator = Grav::instance()['locator'];

        if (strpos($candidate, '://') !== false) {
            $resolved = $locator->findResource($candidate, true);
            if (is_string($resolved) && file_exists($resolved)) {
                return $resolved;
            }
        }

        if (file_exists($candidate)) {
            return $candidate;
        }

        $resolved = $locator->findResource($candidate, true)
            ?: (GRAV_ROOT . DS . ltrim(str_replace('/', DS, $candidate), DS));

        if (is_string($resolved) && file_exists($resolved)) {
            return $resolved;
        }

        return null;
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
