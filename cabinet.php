<?php
namespace Grav\Plugin;

use Grav\Common\Grav;
use Grav\Common\Plugin;
use Grav\Events\FlexRegisterEvent;
use RocketTheme\Toolbox\Event\Event;
use Grav\Plugin\Cabinet\Api;
use Grav\Plugin\Cabinet\Communication;
use Grav\Plugin\Cabinet\Clients;
use Grav\Plugin\Cabinet\Core;
use Grav\Plugin\Cabinet\Facturation;
use Grav\Plugin\Cabinet\Seances;
use Grav\Plugin\Cabinet\Import;
use Grav\Plugin\Cabinet\Sms;

require_once __DIR__ . '/classes/Core.php';
require_once __DIR__ . '/classes/Api.php';
require_once __DIR__ . '/classes/Communication.php';
require_once __DIR__ . '/classes/Clients.php';
require_once __DIR__ . '/classes/Seances.php';
require_once __DIR__ . '/classes/Facturation.php';
require_once __DIR__ . '/classes/Import.php';
require_once __DIR__ . '/classes/Sms.php';
require_once __DIR__ . '/classes/Metrics.php';
require_once __DIR__ . '/classes/Flex/RendezVousObject.php';
require_once __DIR__ . '/classes/Flex/ClientObject.php';

class CabinetPlugin extends Plugin
{
    /** @var string */
    private $admin_route = 'cabinet';

    /** @var Core|null */
    private $core;

    /** @var Api|null */
    private $api;

    /** @var Clients|null */
    private $clients;

    /** @var Communication|null */
    private $communication;

    /** @var Seances|null */
    private $seances;

    /** @var Facturation|null */
    private $facturation;

    /** @var Import|null */
    private $import;

    /** @var Sms|null */
    private $sms;

    public static function getSubscribedEvents(): array
    {
        return [
            'onTwigTemplateAdminPaths'  => ['onTwigTemplatePaths', 0],
            'onAdminTwigTemplatePaths'  => ['onAdminTwigTemplatePaths', 0],
            'onPluginsInitialized'      => ['onPluginsInitialized', 0],
            'onTwigTemplatePaths'       => ['onTwigTemplatePaths', 0],
            'onGetPageBlueprints'       => ['onGetPageBlueprints', 0],
            'onGetPageTemplates'        => ['onGetPageTemplates', 0],
            'onSchedulerInitialized'    => ['onSchedulerInitialized', 0],
            'onAdminMenu'               => ['onAdminMenu', 0],
            FlexRegisterEvent::class    => ['onRegisterFlex', 0],
        ];
    }

    public function onGetPageBlueprints(Event $event): void
    {
        /** @var \Grav\Common\Page\Types $types */
        $types = $event->types;
        $types->scanBlueprints('plugins://cabinet/blueprints');
    }

    public function onGetPageTemplates(Event $event): void
    {
        /** @var \Grav\Common\Page\Types $types */
        $types = $event->types;
        $types->scanTemplates('plugins://cabinet/templates');
    }

    public function onRegisterFlex(FlexRegisterEvent $event): void
    {
        $flex = $event->flex;

        $types = [
            'clients' => __DIR__ . '/blueprints/flex-objects/clients.yaml',
            'rendez_vous' => __DIR__ . '/blueprints/flex-objects/rendez_vous.yaml',
            'communications' => __DIR__ . '/blueprints/flex-objects/communications.yaml',
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

    public function onAdminTwigTemplatePaths(Event $event): void
    {
        $paths = $event['paths'];
        array_unshift($paths, __DIR__ . '/admin/templates');
        $event['paths'] = $paths;
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
        if (!$this->isAdmin()) {
            return;
        }

        $this->grav['twig']->plugins_hooked_nav['Cabinet'] = [
            'route'    => $this->admin_route,
            'location' => $this->admin_route,
            'icon'     => 'fa-briefcase',
        ];
    }

    public function onPageInitializedAdmin(): void
    {
        $this->grav['assets']->addCss('plugin://cabinet/assets/admin/cabinet-admin.css');

        if ($this->core === null) {
            $this->core = new Core();
        }
        $metrics = new \Grav\Plugin\Cabinet\Metrics($this->core);
        $this->grav['twig']->twig_vars['cabinet_metrics'] = $metrics->compute();
    }

    public function onPluginsInitialized(): void
    {
        $this->bootModules();

        if ($this->isAdmin()) {
            $admin = $this->grav['admin'] ?? null;
            if ($admin && ($admin->location === $this->admin_route || $admin->route === $this->admin_route)) {
                $this->enable([
                    'onPageInitialized' => ['onPageInitializedAdmin', 0],
                ]);
            }
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

    public function onSchedulerInitialized(Event $event): void
    {
        $enabled = $this->config->get('plugins.cabinet.sms_enabled', false);
        if (!$enabled) {
            return;
        }
        $cron = (string) $this->config->get('plugins.cabinet.sms_rappel_cron', '0 8 * * *');
        $scheduler = $event['scheduler'];
        $job = $scheduler->addFunction('Grav\Plugin\CabinetPlugin::runSmsRappels', [], 'cabinet-sms-rappels');
        $job->at($cron);
        $job->output('/logs/cabinet-sms-rappels');
        $job->backlink('/plugins/cabinet');
    }

    public static function runSmsRappels(): void
    {
        require_once __DIR__ . '/classes/Core.php';
        require_once __DIR__ . '/classes/Communication.php';
        require_once __DIR__ . '/classes/Sms.php';
        $core = new \Grav\Plugin\Cabinet\Core();
        // Boot Communication so its Flex directory auto-register is available
        // to queueViaMacroDroid() when sms_provider=macrodroid.
        new \Grav\Plugin\Cabinet\Communication($core);
        $sms  = new \Grav\Plugin\Cabinet\Sms($core);
        $results = $sms->sendRappelsJ1();
        $core->debugLog('SMS rappels J-1', $results);
    }

    private function bootModules(): void
    {
        if ($this->core !== null) {
            return;
        }

        $this->core = new Core();
        $this->clients = new Clients($this->core);
        $this->communication = new Communication($this->core);
        $this->facturation = new Facturation($this->core);
        $this->seances = new Seances($this->core, $this->facturation, $this->communication);
        $this->import  = new Import($this->core);
        $this->sms     = new Sms($this->core);

        $this->api = new Api(
            $this->core,
            $this->clients,
            $this->communication,
            $this->seances,
            $this->facturation,
            $this->import,
            $this->sms
        );
    }
}
