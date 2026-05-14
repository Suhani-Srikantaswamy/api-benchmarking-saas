Analytics prototype (Pandas) for k6 benchmark processing

This prototype ingests a k6 JSON summary and produces:
- a heuristic natural-language diagnosis of bottlenecks
- a simple Kubernetes HPA recommendation (replica count and resource guidance)

Quick start:

1. Create a virtualenv and install dependencies:

```bash
python -m venv .venv
source .venv/bin/activate  # or .\\.venv\\Scripts\\activate on Windows
pip install -r requirements.txt
```

2. Run the sample analytics on the included example:

```bash
python ingest_k6.py sample_k6_summary.json
```

Optional: set `OPENAI_API_KEY` to enable LLM-based refinement of the diagnosis.
