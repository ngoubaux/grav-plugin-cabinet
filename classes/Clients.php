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
        $phone = trim((string) ($_GET['phone'] ?? ''));

        if (empty($email) && empty($phone) && (empty($firstName) || empty($lastName))) {
            $this->core->jsonExit(['error' => 'email, phone, or first_name+last_name required'], 400);
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

        $practitionerId = $this->core->getCurrentPractitionerId();
        $legacyId       = $this->core->getLegacyPractitionerId();

        foreach ($dir->getCollection() as $uuid => $obj) {
            $data = $this->flexObjectToArray($obj);

            if ($practitionerId !== '') {
                $pid = (string) ($data['practitioner_id'] ?? '');
                if ($pid === '') {
                    $pid = $legacyId;
                }
                if ($pid !== $practitionerId) {
                    continue;
                }
            }

            if (!empty($email) && !empty($data['email'])) {
                if (strtolower((string) $data['email']) === strtolower($email)) {
                    $this->core->jsonExit($this->formatContact((string) $uuid, $data));
                }
            }

            if (!empty($phone)) {
                $stored = preg_replace('/\s+/', '', (string) ($data['phone1'] ?? ''));
                $needle = preg_replace('/\s+/', '', $phone);
                if ($stored !== '' && $stored === $needle) {
                    $this->core->jsonExit($this->formatContact((string) $uuid, $data));
                }
            }

            if (!empty($firstName) && !empty($lastName)) {
                if (
                    $this->normalizeForSearch((string) ($data['first_name'] ?? '')) === $this->normalizeForSearch($firstName)
                    && $this->normalizeForSearch((string) ($data['last_name'] ?? '')) === $this->normalizeForSearch($lastName)
                ) {
                    $this->core->jsonExit($this->formatContact((string) $uuid, $data));
                }
            }
        }

        $this->core->jsonExit(['found' => false, 'uuid' => null]);
    }

    private function normalizeForSearch(string $value): string
    {
        // Decompose accented characters then strip combining marks (NFD → ASCII-range)
        if (class_exists('Normalizer')) {
            $value = \Normalizer::normalize($value, \Normalizer::FORM_D);
        }
        $value = preg_replace('/[\x{0300}-\x{036f}]/u', '', $value);
        return strtolower($value);
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
