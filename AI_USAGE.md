# AI Usage Disclosure Log - Ariadne

In accordance with Hackathon guidelines regarding transparent AI disclosure, this log records AI usage throughout the development and runtime of Ariadne.

---

## 1. Development-Time AI Assistance
- **AI Assistant**: Antigravity (Google DeepMind)
- **Role**: Pair-programming partner aiding the project owner in writing modular code, drafting Cypher queries, implementing tests, and documenting architectural decisions.
- **Human Oversight**: Every architectural decision, schema design, model selection, and evaluation pipeline is reviewed, approved, and driven by the human project owner.

---

## 2. Runtime AI Models in Ariadne
Ariadne incorporates open-weight foundation models strictly via free/open tiers. Note that **Ariadne’s graph algorithms and Cypher queries decide fraud verdicts deterministically**; models are only utilized for natural-language forensic summarization and tool-routing:

| Model | Provider / Endpoint | License | Runtime Role |
| :--- | :--- | :--- | :--- |
| **Llama-3.3-70B-Versatile** | Groq Cloud (Free Tier) | Llama 3.3 Community License | Primary Investigator agent: generates forensic summaries strictly from provenance subgraphs. |
| **Llama-3.1-8B-Instant** | Groq Cloud (Free Tier) | Llama 3.1 Community License | Weak-to-strong demo: tests execution efficiency of smaller models given FalkorDB Playbooks. |
| **Qwen-2.5-72B-Instruct** | NVIDIA NIM / Hugging Face (Free Tier) | Apache 2.0 | Cluster consensus auditor: cross-evaluates motif hypothesis with Llama 3.3. |

---

## 3. Anti-Hallucination & Provenance Verification Safeguards
- **Provenance Guard**: A deterministic token-verification algorithm parses LLM responses and immediately rejects any summary that references entities (accounts, merchants, cards) not physically present in the FalkorDB provenance subgraph.
- **Evaluation Isolation**: No models have access to the `eval_truth` graph containing ground-truth fraud labels.
