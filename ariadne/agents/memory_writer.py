"""
Ariadne Memory-Writer Agent (Single Writer Gate)
Sole authorized committer for Facts, Playbooks, Cases, and tamper-evident Decision hash chains.
Enforces bi-temporal fields and non-destructive invalidation.
"""
import time
import hashlib
import json
from typing import Dict, Any, Optional, List
import logging
from ariadne.db.client import db_client
from ariadne.config import settings

logger = logging.getLogger("ariadne.agents.memory_writer")


class MemoryWriter:
    """
    Implements Core Principle 4:
    - Single writer gate.
    - Bi-temporal stamps: valid_from, valid_to, recorded_at, invalid_at.
    - Contradicted facts are invalidated, never deleted.
    - Decisions are cryptographically linked in a tamper-evident SHA-256 chain.
    """

    def __init__(self, tenant_id: str = settings.DEFAULT_TENANT_ID):
        self.tenant_id = tenant_id

    def _hash_decision(self, prev_hash: str, decision_payload: Dict[str, Any]) -> str:
        """Computes SHA-256 tamper-evident hash for the decision block."""
        serialized = json.dumps(decision_payload, sort_keys=True)
        return hashlib.sha256(f"{prev_hash}:{serialized}".encode("utf-8")).hexdigest()

    def get_latest_decision_hash(self) -> str:
        """Finds the most recent decision hash to maintain the chain."""
        graph = db_client.get_graph(self.tenant_id)
        query = """
        MATCH (d:Decision)
        WHERE NOT EXISTS { MATCH (:Decision)-[:PREV]->(d) }
        RETURN d.hash AS latest_hash
        LIMIT 1
        """
        try:
            res = graph.query(query)
            if res.result_set and len(res.result_set) > 0:
                return res.result_set[0][0]
        except Exception as e:
            logger.debug(f"Error querying latest decision hash: {e}")
        return "0" * 64  # Genesis block hash

    def commit_decision(
        self,
        case_id: str,
        investigator_agent_id: str,
        verdict: str,
        confidence: float,
        provenance: Dict[str, Any],
        summary: str,
    ) -> Dict[str, Any]:
        """
        Cryptographically appends a new Decision node into FalkorDB
        linked to the prior Decision and the provenance entities.
        """
        graph = db_client.get_graph(self.tenant_id)
        now_ts = time.time()
        prev_hash = self.get_latest_decision_hash()

        decision_id = f"DEC_{int(now_ts * 1000)}"
        payload = {
            "decision_id": decision_id,
            "case_id": case_id,
            "verdict": verdict,
            "confidence": confidence,
            "summary": summary,
            "recorded_at": now_ts,
        }
        curr_hash = self._hash_decision(prev_hash, payload)

        cypher = """
        MATCH (ag:Agent {id: $agent_id})
        MERGE (cs:Case {id: $case_id})
        CREATE (dec:Decision {
            id: $decision_id,
            case_id: $case_id,
            verdict: $verdict,
            confidence: $confidence,
            summary: $summary,
            hash: $hash,
            prev_hash: $prev_hash,
            recorded_at: $now_ts
        })
        CREATE (cs)-[:HAS_DECISION]->(dec)
        CREATE (ag)-[:AUTHORED]->(dec)
        WITH dec
        // Link to previous decision in chain if not genesis
        OPTIONAL MATCH (prev:Decision {hash: $prev_hash})
        FOREACH (_ IN CASE WHEN prev IS NOT NULL THEN [1] ELSE [] END |
            CREATE (dec)-[:PREV]->(prev)
        )
        RETURN dec.id AS id, dec.hash AS hash
        """
        params = {
            "agent_id": investigator_agent_id,
            "case_id": case_id,
            "decision_id": decision_id,
            "verdict": verdict,
            "confidence": confidence,
            "summary": summary,
            "hash": curr_hash,
            "prev_hash": prev_hash,
            "now_ts": now_ts,
        }
        graph.query(cypher, params)

        # Connect Decision -[:BASED_ON]-> Provenance Entities
        node_ids = [n.get("id") for n in provenance.get("nodes", []) if "id" in n]
        if node_ids:
            link_cypher = """
            MATCH (dec:Decision {id: $decision_id})
            MATCH (e) WHERE e.id IN $node_ids
            MERGE (dec)-[:BASED_ON]->(e)
            """
            graph.query(link_cypher, {"decision_id": decision_id, "node_ids": node_ids})

        logger.info(f"Decision {decision_id} committed with hash {curr_hash[:12]}...")
        return {
            "decision_id": decision_id,
            "hash": curr_hash,
            "prev_hash": prev_hash,
            "recorded_at": now_ts,
        }

    def record_fact(
        self,
        fact_id: str,
        subject_id: str,
        fact_type: str,
        confidence: float,
        properties: Dict[str, Any],
        valid_from: Optional[float] = None,
        valid_to: Optional[float] = None,
    ) -> None:
        """
        Writes an immutable bi-temporal fact node into FalkorDB.
        """
        graph = db_client.get_graph(self.tenant_id)
        now_ts = time.time()
        vf = valid_from or now_ts
        vt = valid_to or (now_ts + 86400 * 365)  # Default 1 year validity

        cypher = """
        MATCH (e {id: $subject_id})
        CREATE (f:Fact {
            id: $fact_id,
            subject_id: $subject_id,
            fact_type: $fact_type,
            confidence: $confidence,
            properties: $properties_json,
            valid_from: $valid_from,
            valid_to: $valid_to,
            recorded_at: $recorded_at,
            invalid_at: null
        })
        CREATE (f)-[:ABOUT]->(e)
        RETURN f.id AS id
        """
        params = {
            "fact_id": fact_id,
            "subject_id": subject_id,
            "fact_type": fact_type,
            "confidence": confidence,
            "properties_json": json.dumps(properties),
            "valid_from": vf,
            "valid_to": vt,
            "recorded_at": now_ts,
        }
        graph.query(cypher, params)

    def invalidate_fact(self, fact_id: str, reason: str) -> None:
        """
        Invalidates a fact without deleting history (Bi-temporal audit compliance).
        """
        graph = db_client.get_graph(self.tenant_id)
        now_ts = time.time()
        cypher = """
        MATCH (f:Fact {id: $fact_id})
        SET f.invalid_at = $now_ts,
            f.invalidation_reason = $reason
        RETURN f.id
        """
        graph.query(cypher, {"fact_id": fact_id, "now_ts": now_ts, "reason": reason})
        logger.info(f"Fact {fact_id} invalidated at timestamp {now_ts} (Reason: {reason})")

    def commit_playbook(
        self,
        playbook_id: str,
        motif_type: str,
        investigation_steps: List[str],
        recommended_action: str,
        discovered_by_model: str = "llama-3.3-70b-versatile",
    ) -> Dict[str, Any]:
        """
        Stores procedural memory (investigation playbook) in FalkorDB.
        Discovered by frontier models (70B), reusable by compact models (8B).
        """
        graph = db_client.get_graph(self.tenant_id)
        now_ts = time.time()
        cypher = """
        MERGE (pb:Playbook {id: $playbook_id})
        SET pb.motif_type = $motif_type,
            pb.steps = $steps,
            pb.action = $action,
            pb.discovered_by = $model,
            pb.created_at = $now_ts
        RETURN pb.id
        """
        params = {
            "playbook_id": playbook_id,
            "motif_type": motif_type,
            "steps": json.dumps(investigation_steps),
            "action": recommended_action,
            "model": discovered_by_model,
            "now_ts": now_ts,
        }
        graph.query(cypher, params)
        return {"playbook_id": playbook_id, "motif_type": motif_type, "status": "COMMITTED"}

    def get_playbook(self, motif_type: str) -> Optional[Dict[str, Any]]:
        """
        Retrieves confirmed investigation playbook for a motif to guide smaller models.
        """
        graph = db_client.get_graph(self.tenant_id)
        cypher = """
        MATCH (pb:Playbook {motif_type: $motif_type})
        RETURN pb.id, pb.steps, pb.action, pb.discovered_by
        LIMIT 1
        """
        try:
            res = graph.query(cypher, {"motif_type": motif_type})
            if res.result_set:
                row = res.result_set[0]
                return {
                    "id": row[0],
                    "steps": json.loads(row[1]) if isinstance(row[1], str) else row[1],
                    "action": row[2],
                    "discovered_by": row[3],
                }
        except Exception as e:
            logger.debug(f"Playbook lookup exception: {e}")
        return None
