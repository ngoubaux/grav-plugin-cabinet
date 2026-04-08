<?php

namespace Grav\Plugin\Cabinet;

class Facturation
{
    /** @var \Grav\Plugin\Cabinet\Core */
    private $core;

    public function __construct(\Grav\Plugin\Cabinet\Core $core)
    {
        $this->core = $core;
    }

    public function summarize(array $sessionsByClient): array
    {
        $sessionCount = 0;
        $billableCount = 0;
        $totalMinutes = 0;
        $totalAmount = 0.0;
        $paidAmount = 0.0;

        foreach ($sessionsByClient as $sessions) {
            if (!is_array($sessions)) {
                continue;
            }

            foreach ($sessions as $session) {
                if (!is_array($session)) {
                    continue;
                }

                $sessionCount++;
                $duration = (int) ($session['duree'] ?? $session['duration'] ?? 0);
                $totalMinutes += max(0, $duration);

                $amount = $this->resolveAmount($session);
                if ($amount > 0) {
                    $billableCount++;
                    $totalAmount += $amount;

                    if ($this->isPaid($session)) {
                        $paidAmount += $amount;
                    }
                }
            }
        }

        return [
            'session_count' => $sessionCount,
            'billable_count' => $billableCount,
            'total_minutes' => $totalMinutes,
            'total_amount' => round($totalAmount, 2),
            'paid_amount' => round($paidAmount, 2),
            'unpaid_amount' => round(max(0, $totalAmount - $paidAmount), 2),
        ];
    }

    private function resolveAmount(array $session): float
    {
        $candidates = [
            $session['montant'] ?? null,
            $session['amount'] ?? null,
            $session['price'] ?? null,
            $session['tarif'] ?? null,
        ];

        foreach ($candidates as $candidate) {
            if ($candidate === null || $candidate === '') {
                continue;
            }

            if (is_numeric($candidate)) {
                return (float) $candidate;
            }

            $normalized = str_replace(',', '.', (string) $candidate);
            if (is_numeric($normalized)) {
                return (float) $normalized;
            }
        }

        return 0.0;
    }

    private function isPaid(array $session): bool
    {
        if (isset($session['paid'])) {
            return (bool) $session['paid'];
        }

        if (isset($session['regle'])) {
            return (bool) $session['regle'];
        }

        $status = strtolower((string) ($session['payment_status'] ?? $session['status_paiement'] ?? ''));
        return in_array($status, ['paid', 'paye', 'payee', 'regle', 'reglee'], true);
    }
}
