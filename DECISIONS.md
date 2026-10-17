# Architectural Decisions Record (ADR) - Ariadne

This document records key design and architectural decisions made for project **Ariadne** (FalkorDB Graph Hacks Hackathon), in adherence to Hackathon Rule 12 (must be able to explain every query and design decision).

---

## ADR 001: FalkorDB as the Single Source of Truth
- **Status**: Accepted
- **Context**: Hackathon Rule 3 requires that if FalkorDB is removed, the product must stop working.
- **Decision**: All transaction graphs, agent memory (episodic, semantic, procedural), agent stigmergy (pheromone trails), and decision audit chains live strictly inside FalkorDB.
- **Consequences**: No external vector database or secondary SQL store is permitted. Full graph-native design.

---

## ADR 002: Deterministic Verdicts vs. LLM Summaries (The Provenance Guard)
- **Status**: Accepted
- **Context**: LLMs are prone to hallucinating non-existent accounts or financial connections when summarizing fraud cases ("a plausible story isn't evidence").
- **Decision**: 
  1. Graph algorithms (PageRank, WCC) and Cypher queries compute fraud scores and verdicts deterministically.
  2. The LLM only (a) routes tools in ambiguous score zones and (b) drafts the human-readable forensic report strictly from a `provenance_subgraph` JSON.
  3. A deterministic **Provenance Guard** regex/token validator rejects any LLM summary mentioning entities absent from the provenance subgraph.
- **Consequences**: Zero hallucinated fraud accusations. Fully auditable and legally defensible.

---

## ADR 003: Stigmergic Agent Coordination via FalkorDB Trails
- **Status**: Accepted
- **Context**: Multi-agent direct message passing introduces high latency, race conditions, and poor debuggability.
- **Decision**: Agents coordinate asynchronously through FalkorDB graph state using stigmergy (biological pheromone trails):
  - Agent nodes deposit `:CHECKED`, `:FLAGGED`, or `:CLAIMED` edges to accounts/transactions.
  - Trail decay is computed at query time via pure Cypher: `weight * exp(-lambda * dt)`.
- **Consequences**: No background cron job required to age trails; historical time-travel replays remain exact because decay is purely a function of $t_{\text{query}} - t_{\text{deposit}}$.

---

## ADR 004: Single Writer Gate for Bi-Temporal Memory & Audit Chain
- **Status**: Accepted
- **Context**: In multi-agent systems, concurrent writes can corrupt graph state or cause contradictory facts.
- **Decision**: All writes to FalkorDB memory pass through a dedicated **Memory-Writer Gate**:
  - Stamps bi-temporal fields: `valid_from`, `valid_to`, `recorded_at`, `invalid_at`.
  - Facts contradicted by human analyst overrides are invalidated (stamped with `invalid_at`), never deleted.
  - Decisions are cryptographically linked in a tamper-evident SHA-256 hash chain (`(Decision)-[:PREV]->(Decision)`).
- **Consequences**: Complete immutability, full audit history, and easy GDPR/redaction without breaking cryptographic audit proofs.

---

## ADR 005: Multi-Model LLM Cluster for the Investigator Agent
- **Status**: Accepted
- **Context**: Relying on a single proprietary LLM can cause rate-limit failures during hackathon judging and offers no cross-validation.
- **Decision**: The Investigator Agent uses a cluster of open-weight models via free cloud endpoints (Groq Llama-3.3-70B, NVIDIA NIM Qwen-2.5-72B, Hugging Face Serverless):
  - Primary fast reasoning via Groq.
  - Cross-model consensus scoring on suspicious motifs.
  - Weak-to-strong demonstration (Llama-3.1-8B solving a case using 70B-discovered playbooks).
- **Consequences**: High availability, zero hosting cost, and strong ablation showcase.

---

## ADR 006: Evaluation Ground Truth Isolation (`eval_truth`)
- **Status**: Accepted
- **Context**: Accidental data leakage from labels into agent query context inflates benchmark results and invalidates testing.
- **Decision**: True illicit labels from IBM AMLworld or synthetic datasets are kept exclusively in an isolated FalkorDB graph named `eval_truth`. Investigator agents have no credentials or queries targeting this graph.
- **Consequences**: Truly unbiased evaluation metrics (Precision, Recall, F1) displayed live on the Evidence Tab.

---

## ADR 007: Privacy-Preserving Collaborative Defense (`shared_patterns`)
- **Status**: Accepted
- **Context**: Financial institutions face regulatory privacy barriers (GDPR, GLBA) preventing direct sharing of transaction data, yet bad actors exploit siloed banks by reusing identical structural smurfing and sybil topologies across institutions.
- **Decision**: Ariadne computes anonymized structural motif fingerprints `SHA-256(motif_type + size_bucket + velocity_bucket)` stripping all PII (account numbers, names, balances) and commits them to a shared FalkorDB graph `shared_patterns`.
- **Consequences**: Participating banks receive real-time topological early warnings to warm-start their Triage agents without ever exchanging customer PII.

