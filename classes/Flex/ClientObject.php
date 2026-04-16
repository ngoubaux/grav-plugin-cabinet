<?php
namespace Grav\Plugin\Cabinet\Flex;

use Grav\Common\Flex\Types\Generic\GenericObject;
use Grav\Common\Grav;

class ClientObject extends GenericObject
{
    /**
     * Retourne le prochain rendez-vous futur non annulé pour ce client,
     * ou null si aucun n'est planifié.
     */
    public function getNextAppointment(): ?GenericObject
    {
        $flex = Grav::instance()['flex'] ?? null;
        $dir  = $flex?->getDirectory('rendez_vous');
        if (!$dir) {
            return null;
        }

        $uuid      = (string) $this->getKey();
        $today     = date('Y-m-d');
        $next      = null;

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
}
