"""
Ariadne FalkorDB Database Client
Handles connection pooling to FalkorDB Cloud or local instance.
"""
from typing import Optional
import time
import logging
try:
    from falkordb import FalkorDB
except ImportError:
    FalkorDB = None  # Graceful fallback when running standalone mocks or unit tests
from ariadne.config import settings

logger = logging.getLogger("ariadne.db")


class FalkorClient:
    _instance: Optional["FalkorClient"] = None

    def __init__(self):
        self.driver: Optional[FalkorDB] = None
        self.connect()

    def connect(self) -> None:
        """Initialize connection to FalkorDB (Cloud or Local)."""
        if FalkorDB is None:
            return
        
        # Don't hammer closed port repeatedly in the same second
        now = time.time()
        if hasattr(self, "_last_attempt") and (now - self._last_attempt) < 5.0 and self.driver is None:
            return
        self._last_attempt = now

        try:
            self.driver = FalkorDB(
                host=settings.FALKORDB_HOST,
                port=settings.FALKORDB_PORT,
                password=settings.FALKORDB_PASSWORD if settings.FALKORDB_PASSWORD else None,
                ssl=settings.FALKORDB_SSL,
                socket_timeout=1.0,
                socket_connect_timeout=1.0,
            )
            # Test ping
            self.driver.select_graph(settings.DEFAULT_TENANT_ID).query("RETURN 1")
            logger.info("FalkorDB connection established.")
        except Exception as e:
            self.driver = None


    def get_graph(self, graph_name: Optional[str] = None):
        """Retrieve a specific graph handle (defaults to tenant graph)."""
        if self.driver is None:
            self.connect()
        target_name = graph_name or settings.DEFAULT_TENANT_ID
        if self.driver:
            return self.driver.select_graph(target_name)
        
        # Standalone mock graph fallback for unit tests and offline testing
        class MockQueryResult:
            result_set = []
        class MockGraph:
            def query(self, *args, **kwargs):
                return MockQueryResult()
        return MockGraph()

    def ping(self) -> bool:
        """Check if FalkorDB connection is alive."""
        try:
            if not self.driver:
                return False
            # Simple query to test responsiveness
            g = self.get_graph(settings.DEFAULT_TENANT_ID)
            g.query("RETURN 1 AS ping")
            return True
        except Exception as e:
            logger.warning(f"FalkorDB ping failed: {e}")
            return False


# Global singleton
db_client = FalkorClient()
