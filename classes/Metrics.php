<?php

namespace Grav\Plugin\Cabinet;

use Grav\Common\Grav;

class Metrics
{
    private Core $core;

    public function __construct(Core $core)
    {
        $this->core = $core;
    }

    public function compute(): array
    {
        $grav = Grav::instance();
        $flex = $grav['flex'] ?? null;

        $clients          = [];
        $rendezVousRecords = [];

        if ($flex) {
            $clientsDir = $flex->getDirectory('clients');
            if ($clientsDir) {
                foreach ($clientsDir->getCollection() as $uuid => $obj) {
                    $clients[(string) $uuid] = $this->toArray($obj);
                }
            }

            $rvDir = $this->getRendezVousDirectory($flex);
            if ($rvDir) {
                foreach ($rvDir->getCollection() as $key => $obj) {
                    $arr          = $this->toArray($obj);
                    $arr['_flex_key'] = (string) $key;
                    $rendezVousRecords[] = $arr;
                }
            }
        }

        $today      = date('Y-m-d');
        $weekStart  = date('Y-m-d', strtotime('monday this week'));
        $weekEnd    = date('Y-m-d', strtotime('sunday this week'));
        $monthStart = date('Y-m-01');
        $monthEnd   = date('Y-m-t');

        $upcoming        = 0;
        $todayCount      = 0;
        $thisWeek        = 0;
        $thisMonth       = 0;
        $completed       = 0;
        $cancelled       = 0;
        $clientsWithFuture = [];
        $monthlyActivity = [];

        foreach ($rendezVousRecords as $r) {
            $date     = (string) ($r['appointment_date'] ?? '');
            $status   = strtolower((string) ($r['status'] ?? 'planned'));
            $clientId = (string) ($r['contact_uuid'] ?? '');

            if ($status === 'done') {
                $completed++;
            } elseif ($status === 'cancelled') {
                $cancelled++;
            }

            if ($status !== 'cancelled') {
                if ($date >= $today) {
                    $upcoming++;
                    if ($clientId !== '') {
                        $clientsWithFuture[$clientId] = true;
                    }
                }
                if ($date === $today) {
                    $todayCount++;
                }
                if ($date >= $weekStart && $date <= $weekEnd) {
                    $thisWeek++;
                }
                if ($date >= $monthStart && $date <= $monthEnd) {
                    $thisMonth++;
                }
            }

            // Monthly tally (all non-cancelled RDV)
            if ($date !== '' && $status !== 'cancelled') {
                $month = substr($date, 0, 7);
                $monthlyActivity[$month] = ($monthlyActivity[$month] ?? 0) + 1;
            }
        }

        // Last 6 months for the bar chart
        $activity = [];
        for ($i = 5; $i >= 0; $i--) {
            $m = date('Y-m', strtotime("-{$i} months"));
            $activity[] = [
                'month' => $m,
                'label' => $this->shortMonthLabel($m),
                'count' => $monthlyActivity[$m] ?? 0,
            ];
        }

        $totalClients   = count($clients);
        $activeClients  = count($clientsWithFuture);
        $dormantClients = max(0, $totalClients - $activeClients);

        return [
            'total_clients'   => $totalClients,
            'active_clients'  => $activeClients,
            'dormant_clients' => $dormantClients,
            'total_rdv'       => count($rendezVousRecords),
            'upcoming'        => $upcoming,
            'today'           => $todayCount,
            'this_week'       => $thisWeek,
            'this_month'      => $thisMonth,
            'completed'       => $completed,
            'cancelled'       => $cancelled,
            'activity'        => $activity,
        ];
    }

    private function shortMonthLabel(string $yearMonth): string
    {
        static $labels = ['jan','fév','mar','avr','mai','jun','jul','aoû','sep','oct','nov','déc'];
        $parts = explode('-', $yearMonth);
        $m     = (int) ($parts[1] ?? 0);
        return ($m >= 1 && $m <= 12) ? $labels[$m - 1] : $yearMonth;
    }

    private function getRendezVousDirectory($flex)
    {
        if (!$flex) {
            return null;
        }
        $dir = $flex->getDirectory('rendez_vous');
        if ($dir) {
            return $dir;
        }
        $blueprint = dirname(__DIR__) . '/blueprints/flex-objects/rendez_vous.yaml';
        if (!file_exists($blueprint)) {
            return null;
        }
        try {
            $flex->addDirectoryType('rendez_vous', $blueprint);
        } catch (\Throwable $e) {
            return null;
        }
        return $flex->getDirectory('rendez_vous');
    }

    private function toArray($obj): array
    {
        if (is_array($obj)) {
            return $obj;
        }
        if (!is_object($obj)) {
            return [];
        }
        if (method_exists($obj, 'toArray')) {
            $d = $obj->toArray();
            return is_array($d) ? $d : [];
        }
        if (method_exists($obj, 'jsonSerialize')) {
            $d = $obj->jsonSerialize();
            return is_array($d) ? $d : [];
        }
        return [];
    }
}
