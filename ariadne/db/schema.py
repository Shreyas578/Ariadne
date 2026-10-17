"""
Ariadne Graph Schema Initializer
Creates mandatory indices and constraints in FalkorDB.
"""
import logging
from ariadne.db.client import db_client
from ariadne.config import settings

logger = logging.getLogger("ariadne.schema")

# Indices to create on each tenant graph
TENANT_INDICES = [
    "CREATE INDEX FOR (a:Account) ON (a.id)",
    "CREATE INDEX FOR (a:Account) ON (a.bank)",
    "CREATE INDEX FOR (d:Device) ON (d.id)",
    "CREATE INDEX FOR (c:Card) ON (c.id)",
    "CREATE INDEX FOR (m:Merchant) ON (m.id)",
    "CREATE INDEX FOR (ag:Agent) ON (ag.id)",
    "CREATE INDEX FOR (cs:Case) ON (cs.id)",
    "CREATE INDEX FOR (cs:Case) ON (cs.status)",
    "CREATE INDEX FOR (f:Fact) ON (f.id)",
    "CREATE INDEX FOR (f:Fact) ON (f.subject_id)",
    "CREATE INDEX FOR (pt:PatternType) ON (pt.name)",
    "CREATE INDEX FOR (pb:Playbook) ON (pb.id)",
    "CREATE INDEX FOR (dec:Decision) ON (dec.id)",
    "CREATE INDEX FOR (dec:Decision) ON (dec.hash)",
    "CREATE INDEX FOR (dec:Decision) ON (dec.case_id)",
]

# Shared pattern graph indices
SHARED_INDICES = [
    "CREATE INDEX FOR (fp:Fingerprint) ON (fp.pattern_type)",
    "CREATE INDEX FOR (fp:Fingerprint) ON (fp.size_bucket)",
]


def init_tenant_schema(graph_name: str = settings.DEFAULT_TENANT_ID) -> None:
    """Initialize indices on the tenant graph."""
    graph = db_client.get_graph(graph_name)
    logger.info(f"Initializing schema indices for graph '{graph_name}'...")
    for idx_stmt in TENANT_INDICES:
        try:
            graph.query(idx_stmt)
            logger.debug(f"Applied index: {idx_stmt}")
        except Exception as e:
            # Index might already exist
            logger.debug(f"Index statement '{idx_stmt}' response: {e}")
    logger.info(f"Schema initialization for '{graph_name}' complete.")


def init_shared_schema(graph_name: str = settings.SHARED_PATTERNS_GRAPH) -> None:
    """Initialize indices on the privacy-preserving shared graph."""
    graph = db_client.get_graph(graph_name)
    logger.info(f"Initializing shared pattern schema for '{graph_name}'...")
    for idx_stmt in SHARED_INDICES:
        try:
            graph.query(idx_stmt)
        except Exception as e:
            logger.debug(f"Index statement '{idx_stmt}' response: {e}")
    logger.info(f"Shared schema for '{graph_name}' complete.")


def init_all_schemas():
    """Initializes tenant and shared schemas."""
    init_tenant_schema(settings.DEFAULT_TENANT_ID)
    init_shared_schema(settings.SHARED_PATTERNS_GRAPH)
