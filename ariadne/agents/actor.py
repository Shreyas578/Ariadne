"""
Ariadne Actor Agent
Executes simulated policy enforcement (freeze, escalate, abstain)
based on deterministic thresholds and Decision confidence.
"""
import logging
from typing import Dict, Any

logger = logging.getLogger("ariadne.agents.actor")


class ActorAgent:
    """
    Implements simulated action policies:
    - Confidence >= 0.80: FREEZE accounts and file SAR (Suspicious Activity Report).
    - Confidence between 0.40 and 0.80: ESCALATE to human analyst triage.
    - Confidence < 0.40: ABSTAIN / CLOSE as low risk.
    """

    def __init__(self, agent_id: str = "agent_actor_01"):
        self.agent_id = agent_id

    def execute_policy(self, decision: Dict[str, Any]) -> Dict[str, Any]:
        confidence = decision.get("confidence", 0.0)
        case_id = decision.get("case_id", "UNKNOWN")

        if confidence >= 0.80:
            action = "FREEZE_AND_FILE_SAR"
            rationale = f"High confidence fraud ({confidence:.2f}) meets automated enforcement threshold."
            executed = True
        elif confidence >= 0.40:
            action = "ESCALATE_TO_ANALYST"
            rationale = f"Ambiguous confidence ({confidence:.2f}) requires human verification."
            executed = False  # Escalated
        else:
            action = "ABSTAIN_LOW_RISK"
            rationale = f"Low risk score ({confidence:.2f}); within normal transaction tolerances."
            executed = True

        logger.info(f"Actor policy for case {case_id}: {action} (Executed={executed})")
        return {
            "case_id": case_id,
            "action": action,
            "rationale": rationale,
            "executed": executed,
        }

    def evaluate_policy(self, verdict: str, confidence: float, case_id: str = "CASE_BENCH") -> str:
        """Direct policy evaluation helper returning policy action string."""
        decision = {"verdict": verdict, "confidence": confidence, "case_id": case_id}
        res = self.execute_policy(decision)
        return res["action"]
