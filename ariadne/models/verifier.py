"""
Ariadne Provenance Guard & Anti-Hallucination Verifier
Deterministic verifier: rejects any LLM summary mentioning entities absent from the provenance subgraph.
"""
import re
from typing import Set, Dict, Any, List, Tuple


class ProvenanceVerifier:
    """
    Validates that every financial entity (Account, Card, Device, Merchant)
    referenced in an LLM-generated summary exists inside the verified provenance subgraph.
    """

    # Common entity patterns in synthetic / AML datasets (e.g. ACC_123, C123456, D_789, MERCH_456)
    ENTITY_REGEX = re.compile(r"\b([A-Z0-9]{3,}_[A-Z0-9_]+|[A-Z]{1,3}\d{4,})\b")

    @classmethod
    def extract_provenance_entities(cls, provenance: Dict[str, Any]) -> Set[str]:
        """Extract all known entity IDs from the provenance subgraph."""
        entities = set()
        for node in provenance.get("nodes", []):
            if "id" in node:
                entities.add(str(node["id"]).strip().upper())
        for edge in provenance.get("edges", []):
            if "source" in edge:
                entities.add(str(edge["source"]).strip().upper())
            if "target" in edge:
                entities.add(str(edge["target"]).strip().upper())
        return entities

    @classmethod
    def extract_summary_entities(cls, summary_text: str) -> Set[str]:
        """Extract candidate entity identifiers mentioned in the LLM summary."""
        matches = cls.ENTITY_REGEX.findall(summary_text)
        return {m.strip().upper() for m in matches}

    @classmethod
    def verify(
        cls, summary_text: str, provenance: Dict[str, Any]
    ) -> Tuple[bool, List[str]]:
        """
        Verifies LLM summary against the provenance subgraph.
        Returns:
            (is_valid: bool, hallucinated_entities: List[str])
        """
        provenance_entities = cls.extract_provenance_entities(provenance)
        mentioned_entities = cls.extract_summary_entities(summary_text)

        # Ignore common non-entity uppercase tokens like USD, AML, SAR, JSON, HTTP, etc.
        whitelist = {
            "USD", "EUR", "GBP", "AML", "SAR", "JSON", "HTTP", "WCC", "ID",
            "CASE", "FLAGGED", "CLAIMED", "CHECKED", "FALKORDB", "CYPHER"
        }
        filtered_mentions = {e for e in mentioned_entities if e not in whitelist}

        # Any mentioned entity not in provenance is a hallucination
        hallucinated = [e for e in filtered_mentions if e not in provenance_entities]

        is_valid = len(hallucinated) == 0
        return is_valid, hallucinated
