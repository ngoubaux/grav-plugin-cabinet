<?php
namespace Grav\Plugin\Cabinet\Flex;

use Grav\Common\Flex\Types\Generic\GenericObject;
use Grav\Common\Grav;

class RendezVousObject extends GenericObject
{
    /**
     * Override getFormValue so DataTable::renderColumn() gets the computed name.
     */
    public function getFormValue(string $name, $default = null, ?string $separator = null)
    {
        if ($name === 'contact_name') {
            return $this->computeContactName();
        }
        return parent::getFormValue($name, $default, $separator);
    }

    /**
     * Compute contact_name from contact_uuid
     */
    private function computeContactName(): string
    {
        $uuid = (string) ($this->contact_uuid ?? '');
        if ($uuid === '') {
            return 'N/A';
        }

        $flex = Grav::instance()['flex'] ?? null;
        $dir  = $flex?->getDirectory('clients');
        $obj  = $dir?->getObject($uuid);

        if ($obj) {
            $name = trim(($obj->first_name ?? '') . ' ' . ($obj->last_name ?? ''));
            return $name ?: ($obj->email ?? 'N/A');
        }

        return 'N/A';
    }

    /**
     * Override jsonSerialize to include computed contact_name
     */
    public function jsonSerialize(): array
    {
        $data = parent::jsonSerialize();
        $data['contact_name'] = $this->computeContactName();
        return $data;
    }
}
