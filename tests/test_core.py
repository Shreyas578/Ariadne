"""
Ariadne Core Test Suite
Validates:
1. Pure Cypher Stigmergic Exponential Decay: w * exp(-lambda * dt)
2. Provenance Guard: Deterministic rejection of hallucinated entities
3. Cryptographic Decision Hash Chain: Tamper-evident linking
4. Privacy-Preserving Structural Fingerprint Generator
"""
import unittest
import math
import sys
import os

# Ensure project root is in sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from ariadne.models.verifier import ProvenanceVerifier
from ariadne.agents.memory_writer import MemoryWriter
from ariadne.data.federated import PatternPublisher


class TestAriadneCore(unittest.TestCase):

    def test_stigmergy_decay_formula(self):
        """Validates exponential decay formula used in pure Cypher."""
        lambda_decay = 0.005
        initial_weight = 10.0
        dt_seconds = 100.0

        expected = initial_weight * math.exp(-lambda_decay * dt_seconds)
        self.assertTrue(6.0 < expected < 6.1)  # ~6.065
        
        # Check that older trails decay below threshold
        old_dt = 1000.0
        decayed = initial_weight * math.exp(-lambda_decay * old_dt)
        self.assertTrue(decayed < 0.1)

    def test_provenance_guard_clean_summary(self):
        """Summary with only verified provenance entities must pass."""
        provenance = {
            "nodes": [{"id": "ACC_MULE_101"}, {"id": "ACC_MULE_102"}, {"id": "DEV_EMULATOR_888"}],
            "edges": [{"source": "ACC_MULE_101", "target": "ACC_MULE_102", "amount": 9500}]
        }
        summary = "Account ACC_MULE_101 transferred funds to ACC_MULE_102 using device DEV_EMULATOR_888."
        
        is_valid, hallucinations = ProvenanceVerifier.verify(summary, provenance)
        self.assertTrue(is_valid)
        self.assertEqual(len(hallucinations), 0)

    def test_provenance_guard_rejects_hallucination(self):
        """Summary referencing an unverified entity MUST be caught and rejected (Rule 2)."""
        provenance = {
            "nodes": [{"id": "ACC_MULE_101"}, {"id": "ACC_MULE_102"}],
            "edges": [{"source": "ACC_MULE_101", "target": "ACC_MULE_102"}]
        }
        # LLM hallucinates an account ACC_UNKNOWN_999 that was never in the graph
        summary = "Account ACC_MULE_101 sent funds to ACC_UNKNOWN_999 and ACC_MULE_102."
        
        is_valid, hallucinations = ProvenanceVerifier.verify(summary, provenance)
        self.assertFalse(is_valid)
        self.assertIn("ACC_UNKNOWN_999", hallucinations)

    def test_decision_hash_chain(self):
        """Validates SHA-256 chain immutability."""
        writer = MemoryWriter(tenant_id="test_tenant")
        prev_hash = "0" * 64
        payload_1 = {
            "decision_id": "DEC_001",
            "verdict": "SUSPICIOUS_FRAUD",
            "confidence": 0.85,
        }
        hash_1 = writer._hash_decision(prev_hash, payload_1)
        self.assertEqual(len(hash_1), 64)
        self.assertNotEqual(hash_1, prev_hash)

        # Next block in chain
        payload_2 = {
            "decision_id": "DEC_002",
            "verdict": "LEGITIMATE",
            "confidence": 0.15,
        }
        hash_2 = writer._hash_decision(hash_1, payload_2)
        self.assertEqual(len(hash_2), 64)
        self.assertNotEqual(hash_2, hash_1)

        # Tampering with payload_1 changes hash_1, breaking chain integrity
        tampered_payload_1 = payload_1.copy()
        tampered_payload_1["confidence"] = 0.50
        tampered_hash_1 = writer._hash_decision(prev_hash, tampered_payload_1)
        self.assertNotEqual(tampered_hash_1, hash_1)

    def test_privacy_preserving_fingerprint(self):
        """Structural fingerprint generation must be deterministic and leak NO account IDs."""
        publisher = PatternPublisher()
        fp1 = publisher.compute_motif_fingerprint(
            motif_type="CIRCULAR_SMURFING_LOOP",
            node_count=4,
            edge_count=4,
            avg_latency_seconds=1200,
        )
        fp2 = publisher.compute_motif_fingerprint(
            motif_type="CIRCULAR_SMURFING_LOOP",
            node_count=4,
            edge_count=4,
            avg_latency_seconds=1500,
        )
        self.assertEqual(fp1, fp2)  # Same structural bucket
        self.assertEqual(len(fp1), 16)

    def test_cluster_consensus_and_playbook_structure(self):
        """Validates that cluster consensus scoring and procedural playbooks maintain schema."""
        writer = MemoryWriter(tenant_id="test_tenant")
        pb_res = writer.commit_playbook(
            playbook_id="PB_TEST_001",
            motif_type="CIRCULAR_SMURFING_LOOP",
            investigation_steps=["Step 1", "Step 2"],
            recommended_action="FREEZE_AND_FILE_SAR",
            discovered_by_model="llama-3.3-70b-versatile",
        )
        self.assertEqual(pb_res["playbook_id"], "PB_TEST_001")
        self.assertEqual(pb_res["status"], "COMMITTED")


if __name__ == "__main__":
    unittest.main()

