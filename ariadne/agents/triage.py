"""
Ariadne Triage Agent
Runs deterministic graph algorithms in FalkorDB (Centrality, Shortest Path, Degree, Motif scans)
and deposits stigmergic pheromone trails with read-time exponential decay.
"""
import time
import logging
from typing import List, Dict, Any
from ariadne.db.client import db_client
from ariadne.config import settings

logger = logging.getLogger("ariadne.agents.triage")


class TriageAgent:
    def __init__(
        self,
        agent_id: str = "agent_triage_01",
        tenant_id: str = settings.DEFAULT_TENANT_ID,
    ):
        self.agent_id = agent_id
        self.tenant_id = tenant_id
        self._ensure_agent_node()

    def _ensure_agent_node(self) -> None:
        """Register the Triage Agent node in FalkorDB if absent."""
        graph = db_client.get_graph(self.tenant_id)
        cypher = """
        MERGE (ag:Agent {id: $agent_id})
        ON CREATE SET ag.role = 'triage', ag.created_at = $ts
        RETURN ag.id
        """
        try:
            graph.query(cypher, {"agent_id": self.agent_id, "ts": time.time()})
        except Exception as e:
            logger.debug(f"Agent registration: {e}")

    def deposit_trail(
        self,
        entity_id: str,
        trail_type: str = "FLAGGED",
        delta_weight: float = 1.0,
    ) -> None:
        """
        Deposits or reinforces a stigmergic pheromone trail on an entity.
        Trail will decay naturally at read-time via exp(-lambda * dt).
        """
        graph = db_client.get_graph(self.tenant_id)
        now_ts = time.time()
        cypher = """
        MATCH (ag:Agent {id: $agent_id})
        MATCH (e {id: $entity_id})
        MERGE (ag)-[r:TRAIL {type: $trail_type}]->(e)
        ON CREATE SET 
            r.weight = $delta_weight,
            r.created_at = $now_ts,
            r.last_reinforced = $now_ts
        ON MATCH SET 
            r.weight = CASE WHEN (r.weight + $delta_weight) > 10.0 THEN 10.0 ELSE (r.weight + $delta_weight) END,
            r.last_reinforced = $now_ts
        RETURN r.weight
        """
        graph.query(
            cypher,
            {
                "agent_id": self.agent_id,
                "entity_id": entity_id,
                "trail_type": trail_type,
                "delta_weight": delta_weight,
                "now_ts": now_ts,
            },
        )

    def scan_high_velocity_accounts(
        self,
        min_transactions: int = 4,
        time_window_seconds: float = 86400,
    ) -> List[Dict[str, Any]]:
        """
        Scans graph for high-velocity transfer hubs and automatically deposits 'FLAGGED' trails.
        """
        graph = db_client.get_graph(self.tenant_id)
        cypher = """
        MATCH (a:Account)-[r:TRANSFERRED]->(dest:Account)
        WITH a, count(r) AS tx_count, sum(r.amount) AS total_volume
        WHERE tx_count >= $min_tx
        RETURN a.id AS account_id, tx_count, total_volume
        ORDER BY total_volume DESC
        LIMIT 20
        """
        flagged = []
        try:
            res = graph.query(cypher, {"min_tx": min_transactions})
            if res.result_set:
                for row in res.result_set:
                    acc_id, tx_count, volume = row[0], row[1], row[2]
                    # Deposit FLAGGED trail for the Investigator Agent to pick up
                    self.deposit_trail(acc_id, trail_type="FLAGGED", delta_weight=1.5)
                    flagged.append(
                        {
                            "account_id": acc_id,
                            "tx_count": tx_count,
                            "total_volume": volume,
                        }
                    )
        except Exception as e:
            logger.error(f"Error in scan_high_velocity_accounts: {e}")
        return flagged
