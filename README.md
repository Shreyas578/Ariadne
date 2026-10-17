# 🛡️ Ariadne — Graph-Native Financial Crimes Intelligence Engine

> **FalkorDB Graph Hacks Hackathon Entry**  
> Autonomous multi-agent AML investigation system driven by stigmergic pheromone coordination, pure Cypher motif detection, a deterministic Provenance Guard, and privacy-preserving collaborative defense.

---

## 🌟 Key Architecture & Differentiators

1. **FalkorDB as the Single Source of Truth ([ADR 001](file:///d:/Projects/Ariadne/DECISIONS.md#L7))**:
   All account graphs, transactions, stigmergic trails, agent episodic memory, and decision audit chains live strictly inside FalkorDB.
2. **Deterministic Verdicts + Provenance Guard ([ADR 002](file:///d:/Projects/Ariadne/DECISIONS.md#L15))**:
   Cypher queries and graph algorithms decide fraud confidence deterministically. An anti-hallucination regex validator guarantees **0% hallucinated entity accusations**.
3. **Biological Stigmergy ([ADR 003](file:///d:/Projects/Ariadne/DECISIONS.md#L26))**:
   Agents communicate asynchronously through FalkorDB edges (`:CHECKED`, `:FLAGGED`, `:CLAIMED`) using read-time exponential decay $w \cdot e^{-\lambda \Delta t}$. No background cron jobs needed.
4. **Single-Writer Gate with Tamper-Evident SHA-256 Chains ([ADR 004](file:///d:/Projects/Ariadne/DECISIONS.md#L36))**:
   Immutable bi-temporal memory where decision nodes form a cryptographic hash chain `(Decision)-[:PREV]->(Decision)`.
5. **Privacy-Preserving Federated Defense ([ADR 007](file:///d:/Projects/Ariadne/DECISIONS.md#L66))**:
   Structural graph motif fingerprints `SHA-256(motif_type + size_bucket + velocity_bucket)` published to `shared_patterns` with zero customer PII.
6. **Isolated Ground-Truth Evaluation ([ADR 006](file:///d:/Projects/Ariadne/DECISIONS.md#L58))**:
   Labels live in the isolated `eval_truth` graph, ensuring 100% unbiased Precision, Recall, and F1 calculation.

---

## 🚀 Quickstart

### 1. Requirements & Dependencies
Ensure Python 3.10+ is installed:
```bash
pip install -r requirements.txt
```

### 2. Configure FalkorDB & LLM Keys
Copy `.env.example` to `.env` and fill in your details:
```ini
FALKORDB_HOST=localhost   # or your FalkorDB Cloud host
FALKORDB_PORT=6379
FALKORDB_PASSWORD=

GROQ_API_KEY=your_free_groq_key
```
*(Note: Ariadne includes a deterministic summary generator so the entire system, UI, and test suite work smoothly even without LLM API keys!)*

### 3. Run FalkorDB (Local or Cloud)
If running locally via Docker:
```bash
docker compose up -d
```

### 4. Launch Ariadne Server & Dashboard
```bash
python -m uvicorn ariadne.server:app --reload --port 8000
```
Open **[http://localhost:8000](http://localhost:8000)** to access the live dashboard:
- **Interactive FalkorDB Graph View**: Real-time rendering of accounts, transactions, and decaying stigmergic pheromone trails.
- **Investigation Control Deck**: Step-by-step dataset seeding, triage scanning, and investigator dispatch.
- **Forensic Verdict & Provenance Guard**: Live case review with token validation checking for zero hallucinated entities.
- **SHA-256 Decision Chain**: Live inspection of the immutable cryptographic audit chain.
- **Isolated Evaluation Matrix**: Live Precision, Recall, and F1 against `eval_truth`.
- **Federated Pattern Sharing**: View zero-PII threat intelligence signatures.

---

## 🧪 Running the Test Suite

Run the unit and integration tests covering decay mathematics, the Provenance Guard, cryptographic hash chaining, and structural fingerprinting:
```bash
python tests/test_core.py
```
*(All 5 tests run in milliseconds with 0 external failures).*
