<?php
namespace Grav\Plugin\Cabinet\Flex;

use Grav\Common\Flex\Types\Generic\GenericObject;
use Grav\Common\Grav;

class ClientObject extends GenericObject
{
    /**
     * Variables disponibles dans prep_page_content :
     * {{first_name}}, {{last_name}}, {{appointment_date}}, {{appointment_time}},
        * {{appointment_type}}, {{duration}}, {{price}},
     * {{pract_name}}, {{pract_phone}}, {{pract_website}}, {{booking_url}},
        * {{pract_title}}, {{address}}, {{address_street}}, {{address_details}},
        * {{address_city}}, {{access_code}}, {{appointment_intro}},
        * {{first_session_highlight}}, {{contact_phone_line}},
        * {{contact_website_line}}, {{contact_booking_line}}, {{pract_title_line}}
     */

    /**
     * Retourne le prochain rendez-vous futur non annulé pour ce client.
     */
    public function getNextAppointment(): ?GenericObject
    {
        $flex = Grav::instance()['flex'] ?? null;
        $dir  = $flex?->getDirectory('rendez_vous');
        if (!$dir) {
            return null;
        }

        $uuid  = (string) $this->getKey();
        $today = date('Y-m-d');
        $next  = null;

        foreach ($dir->getCollection()->filterBy(['contact_uuid' => $uuid]) as $rdv) {
            $date   = (string) ($rdv->appointment_date ?? '');
            $status = (string) ($rdv->status ?? '');

            if ($date < $today || $status === 'cancelled') {
                continue;
            }

            if ($next === null || $date < (string) $next->appointment_date) {
                $next = $rdv;
            } elseif ($date === (string) $next->appointment_date
                && (string) ($rdv->appointment_hour ?? '') < (string) ($next->appointment_hour ?? '')) {
                $next = $rdv;
            }
        }

        return $next;
    }

    /**
     * Retourne la configuration du praticien propriétaire de ce client.
     * Lit user/accounts/<practitioner_id>.yaml (section cabinet:),
     * en repli sur plugins.cabinet.* dans cabinet.yaml.
     *
     * @return array<string, mixed>
     */
    public function getPractitionerConfig(): array
    {
        $practitionerId = (string) ($this->practitioner_id ?? '');
        $cabinet        = [];

        if ($practitionerId !== '') {
            $file = GRAV_ROOT . '/user/accounts/' . preg_replace('/[^a-zA-Z0-9_\-]/', '', $practitionerId) . '.yaml';
            if (is_file($file)) {
                try {
                    $data    = \Grav\Common\Yaml::parse((string) file_get_contents($file));
                    $cabinet = is_array($data['cabinet'] ?? null) ? $data['cabinet'] : [];
                } catch (\Throwable $e) {
                    // fall through to global config
                }
            }
        }

        $global = Grav::instance()['config'];
        $keys   = [
            'practitioner_name', 'practitioner_title', 'practitioner_phone',
            'practitioner_website', 'practitioner_booking_url',
            'practitioner_address_street', 'practitioner_address_details',
            'practitioner_address_city', 'practitioner_access_code',
            'practitioner_first_session_price',
            'prep_page_content', 'prep_page_footer',
        ];

        $result = [];
        foreach ($keys as $key) {
            $val = isset($cabinet[$key]) && $cabinet[$key] !== '' && $cabinet[$key] !== null
                ? $cabinet[$key]
                : $global->get('plugins.cabinet.' . $key, '');
            $result[$key] = $val;
        }

        return $result;
    }

    /**
     * Retourne le contenu Markdown de la page de préparation après substitution
     * des variables {{variable}} par les valeurs réelles du client et du praticien.
     * Retourne une chaîne vide si aucun contenu personnalisé n'est défini.
     */
    public function getPrepPageContent(): string
    {
        $config  = $this->getPractitionerConfig();
        $content = (string) ($config['prep_page_content'] ?? '');

        if ($content === '') {
            return '';
        }

        $rdv = $this->getNextAppointment();
        $bookingUrl = (string) ($config['practitioner_booking_url'] ?? '');

        if ($rdv) {
            $appointmentIntro = 'Je suis ravi de vous accueillir pour votre prochaine séance de '
                . $this->translateAppointmentType((string) ($rdv->appointment_type ?? ''))
                . ' le **' . $this->formatDate((string) ($rdv->appointment_date ?? ''))
                . '** à **' . (string) ($rdv->appointment_hour ?? '') . '**.';
        } else {
            $appointmentIntro = "<strong>Note :</strong> Vous n'avez pas encore de prochain rendez-vous planifié.";
            if ($bookingUrl !== '') {
                $appointmentIntro .= "\n\n[Prendre un rendez-vous](" . $bookingUrl . ')';
            }
        }

        $hasExchangeTag = false;
        $tags = $this->tags ?? [];
        if (is_array($tags)) {
            $hasExchangeTag = in_array('Echange', $tags, true);
        }

        if ($hasExchangeTag) {
            $SessionHighlight = "<strong>Note :</strong> Vous avez choisi une séance d'échange. Nous pourrons discuter ensemble de vos besoins et attentes lors de notre rencontre.";
        } elseif ($rdv) {
            $SessionHighlight = 'Pour cette rencontre, je vous propose une séance de <strong>'
                . (string) ($rdv->duration_minutes ?? '')
                . ' min</strong> au tarif de <strong>'
                . (string) ($config['practitioner_first_session_price'] ?? '')
                . "€</strong>.";
        } else {
            $SessionHighlight = 'Nous définirons ensemble la formule la plus adaptée à votre accompagnement lors de votre première visite.';
        }

        $phone = (string) ($config['practitioner_phone'] ?? '');
        $website = (string) ($config['practitioner_website'] ?? '');

        $contactPhoneLine = $phone !== '' ? '<div class="contact-line">📞 <a href="tel:' . $phone . '">' . $phone . '</a></div>' : '';
        $contactWebsiteLine = $website !== '' ? '<div class="contact-line">🌐 <a href="' . $website . '">' . $website . '</a></div>' : '';
        $contactBookingLine = $bookingUrl !== '' ? '<div class="contact-line">📅 <a href="' . $bookingUrl . '">Prendre un rendez-vous</a></div>' : '';
        $practTitleLine = (string) ($config['practitioner_title'] ?? '');

        $vars = [
            'first_name'       => (string) ($this->first_name ?? ''),
            'last_name'        => (string) ($this->last_name ?? ''),
            'appointment_date' => $rdv ? $this->formatDate((string) ($rdv->appointment_date ?? '')) : '',
            'appointment_time' => $rdv ? (string) ($rdv->appointment_hour ?? '') : '',
            'appointment_type' => $rdv ? $this->translateAppointmentType((string) ($rdv->appointment_type ?? '')) : '',
            'duration'         => $rdv ? ((string) ($rdv->duration_minutes ?? '')) . ' min' : '',
            'price'            => (string) ($config['practitioner_first_session_price'] ?? ''),
            'pract_name'       => (string) ($config['practitioner_name'] ?? ''),
            'pract_title'      => (string) ($config['practitioner_title'] ?? ''),
            'pract_phone'      => (string) ($config['practitioner_phone'] ?? ''),
            'pract_website'    => (string) ($config['practitioner_website'] ?? ''),
            'booking_url'      => (string) ($config['practitioner_booking_url'] ?? ''),
            'address_street'   => (string) ($config['practitioner_address_street'] ?? ''),
            'address_details'  => (string) ($config['practitioner_address_details'] ?? ''),
            'address_city'     => (string) ($config['practitioner_address_city'] ?? ''),
            'address'          => trim(implode(', ', array_filter([
                (string) ($config['practitioner_address_street'] ?? ''),
                (string) ($config['practitioner_address_city'] ?? ''),
            ]))),
            'access_code'      => (string) ($config['practitioner_access_code'] ?? ''),
            'appointment_intro' => $appointmentIntro,
            'first_session_highlight' => $SessionHighlight,
            'contact_phone_line' => $contactPhoneLine,
            'contact_website_line' => $contactWebsiteLine,
            'contact_booking_line' => $contactBookingLine,
            'pract_title_line' => $practTitleLine,
        ];

        foreach ($vars as $key => $value) {
            $content = str_replace('{{' . $key . '}}', $value, $content);
            $content = str_replace('{{ ' . $key . ' }}', $value, $content);
        }

        return $content;
    }

    private function formatDate(string $date): string
    {
        if ($date === '') {
            return '';
        }
        try {
            $dt = new \DateTime($date);
            $days   = ['lundi','mardi','mercredi','jeudi','vendredi','samedi','dimanche'];
            $months = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
            $dow    = (int) $dt->format('N') - 1;
            $moy    = (int) $dt->format('n') - 1;
            return $days[$dow] . ' ' . $dt->format('d') . ' ' . $months[$moy];
        } catch (\Throwable $e) {
            return $date;
        }
    }

    private function translateAppointmentType(string $type): string
    {
        $map = [
            'shiatsu_futon'   => 'shiatsu sur futon',
            'shiatsu_chair'   => 'shiatsu sur chaise',
            'seance_échange'  => "séance d'échange",
            'sophrologie'     => 'sophrologie',
        ];
        return $map[$type] ?? $type;
    }
}
