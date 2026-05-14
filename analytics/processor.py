import json
import math
from typing import Dict, Any

DEFAULT_TARGET_RPS_PER_POD = 200
DEFAULT_P95_LATENCY_MS = 300

def load_k6_summary(path: str) -> Dict[str, Any]:
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)

def extract_metrics(summary: Dict[str, Any]) -> Dict[str, Any]:
    # Best-effort extraction supporting common k6 JSON summary shapes.
    m = {}
    # If handleSummary produced a compact object with keys we've used in this repo
    for k in ('avg', 'p95', 'p99', 'reqs', 'failed', 'error_rate', 'rps'):
        if k in summary:
            m[k] = summary[k]

    # Try common k6 metric names
    http = summary.get('metrics', {}).get('http_req_duration', {})
    if http:
        values = http.get('values') or {}
        m.setdefault('avg', values.get('avg') or http.get('avg'))
        m.setdefault('p95', values.get('p(95)') or http.get('p(95)') or http.get('p95'))
        m.setdefault('p99', values.get('p(99)') or http.get('p(99)') or http.get('p99'))

    # throughput / requests
    rps = summary.get('metrics', {}).get('http_reqs', {}).get('rate')
    if rps:
        m.setdefault('rps', rps)

    # errors
    errors = summary.get('metrics', {}).get('checks', {}).get('rate')
    if errors is not None:
        m.setdefault('error_rate', 1 - errors)

    # Normalize units: ensure latency in ms
    if 'avg' in m and m['avg'] and m['avg'] < 0.01:
        # k6 may report seconds; convert small values to ms
        m['avg'] = m['avg'] * 1000

    return m

def generate_diagnosis(metrics: Dict[str, Any]) -> Dict[str, Any]:
    p95 = metrics.get('p95') or metrics.get('p95_ms') or metrics.get('avg')
    rps = metrics.get('rps') or metrics.get('reqs')
    err = metrics.get('error_rate', 0)

    findings = []
    suggestions = []

    if p95 is None:
        findings.append('Latency metrics missing — capture `http_req_duration` in k6.')
    else:
        if p95 > DEFAULT_P95_LATENCY_MS:
            findings.append(f'p95 latency is high ({p95:.0f} ms).')
            suggestions.append('Investigate slow database queries, external API calls, and long middleware.')
        else:
            findings.append(f'p95 latency acceptable ({p95:.0f} ms).')

    if err > 0.01:
        findings.append(f'High error rate: {err*100:.2f}%')
        suggestions.append('Add retries with exponential backoff, tighten input validation, and surface detailed errors in logs.')

    if rps:
        findings.append(f'Throughput observed ~{rps} RPS.')
        # simple throughput vs latency heuristic
        if p95 and p95 > DEFAULT_P95_LATENCY_MS:
            suggestions.append('Consider horizontal scaling or optimizing the hot path to reduce tail latency under load.')

    # Aggregate result
    return {
        'findings': findings,
        'suggestions': suggestions or ['No specific optimizations identified — consider deeper profiling.']
    }

def recommend_hpa(metrics: Dict[str, Any], current_replicas: int = 1) -> Dict[str, Any]:
    rps = metrics.get('rps') or metrics.get('reqs') or 0
    target_per_pod = DEFAULT_TARGET_RPS_PER_POD

    if rps <= 0:
        return {'replicas': current_replicas, 'note': 'Insufficient throughput data to recommend replicas.'}

    desired = max(1, math.ceil(float(rps) / target_per_pod))

    # simple resource guidance
    return {
        'current_replicas': current_replicas,
        'recommended_replicas': desired,
        'rationale': f'Observed RPS {rps} divided by target_per_pod {target_per_pod} -> {desired} replicas',
        'yaml_snippet': generate_hpa_yaml_snippet(desired)
    }

def generate_hpa_yaml_snippet(replicas: int) -> str:
    return (
        f"apiVersion: autoscaling/v2\n"
        f"kind: HorizontalPodAutoscaler\n"
        f"metadata:\n  name: api-hpa\n"
        f"spec:\n  minReplicas: 1\n  maxReplicas: {max(replicas, 5)}\n  metrics:\n  - type: Resource\n    resource:\n      name: cpu\n      target:\n        type: Utilization\n        averageUtilization: 70\n"
    )
