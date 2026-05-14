#!/usr/bin/env python3
import json
import sys

def load(path):
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)

def main(summary_path, baseline_path):
    summary = load(summary_path)
    baseline = load(baseline_path)

    p95 = summary.get('p95_latency_ms') or summary.get('p95') or summary.get('avg')
    err_rate = summary.get('error_rate') or 0
    rps = summary.get('requests_per_sec') or summary.get('rps') or summary.get('reqs') or 0

    tol = baseline.get('tolerance_percent', 20) / 100.0

    fails = []

    if p95 is not None:
        baseline_p95 = baseline.get('p95_latency_ms')
        if baseline_p95 and p95 > baseline_p95 * (1 + tol):
            fails.append(f'p95 regression: {p95}ms > {baseline_p95}ms +{tol*100:.0f}%')

    baseline_err = baseline.get('error_rate')
    if baseline_err is not None and err_rate > baseline_err * (1 + tol):
        fails.append(f'error rate regression: {err_rate} > {baseline_err} +{tol*100:.0f}%')

    if fails:
        print('REGRESSION DETECTED:')
        for f in fails:
            print(' -', f)
        sys.exit(1)

    print('No regressions detected.')
    sys.exit(0)

if __name__ == '__main__':
    if len(sys.argv) != 3:
        print('Usage: check_regression.py <summary.json> <baseline.json>')
        sys.exit(2)
    main(sys.argv[1], sys.argv[2])
