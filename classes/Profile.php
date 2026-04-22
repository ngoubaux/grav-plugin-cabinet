<?php

namespace Grav\Plugin\Cabinet;

use Grav\Common\Grav;

class Profile
{
    private const CABINET_FIELDS = [
        'practitioner_name',
        'practitioner_title',
        'practitioner_phone',
        'practitioner_website',
        'practitioner_booking_url',
        'practitioner_address_street',
        'practitioner_address_details',
        'practitioner_address_city',
        'practitioner_access_code',
        'practitioner_first_session_price',
        'google_oauth_client_id',
        'google_calendar_id',
        'drive_bilan_path',
        'sms_enabled',
        'communication_google_review_url',
        'communication_template_prep_visite',
        'communication_template_relance',
        'communication_template_compte_rendu',
        // Page de préparation complète (Markdown avec {{variables}})
        'prep_page_content',
        'prep_page_footer',
    ];

    /** @var \Grav\Plugin\Cabinet\Core */
    private $core;

    public function __construct(\Grav\Plugin\Cabinet\Core $core)
    {
        $this->core = $core;
    }

    public function getProfile(): void
    {
        $user    = Grav::instance()['user'];
        $cabinet = $user->get('cabinet') ?? [];
        if (!is_array($cabinet)) {
            $cabinet = [];
        }

        $profile = [
            'username' => (string) ($user->username ?? ''),
            'fullname' => (string) ($user->fullname ?? ''),
            'email'    => (string) ($user->email ?? ''),
        ];

        foreach (self::CABINET_FIELDS as $key) {
            $profile[$key] = $key === 'sms_enabled'
                ? (bool) ($cabinet[$key] ?? false)
                : (string) ($cabinet[$key] ?? '');
        }

        $rawKey            = (string) ($cabinet['api_key'] ?? '');
        $profile['api_key_masked'] = $this->maskApiKey($rawKey);
        $profile['has_api_key']    = $rawKey !== '';

        $this->core->jsonExit($profile);
    }

    public function saveProfile(): void
    {
        $data = $this->requireJsonBody();
        $user = Grav::instance()['user'];

        $cabinet = $user->get('cabinet') ?? [];
        if (!is_array($cabinet)) {
            $cabinet = [];
        }

        foreach (self::CABINET_FIELDS as $key) {
            if (!array_key_exists($key, $data)) {
                continue;
            }
            $cabinet[$key] = $key === 'sms_enabled'
                ? (bool) $data[$key]
                : (string) $data[$key];
        }

        $user->set('cabinet', $cabinet);
        $user->save();

        $this->core->jsonExit(['ok' => true]);
    }

    public function regenerateApiKey(): void
    {
        $user = Grav::instance()['user'];

        $cabinet = $user->get('cabinet') ?? [];
        if (!is_array($cabinet)) {
            $cabinet = [];
        }

        $newKey = bin2hex(random_bytes(32));
        $cabinet['api_key'] = $newKey;

        $user->set('cabinet', $cabinet);
        $user->save();

        $this->core->jsonExit(['ok' => true, 'api_key' => $newKey]);
    }

    private function maskApiKey(string $key): string
    {
        if ($key === '') {
            return '';
        }
        return substr($key, 0, 8) . str_repeat('•', max(0, strlen($key) - 8));
    }

    private function requireJsonBody(): array
    {
        $raw  = file_get_contents('php://input');
        $data = json_decode($raw, true);
        if (!is_array($data)) {
            $this->core->jsonExit(['error' => 'Invalid JSON body'], 400);
        }
        return $data;
    }
}
