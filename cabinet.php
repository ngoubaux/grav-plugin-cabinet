<?php
namespace Grav\Plugin;

use Grav\Common\Grav;
use Grav\Common\Plugin;
use Grav\Events\FlexRegisterEvent;
use RocketTheme\Toolbox\Event\Event;
use Grav\Plugin\Cabinet\Api;
use Grav\Plugin\Cabinet\Clients;
use Grav\Plugin\Cabinet\Core;
use Grav\Plugin\Cabinet\Facturation;
use Grav\Plugin\Cabinet\Seances;

require_once __DIR__ . '/classes/Core.php';
require_once __DIR__ . '/classes/Api.php';
require_once __DIR__ . '/classes/Clients.php';
require_once __DIR__ . '/classes/Seances.php';
require_once __DIR__ . '/classes/Facturation.php';
require_once __DIR__ . '/classes/Flex/RendezVousObject.php';

class CabinetPlugin extends Plugin
{
    /** @var Core|null */
    private $core;

    /** @var Api|null */
    private $api;

    /** @var Clients|null */
    private $clients;

    /** @var Seances|null */
    private $seances;

    /** @var Facturation|null */
    private $facturation;

    public static function getSubscribedEvents(): array
    {
        return [
            'onTwigTemplateAdminPaths' => ['onTwigTemplatePaths', 0],
            'onPluginsInitialized'  => ['onPluginsInitialized', 0],
            'onTwigTemplatePaths'   => ['onTwigTemplatePaths', 0],
            FlexRegisterEvent::class => ['onRegisterFlex', 0],
        ];
    }

    public function onRegisterFlex(FlexRegisterEvent $event): void
    {
        $flex = $event->flex;

        $types = [
            'clients' => __DIR__ . '/blueprints/flex-objects/clients.yaml',
            'rendez_vous' => __DIR__ . '/blueprints/flex-objects/rendez_vous.yaml',
        ];

        foreach ($types as $type => $blueprint) {
            if (!file_exists($blueprint)) {
                continue;
            }

            $directory = $flex->getDirectory($type);
            if (!$directory || !$directory->isEnabled()) {
                $flex->addDirectoryType($type, $blueprint);
            }
        }
    }

    public function onTwigTemplatePaths(Event $event): void
    {
        if ($this->core === null) {
            $this->core = new Core();
        }
        $this->grav['twig']->twig_paths[] = 'plugins://cabinet/templates';
        $this->core->onTwigTemplatePaths($event);
    }

    public function onAdminMenu(): void
    {
        // Backward-compatible no-op for stale cached event listeners.
    }

    public function onPageInitializedAdmin(): void
    {
        // Backward-compatible no-op for stale cached event listeners.
    }

    public function onPluginsInitialized(): void
    {
        $this->bootModules();

        if ($this->isAdmin()) {
            return;
        }

        $path = $this->grav['uri']->path();
        if ($this->core->isRelevantPath($path)) {
            $this->enable([
                'onPagesInitialized' => ['handleRequest', 0],
            ]);
        }
    }

    public function handleRequest(): void
    {
        $this->bootModules();
        $this->api->handleRequest();
    }

    public static function getClients(): array
    {
        $grav = Grav::instance();
        $flex = $grav['flex'] ?? null;
        if (!$flex) {
            return [];
        }

        $directory = $flex->getDirectory('clients');
        if (!$directory) {
            return [];
        }

        $options = [];
        foreach ($directory->getCollection() as $uuid => $client) {
            if (is_object($client) && method_exists($client, 'toArray')) {
                $data = $client->toArray();
            } elseif (is_object($client) && method_exists($client, 'jsonSerialize')) {
                $data = $client->jsonSerialize();
            } elseif (is_array($client)) {
                $data = $client;
            } else {
                $data = [];
            }
            $label = trim((string) (($data['first_name'] ?? '') . ' ' . ($data['last_name'] ?? '')));
            if ($label === '') {
                $label = (string) ($data['email'] ?? $uuid);
            }
            $options[(string) $uuid] = $label;
        }

        return $options;
    }

    private function bootModules(): void
    {
        if ($this->core !== null) {
            return;
        }

        $this->core = new Core();
        $this->clients = new Clients($this->core);
        $this->facturation = new Facturation($this->core);
        $this->seances = new Seances($this->core, $this->facturation);

        $this->api = new Api(
            $this->core,
            $this->clients,
            $this->seances,
            $this->facturation
        );
    }
}
