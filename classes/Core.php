<?php

namespace Grav\Plugin\Cabinet;

use Grav\Common\Grav;
use RocketTheme\Toolbox\Event\Event;

class Core
{
    private ?string $routeAppBase = null;
    private ?string $routeApiBase = null;

    /** Practitioner resolved from an API-key-only request (no Grav session). */
    private ?string $apiKeyPractitionerId = null;

    public function __construct()
    {
        $config = Grav::instance()['config'] ?? null;
        if ($config) {
            $this->routeAppBase = (string) $config->get('plugins.cabinet.route_app_base', '/cabinet');
            $this->routeApiBase = (string) $config->get('plugins.cabinet.route_api_base', '/api/cabinet');
        }
    }

    public function onTwigTemplatePaths(Event $event): void
    {
        $paths = $event['paths'];
        $paths[] = dirname(__DIR__) . '/templates';
        $event['paths'] = $paths;
    }

    public function isRelevantPath(string $path): bool
    {
        // Si les routes ne sont pas encore chargées, les recharger ici
        if ($this->routeAppBase === null) {
            $config = Grav::instance()['config'] ?? null;
            if ($config) {
                $this->routeAppBase = (string) $config->get('plugins.cabinet.route_app_base', '/cabinet');
                $this->routeApiBase = (string) $config->get('plugins.cabinet.route_api_base', '/api/cabinet');
            }
        }

        $appBase = $this->routeAppBase ?? '/cabinet';
        $apiBase = $this->routeApiBase ?? '/api/cabinet';

        return $path === $appBase
            || strpos($path, $appBase . '/') === 0
            || strpos($path, $apiBase . '/') === 0
            || strpos($path, '/api/contacts/') === 0;
    }

    public function requireGravLogin(): void
    {
        $user = $this->grav()['user'] ?? null;
        if ($user && $user->authenticated) {
            return;
        }

        $appBase = $this->routeAppBase ?? '/cabinet';
        header('Location: /login?redirect=' . urlencode($appBase));
        exit;
    }

    public function requireGravSession(): void
    {
        $user = $this->grav()['user'] ?? null;
        if ($user && $user->authenticated) {
            return;
        }

        $this->jsonExit(['error' => 'Unauthenticated'], 401);
    }

    public function requireSessionOrApiKey(): void
    {
        $user = $this->grav()['user'] ?? null;
        if ($user && $user->authenticated) {
            return;
        }

        $received  = $this->getReceivedApiKey();
        if ($this->checkUserApiKey($received)) {
            return;
        }

        $this->jsonExit(['error' => 'Unauthorized'], 401);
    }

    private function getReceivedApiKey(): string
    {
        $headers = function_exists('getallheaders') ? getallheaders() : [];
        return trim((string) ($headers['X-Api-Key'] ?? $headers['x-api-key'] ?? ($_SERVER['HTTP_X_API_KEY'] ?? '')));
    }

    private function checkUserApiKey(string $received): bool
    {
        if ($received === '') {
            return false;
        }

        $accountsPath = GRAV_ROOT . '/user/accounts';
        if (!is_dir($accountsPath)) {
            return false;
        }

        foreach (glob($accountsPath . '/*.yaml') ?: [] as $file) {
            $content = @file_get_contents($file);
            if ($content === false || strpos($content, $received) === false) {
                continue;
            }

            try {
                $data = \Grav\Common\Yaml::parse($content);
            } catch (\Throwable $e) {
                continue;
            }

            if (!is_array($data)) {
                continue;
            }

            $userApiKey = trim((string) ($data['cabinet']['api_key'] ?? ''));
            if ($userApiKey !== '' && $received === $userApiKey) {
                $this->apiKeyPractitionerId = basename($file, '.yaml');
                return true;
            }
        }

        return false;
    }

    public function corsHeaders(): void
    {
        $origin = (string) $this->grav()['config']->get('plugins.cabinet.allowed_origin', '*');

        header('Access-Control-Allow-Origin: ' . $origin);
        header('Access-Control-Allow-Headers: X-Api-Key, Content-Type');
        header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    }

    public function jsonExit(array $data, int $status = 200): void
    {
        $this->corsHeaders();
        header('Content-Type: application/json; charset=utf-8');
        http_response_code($status);
        echo json_encode($data, JSON_UNESCAPED_UNICODE);
        exit;
    }

    public function isDebugEnabled(): bool
    {
        return true;
    }

    public function debugLog(string $message, array $context = []): void
    {
        if (!$this->isDebugEnabled()) {
            return;
        }

        $payload = empty($context) ? '' : ' ' . json_encode($context, JSON_UNESCAPED_UNICODE);
        $line = '[cabinet] ' . $message . $payload;

        if (isset($this->grav()['log'])) {
            $this->grav()['log']->warning($line);
        }

        error_log($line);

        $logFile = GRAV_ROOT . '/logs/cabinet.log';
        $timestamp = date('Y-m-d H:i:s');
        @file_put_contents($logFile, '[' . $timestamp . '] ' . $line . PHP_EOL, FILE_APPEND);
    }

    private function grav(): Grav
    {
        return Grav::instance();
    }

    public function getRouteAppBase(): string
    {
        if ($this->routeAppBase === null) {
            $config = Grav::instance()['config'] ?? null;
            if ($config) {
                $this->routeAppBase = (string) $config->get('plugins.cabinet.route_app_base', '/cabinet');
            }
        }
        return $this->routeAppBase ?? '/cabinet';
    }

    public function getRouteApiBase(): string
    {
        if ($this->routeApiBase === null) {
            $config = Grav::instance()['config'] ?? null;
            if ($config) {
                $this->routeApiBase = (string) $config->get('plugins.cabinet.route_api_base', '/api/cabinet');
            }
        }
        return $this->routeApiBase ?? '/api/cabinet';
    }

    /**
     * Returns the username of the current practitioner.
     * - Grav session: the authenticated user's username.
     * - API-key request: the username whose cabinet.api_key matched (set by requireSessionOrApiKey).
     * - Unauthenticated: empty string (no filtering applied).
     */
    public function getCurrentPractitionerId(): string
    {
        $user = Grav::instance()['user'] ?? null;
        if ($user && $user->authenticated) {
            return (string) ($user->username ?? '');
        }
        return $this->apiKeyPractitionerId ?? '';
    }

    /**
     * Read a config value, preferring the current user's account cabinet: section
     * over the global plugins.cabinet.* config.
     *
     * @param mixed $default
     * @return mixed
     */
    public function getPractitionerConfig(string $key, $default = '')
    {
        $user = Grav::instance()['user'] ?? null;
        if ($user && $user->authenticated) {
            $userCabinet = $user->get('cabinet');
            if (is_array($userCabinet) && array_key_exists($key, $userCabinet) && $userCabinet[$key] !== null && $userCabinet[$key] !== '') {
                return $userCabinet[$key];
            }
        }
        return Grav::instance()['config']->get('plugins.cabinet.' . $key, $default);
    }
}
