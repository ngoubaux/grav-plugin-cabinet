<?php

namespace Grav\Plugin\Cabinet;

use Grav\Common\Grav;

class Clients
{
    /** @var \Grav\Plugin\Cabinet\Core */
    private $core;

    public function __construct(\Grav\Plugin\Cabinet\Core $core)
    {
        $this->core = $core;
    }

    public function searchContact(): void
    {
        $email = trim((string) ($_GET['email'] ?? ''));
        $firstName = trim((string) ($_GET['first_name'] ?? ''));
        $lastName = trim((string) ($_GET['last_name'] ?? ''));

        if (empty($email) && (empty($firstName) || empty($lastName))) {
            $this->core->jsonExit(['error' => 'email or first_name+last_name required'], 400);
        }

        $grav = Grav::instance();
        $flex = $grav['flex'] ?? null;
        if (!$flex) {
            $this->core->jsonExit(['error' => 'Flex not available'], 500);
        }

        $dir = $flex->getDirectory('clients');
        if (!$dir) {
            $this->core->jsonExit(['error' => 'Clients directory not found'], 500);
        }

        foreach ($dir->getCollection() as $uuid => $obj) {
            $data = $this->flexObjectToArray($obj);

            if (!empty($email) && !empty($data['email'])) {
                if (strtolower((string) $data['email']) === strtolower($email)) {
                    $this->core->jsonExit($this->formatContact((string) $uuid, $data));
                }
            }

            if (!empty($firstName) && !empty($lastName)) {
                if (
                    strtolower((string) ($data['first_name'] ?? '')) === strtolower($firstName)
                    && strtolower((string) ($data['last_name'] ?? '')) === strtolower($lastName)
                ) {
                    $this->core->jsonExit($this->formatContact((string) $uuid, $data));
                }
            }
        }

        $this->core->jsonExit(['found' => false, 'uuid' => null]);
    }

    private function formatContact(string $uuid, array $data): array
    {
        return [
            'found' => true,
            'uuid' => $uuid,
            'first_name' => $data['first_name'] ?? '',
            'last_name' => $data['last_name'] ?? '',
            'email' => $data['email'] ?? '',
            'phone' => $data['phone1'] ?? '',
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
}
