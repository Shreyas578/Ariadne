"""
Ariadne Investigator Agent
Follows stigmergic trails, detects multi-hop graph motifs, retrieves confirmed Playbooks,
and generates provenance-checked decisions via the LLM Cluster.
"""
import time
import logging
from typing import Dict, Any, List, Optional
from ariadne.db.client import db_client
from ariadne.config import settings
from ariadne.models.cluster import llm_cluster
from ariadne.agents.memory_writer import MemoryWriter

logger = logging.getLogger("ariadne.agents.investigator")


class InvestigatorAgent:
    def __init__(
        self,
        agent_id: str = "agent_investigator_01",
        tenant_id: str = settings.DEFAULT_TENANT_ID,
    ):
        self.agent_id = agent_id
        self.tenant_id = tenant_id
        self.writer = MemoryWriter(tenant_id=tenant_id)
        self._ensure_agent_node()

    def _ensure_agent_node(self) -> None:
        """Register the Investigator Agent in FalkorDB."""
        graph = db_client.get_graph(self.tenant_id)
        cypher = """
        MERGE (ag:Agent {id: $agent_id})
        ON CREATE SET ag.role = 'investigator', ag.created_at = $ts
        RETURN ag.id
        """
        try:
            graph.query(cypher, {"agent_id": self.agent_id, "ts": time.time()})
        except Exception as e:
            logger.debug(f"Agent registration: {e}")

    def find_unclaimed_trails(
        self, min_effective_weight: float = 0.2
    ) -> List[Dict[str, Any]]:
        """
        Retrieves highest-priority decayed trails deposited by Triage agents.
        Applies mathematical decay at read-time: weight * exp(-lambda * dt).
        """
        graph = db_client.get_graph(self.tenant_id)
        now_ts = time.time()
        cypher = """
        MATCH (ag:Agent {role: 'triage'})-[r:TRAIL {type: 'FLAGGED'}]->(a:Account)
        OPTIONAL MATCH (:Agent {role: 'investigator'})-[c:TRAIL {type: 'CLAIMED'}]->(a)
        WHERE c IS NULL
        WITH a, r, ($now_ts - r.last_reinforced) AS dt, $lambda AS lambda
        WITH a, (r.weight * exp(-lambda * dt)) AS effective_weight
        WHERE effective_weight >= $min_weight
        RETURN a.id AS account_id, effective_weight
        ORDER BY effective_weight DESC
        LIMIT 10
        """
        results = []
        try:
            res = graph.query(
                cypher,
                {
                    "now_ts": now_ts,
                    "lambda": settings.TRAIL_DECAY_LAMBDA,
                    "min_weight": min_effective_weight,
                },
            )
            if res.result_set:
                for row in res.result_set:
                    results.append({"account_id": row[0], "effective_weight": row[1]})
        except Exception as e:
            logger.error(f"Error querying unclaimed trails: {e}")
        return results

    def claim_account(self, account_id: str) -> None:
        """Deposits a CLAIMED trail so other investigators do not duplicate work."""
        graph = db_client.get_graph(self.tenant_id)
        now_ts = time.time()
        cypher = """
        MATCH (ag:Agent {id: $agent_id})
        MATCH (a:Account {id: $account_id})
        MERGE (ag)-[r:TRAIL {type: 'CLAIMED'}]->(a)
        SET r.created_at = $now_ts, r.last_reinforced = $now_ts, r.weight = 1.0
        """
        graph.query(cypher, {"agent_id": self.agent_id, "account_id": account_id, "now_ts": now_ts})

    def detect_motifs(self, start_account_id: str) -> Dict[str, Any]:
        """
        Runs full suite of 5 deterministic pure Cypher motif scans:
        1. Circular Smurfing Loop (3..5 hops)
        2. High Fan-Out Structuring (Smurfing to multiple beneficiaries)
        3. High Fan-In Gathering (Funneling mules into destination sink)
        4. Scatter-Gather Layering (Rapid transit via intermediate mules)
        5. Shared Device / Identity Sybil Ring (Coordinated botnet/synthetic IDs)
        """
        graph = db_client.get_graph(self.tenant_id)
        motifs = []
        nodes = set()
        edges = []

        # 1. Circular Smurfing Loop (3..5 hops)
        cycle_cypher = """
        MATCH path = (a:Account {id: $acc_id})-[:TRANSFERRED*3..5]->(a)
        RETURN [n IN nodes(path) | n.id] AS cycle_nodes,
               [r IN relationships(path) | {src: startNode(r).id, dst: endNode(r).id, amount: r.amount}] AS txs
        LIMIT 3
        """
        try:
            res = graph.query(cycle_cypher, {"acc_id": start_account_id})
            if res.result_set and len(res.result_set) > 0:
                motifs.append("CIRCULAR_SMURFING_LOOP")
                for row in res.result_set:
                    for nid in row[0]:
                        nodes.add(nid)
                    for tx in row[1]:
                        edges.append({"source": tx["src"], "target": tx["dst"], "amount": tx.get("amount", 0)})
        except Exception as e:
            logger.debug(f"Cycle scan exception: {e}")

        # 2. Fan-Out Structuring (Single hub dispersing funds to >= 3 beneficiaries)
        fan_out_cypher = """
        MATCH (source:Account {id: $acc_id})-[r:TRANSFERRED]->(dest:Account)
        WITH source, count(DISTINCT dest) AS out_degree, sum(r.amount) AS total_out, collect(DISTINCT dest.id) AS recipients, collect(r) AS rels
        WHERE out_degree >= 3
        RETURN source.id AS src, out_degree, total_out, recipients,
               [rel IN rels | {src: startNode(rel).id, dst: endNode(rel).id, amount: rel.amount}] AS txs
        LIMIT 1
        """
        try:
            res = graph.query(fan_out_cypher, {"acc_id": start_account_id})
            if res.result_set and len(res.result_set) > 0:
                motifs.append("FAN_OUT_STRUCTURING")
                nodes.add(start_account_id)
                for row in res.result_set:
                    for r_id in row[3]:
                        nodes.add(r_id)
                    for tx in row[4]:
                        edges.append({"source": tx["src"], "target": tx["dst"], "amount": tx.get("amount", 0)})
        except Exception as e:
            logger.debug(f"Fan-out scan exception: {e}")

        # 3. Fan-In Funneling (Multiple senders concentrating funds into this sink >= 3 senders)
        fan_in_cypher = """
        MATCH (source:Account)-[r:TRANSFERRED]->(sink:Account {id: $acc_id})
        WITH sink, count(DISTINCT source) AS in_degree, sum(r.amount) AS total_in, collect(DISTINCT source.id) AS senders, collect(r) AS rels
        WHERE in_degree >= 3
        RETURN sink.id AS sink_id, in_degree, total_in, senders,
               [rel IN rels | {src: startNode(rel).id, dst: endNode(rel).id, amount: rel.amount}] AS txs
        LIMIT 1
        """
        try:
            res = graph.query(fan_in_cypher, {"acc_id": start_account_id})
            if res.result_set and len(res.result_set) > 0:
                motifs.append("FAN_IN_FUNNELING")
                nodes.add(start_account_id)
                for row in res.result_set:
                    for s_id in row[3]:
                        nodes.add(s_id)
                    for tx in row[4]:
                        edges.append({"source": tx["src"], "target": tx["dst"], "amount": tx.get("amount", 0)})
        except Exception as e:
            logger.debug(f"Fan-in scan exception: {e}")

        # 4. Scatter-Gather Layering (Funds passing through mule accounts rapidly)
        scatter_cypher = """
        MATCH (src:Account {id: $acc_id})-[r1:TRANSFERRED]->(mule:Account)-[r2:TRANSFERRED]->(dst:Account)
        WHERE src <> dst AND r2.ts >= r1.ts
        RETURN mule.id AS mule_id, dst.id AS dst_id, r1.amount AS a1, r2.amount AS a2
        LIMIT 5
        """
        try:
            res = graph.query(scatter_cypher, {"acc_id": start_account_id})
            if res.result_set and len(res.result_set) > 0:
                motifs.append("SCATTER_GATHER_LAYERING")
                nodes.add(start_account_id)
                for row in res.result_set:
                    nodes.add(row[0])
                    nodes.add(row[1])
                    edges.append({"source": start_account_id, "target": row[0], "amount": row[2]})
                    edges.append({"source": row[0], "target": row[1], "amount": row[3]})
        except Exception as e:
            logger.debug(f"Scatter-gather scan exception: {e}")

        # 5. Shared Device / Card Ring (Identity and Synthetic ID Sybil network)
        device_cypher = """
        MATCH (a:Account {id: $acc_id})-[:USES]->(d:Device)<-[:USES]-(other:Account)
        RETURN d.id AS device_id, collect(DISTINCT other.id) AS ring_accounts
        LIMIT 5
        """
        try:
            res = graph.query(device_cypher, {"acc_id": start_account_id})
            if res.result_set and len(res.result_set) > 0:
                motifs.append("SHARED_DEVICE_SYBIL_RING")
                nodes.add(start_account_id)
                for row in res.result_set:
                    dev_id = row[0]
                    nodes.add(dev_id)
                    for acc in row[1]:
                        nodes.add(acc)
                        edges.append({"source": acc, "target": dev_id, "type": "USES"})
                    edges.append({"source": start_account_id, "target": dev_id, "type": "USES"})
        except Exception as e:
            logger.debug(f"Device ring exception: {e}")

        # Fallback if no motif nodes yet (e.g., initial seed probe)
        if not nodes:
            nodes.add(start_account_id)

        # Build clean provenance format
        provenance = {
            "nodes": [{"id": nid, "label": "Account" if not str(nid).startswith("DEV_") else "Device"} for nid in nodes],
            "edges": edges,
        }
        return {"motifs": motifs, "provenance": provenance}

    async def investigate_case(
        self, case_id: str, seed_account_id: str, model_tier: str = "llama-3.3-70b"
    ) -> Dict[str, Any]:
        """
        Executes full investigation:
        1. Claim seed account trail.
        2. Detect graph motifs and assemble provenance subgraph.
        3. Compute deterministic verdict & confidence.
        4. Request natural language summary from LLM Cluster.
        5. Verify summary against Provenance Guard.
        6. Commit Decision to FalkorDB via MemoryWriter single writer gate.
        """
        self.claim_account(seed_account_id)
        motif_res = self.detect_motifs(seed_account_id)
        motifs = motif_res["motifs"]
        provenance = motif_res["provenance"]

        # 1. Deterministic scoring: Rule 1 (Graph algorithms & Cypher produce baseline verdicts)
        confidence = 0.0
        if "CIRCULAR_SMURFING_LOOP" in motifs:
            confidence += 0.85
        if "SCATTER_GATHER_LAYERING" in motifs:
            confidence += 0.75
        if "FAN_OUT_STRUCTURING" in motifs:
            confidence += 0.65
        if "FAN_IN_FUNNELING" in motifs:
            confidence += 0.60
        if "SHARED_DEVICE_SYBIL_RING" in motifs:
            confidence += 0.50

        # Compound bonus: multi-motif topologies (e.g. structuring + shared device) indicate organized crime syndicates
        if len(motifs) >= 2:
            confidence = min(0.98, confidence + 0.15)
        else:
            confidence = min(1.0, confidence)

        # 2. Multi-Model Cluster Consensus Evaluation (ADR 005)
        consensus_res = await llm_cluster.evaluate_case_consensus(
            provenance=provenance,
            motifs_detected=motifs,
            base_confidence=confidence,
        )
        final_confidence = consensus_res["adjusted_confidence"]
        verdict = "SUSPICIOUS_FRAUD" if final_confidence >= 0.70 else ("REVIEW_REQUIRED" if final_confidence >= 0.40 else "LEGITIMATE")

        # 3. Procedural Memory: Retrieve or Commit Playbook (Weak-to-Strong)
        playbook = None
        for m in motifs:
            playbook = self.writer.get_playbook(m)
            if playbook:
                break

        # If frontier model (70B) confirmed a high-confidence motif without a prior playbook, synthesize & commit one!
        if not playbook and motifs and final_confidence >= 0.80:
            primary_motif = motifs[0]
            new_pb_id = f"PB_{primary_motif}_{int(time.time())}"
            self.writer.commit_playbook(
                playbook_id=new_pb_id,
                motif_type=primary_motif,
                investigation_steps=[
                    "1. Match multi-hop transfer topology via pure Cypher",
                    "2. Verify entity legitimacy against device USES edges",
                    "3. Validate transaction latency and structuring below reporting thresholds",
                ],
                recommended_action="FREEZE_AND_FILE_SAR",
                discovered_by_model="llama-3.3-70b-versatile",
            )
            playbook = {"id": new_pb_id, "steps": "Auto-synthesized frontier playbook."}

        # 4. Natural language summary from LLM Cluster (guided by playbook if available)
        summary_res = await llm_cluster.generate_verified_summary(
            provenance=provenance,
            motifs_detected=motifs,
            model_tier=model_tier,
            playbook=playbook,
        )

        summary = summary_res["summary"]
        if not summary_res["is_valid"]:
            logger.warning(
                f"Provenance Guard rejected summary due to hallucinated entities: {summary_res['hallucinated_entities']}"
            )
            # Revert to certified fallback to ensure 0% hallucination in committed memory
            summary = (
                f"Certified Summary: Detected {motifs} across accounts {[n['id'] for n in provenance['nodes']]}. "
                f"Hallucination filter triggered and sanitized."
            )

        # 5. Commit to FalkorDB tamper-evident hash chain via single-writer gate
        commit_res = self.writer.commit_decision(
            case_id=case_id,
            investigator_agent_id=self.agent_id,
            verdict=verdict,
            confidence=final_confidence,
            provenance=provenance,
            summary=summary,
        )

        return {
            "case_id": case_id,
            "verdict": verdict,
            "confidence": final_confidence,
            "motifs": motifs,
            "provenance": provenance,
            "summary": summary,
            "hash": commit_res["hash"],
            "prev_hash": commit_res["prev_hash"],
            "recorded_at": commit_res["recorded_at"],
            "anti_hallucination_passed": summary_res["is_valid"],
            "cluster_consensus": consensus_res,
            "playbook_used": summary_res.get("guided_by_playbook"),
        }
