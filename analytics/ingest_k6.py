#!/usr/bin/env python3
import argparse
import json
import os
from processor import load_k6_summary, extract_metrics, generate_diagnosis, recommend_hpa

def maybe_call_llm(metrics, diagnosis):
    # Optional: if OPENAI_API_KEY is present, call an LLM to refine diagnosis.
    api_key = os.environ.get('OPENAI_API_KEY')
    if not api_key:
        return None
    try:
        import requests
        prompt = {
            'metrics': metrics,
            'diagnosis': diagnosis
        }
        # Minimal example calling OpenAI-compatible API; adapt model and endpoint as needed.
        resp = requests.post(
            'https://api.openai.com/v1/chat/completions',
            headers={'Authorization': f'Bearer {api_key}', 'Content-Type': 'application/json'},
            json={
                'model': 'gpt-4o-mini',
                'messages': [{'role': 'system', 'content': 'You are a performance engineer.'},
                             {'role': 'user', 'content': json.dumps(prompt)}],
                'max_tokens': 400
            },
            timeout=20
        )
        if resp.status_code == 200:
            return resp.json()
    except Exception:
        return None

def main():
    p = argparse.ArgumentParser(description='Process k6 summary JSON and produce diagnosis + HPA recommendation')
    p.add_argument('path', help='Path to k6 summary JSON')
    args = p.parse_args()

    summary = load_k6_summary(args.path)
    metrics = extract_metrics(summary)
    diagnosis = generate_diagnosis(metrics)
    hpa = recommend_hpa(metrics)

    out = {
        'metrics': metrics,
        'diagnosis': diagnosis,
        'hpa_recommendation': hpa
    }

    llm = maybe_call_llm(metrics, diagnosis)
    if llm:
        out['llm_refinement'] = llm

    print(json.dumps(out, indent=2))

if __name__ == '__main__':
    main()
