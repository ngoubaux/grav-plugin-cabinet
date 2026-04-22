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
        'template_client_pdf',
        'template_seance_pdf',
        'sms_enabled',
        'sms_provider',
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
            if ($key === 'sms_enabled') {
                $profile[$key] = (bool) ($cabinet[$key] ?? false);
                continue;
            }
            if ($key === 'sms_provider') {
                $profile[$key] = (string) ($cabinet[$key] ?? 'smsmobileapi');
                continue;
            }
            $profile[$key] = (string) ($cabinet[$key] ?? '');
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

    public function uploadTemplate(): void
    {
        $templateKey = (string) ($_POST['template_key'] ?? '');
        if (!in_array($templateKey, ['template_client_pdf', 'template_seance_pdf'], true)) {
            $this->core->jsonExit(['ok' => false, 'error' => 'template_key invalide'], 400);
        }

        if (!isset($_FILES['file']) || !is_array($_FILES['file'])) {
            $this->core->jsonExit(['ok' => false, 'error' => 'Fichier manquant'], 400);
        }

        $upload = $_FILES['file'];
        $error  = (int) ($upload['error'] ?? UPLOAD_ERR_NO_FILE);
        if ($error !== UPLOAD_ERR_OK) {
            $this->core->jsonExit(['ok' => false, 'error' => 'Erreur upload (' . $error . ')'], 400);
        }

        $tmpPath = (string) ($upload['tmp_name'] ?? '');
        $name    = (string) ($upload['name'] ?? '');
        $size    = (int) ($upload['size'] ?? 0);
        if ($tmpPath === '' || !is_uploaded_file($tmpPath)) {
            $this->core->jsonExit(['ok' => false, 'error' => 'Upload invalide'], 400);
        }

        if ($size <= 0 || $size > 10 * 1024 * 1024) {
            $this->core->jsonExit(['ok' => false, 'error' => 'Le PDF doit faire moins de 10 Mo'], 400);
        }

        $ext = strtolower((string) pathinfo($name, PATHINFO_EXTENSION));
        if ($ext !== 'pdf') {
            $this->core->jsonExit(['ok' => false, 'error' => 'Seuls les fichiers PDF sont autorisés'], 400);
        }

        $mime = '';
        if (function_exists('finfo_open')) {
            $finfo = @finfo_open(FILEINFO_MIME_TYPE);
            if ($finfo) {
                $mime = (string) @finfo_file($finfo, $tmpPath);
                @finfo_close($finfo);
            }
        }
        if ($mime !== '' && !in_array($mime, ['application/pdf', 'application/x-pdf', 'application/octet-stream'], true)) {
            $this->core->jsonExit(['ok' => false, 'error' => 'Type MIME non autorisé: ' . $mime], 400);
        }

        $user = Grav::instance()['user'];
        $username = preg_replace('/[^a-zA-Z0-9_\-]/', '', (string) ($user->username ?? 'user')) ?: 'user';

        $targetDir = GRAV_ROOT . '/user/data/cabinet/templates';
        if (!is_dir($targetDir) && !@mkdir($targetDir, 0775, true) && !is_dir($targetDir)) {
            $this->core->jsonExit(['ok' => false, 'error' => 'Impossible de créer le dossier templates'], 500);
        }

        $baseName = $templateKey === 'template_client_pdf' ? 'FicheTemplate_client' : 'FicheTemplate_rendezvous';
        $filename = $baseName . '_' . $username . '.pdf';
        $targetAbs = $targetDir . '/' . $filename;
        $targetRel = 'user/data/cabinet/templates/' . $filename;

        if (!@move_uploaded_file($tmpPath, $targetAbs)) {
            $this->core->jsonExit(['ok' => false, 'error' => 'Échec de sauvegarde du fichier'], 500);
        }

        $cabinet = $user->get('cabinet') ?? [];
        if (!is_array($cabinet)) {
            $cabinet = [];
        }
        $cabinet[$templateKey] = $targetRel;

        $user->set('cabinet', $cabinet);
        $user->save();

        $this->core->jsonExit([
            'ok' => true,
            'template_key' => $templateKey,
            'path' => $targetRel,
            'filename' => $filename,
        ]);
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
