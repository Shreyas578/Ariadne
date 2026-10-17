"""
Ariadne FastAPI Server & WebSocket Event Stream
Exposes endpoints for Stigmergy, Triage, Investigation, Federated Pattern Sharing,
Decision Hash Chains, and Live Evaluation Metrics.
"""
import asyncio
import logging
from typing import Dict, Any, List, Optional
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import uvicorn
import os

from ariadne.config import settings
from ariadne.db.client import db_client
from ariadne.db.schema import init_all_schemas
from ariadne.agents.triage import TriageAgent
from ariadne.agents.investigator import InvestigatorAgent
from ariadne.agents.actor import ActorAgent
from ariadne.agents.memory_writer import MemoryWriter
from ariadne.data.synthetic import SyntheticGraphGenerator
from ariadne.data.federated import PatternPublisher
from ariadne.evaluator import GroundTruthEvaluator

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ariadne.server")

app = FastAPI(
    title="Ariadne Financial Crimes Graph Intelligence",
    description="FalkorDB native stigmergic multi-agent AML investigation system",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Active WebSocket connections for real-time live events
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: Dict[str, Any]):
        for connection in list(self.active_connections):
            try:
                await connection.send_json(message)
            except Exception:
                self.disconnect(connection)

manager = ConnectionManager()


# --- Lifecycle Events ---
@app.on_event("startup")
async def startup_event():
    try:
        if db_client.ping():
            logger.info("Connected to FalkorDB successfully. Initializing schemas...")
            init_all_schemas()
        else:
            logger.warning("FalkorDB is currently offline or unreachable. Will retry on demand.")
    except Exception as e:
        logger.warning(f"Startup schema init skipped: {e}")


# --- Health & DB Ping ---
@app.get("/api/health")
async def health_check():
    falkor_alive = db_client.ping()
    return {
        "status": "online" if falkor_alive else "degraded",
        "falkordb_connected": falkor_alive,
        "tenant_id": settings.DEFAULT_TENANT_ID,
        "shared_graph": settings.SHARED_PATTERNS_GRAPH,
        "eval_truth_graph": settings.EVAL_TRUTH_GRAPH,
    }


# --- Benchmark Dataset Generation ---
@app.post("/api/data/generate-benchmark")
async def generate_benchmark(
    num_accounts: int = 40,
    num_transactions: int = 120,
    inject_fraud: bool = True,
):
    try:
        generator = SyntheticGraphGenerator()
        stats = generator.generate_benchmark_graph(
            num_clean_accounts=num_accounts,
            num_clean_txs=num_transactions,
            inject_fraud_motifs=inject_fraud,
        )
        await manager.broadcast({
            "type": "GRAPH_POPULATED",
            "details": stats,
            "message": f"Generated benchmark graph with {len(stats['illicit_accounts'])} injected fraud entities.",
        })
        return {"status": "success", "stats": stats}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# --- Triage Agent Endpoints ---
@app.post("/api/triage/scan")
async def run_triage_scan(min_txs: int = 3):
    """
    Executes Triage Agent: scans high velocity nodes and deposits decaying pheromone trails.
    """
    triage = TriageAgent()
    flagged = triage.scan_high_velocity_accounts(min_transactions=min_txs)
    await manager.broadcast({
        "type": "TRIAGE_SCANNED",
        "flagged_accounts": flagged,
        "count": len(flagged),
    })
    return {"status": "success", "flagged_count": len(flagged), "flagged_accounts": flagged}


# --- Investigator Agent Endpoints ---
@app.get("/api/investigator/unclaimed-trails")
async def get_unclaimed_trails():
    """
    Returns high-priority trails using pure Cypher read-time exponential decay.
    """
    investigator = InvestigatorAgent()
    trails = investigator.find_unclaimed_trails(min_effective_weight=0.1)
    return {"status": "success", "trails": trails}


@app.post("/api/investigator/investigate")
async def investigate_account(
    account_id: str,
    case_id: Optional[str] = None,
    model_tier: str = "llama-3.3-70b",
):
    """
    Runs Investigator Agent on an account:
    - Claims trail
    - Motif matching (Cycles, Sybil rings, etc.)
    - Multi-model forensic summary with Provenance Guard
    - Tamper-evident Decision hash chain commit via MemoryWriter
    - Simulated Actor action policy
    - Privacy-preserving pattern broadcast
    """
    investigator = InvestigatorAgent()
    actor = ActorAgent()
    publisher = PatternPublisher()
    
    cid = case_id or f"CASE_{account_id}_{int(asyncio.get_event_loop().time() * 1000)}"

    decision = await investigator.investigate_case(
        case_id=cid,
        seed_account_id=account_id,
        model_tier=model_tier,
    )

    action_res = actor.execute_policy(decision)

    # Publish anonymized structural motif to shared_patterns if confidence is high
    published_fp = None
    if decision["motifs"] and decision["confidence"] >= 0.70:
        for m in decision["motifs"]:
            published_fp = publisher.publish_motif_signature(
                motif_type=m,
                provenance=decision["provenance"],
                confidence=decision["confidence"],
            )

    event_payload = {
        "type": "INVESTIGATION_COMPLETED",
        "case_id": cid,
        "account_id": account_id,
        "verdict": decision["verdict"],
        "confidence": decision["confidence"],
        "motifs": decision["motifs"],
        "summary": decision["summary"],
        "hash": decision["hash"],
        "prev_hash": decision["prev_hash"],
        "action": action_res["action"],
        "action_rationale": action_res["rationale"],
        "anti_hallucination_passed": decision["anti_hallucination_passed"],
        "cluster_consensus": decision.get("cluster_consensus"),
        "federated_fingerprint": published_fp,
    }
    await manager.broadcast(event_payload)
    return {
        "decision": decision,
        "action": action_res,
        "federated_signature": published_fp,
        "cluster_consensus": decision.get("cluster_consensus"),
    }



# --- Decision Hash Chain Audit ---
@app.get("/api/audit/chain")
async def get_audit_chain(limit: int = 20):
    """
    Verifies and returns the cryptographic SHA-256 Decision hash chain from FalkorDB.
    """
    graph = db_client.get_graph(settings.DEFAULT_TENANT_ID)
    cypher = """
    MATCH (d:Decision)
    OPTIONAL MATCH (d)-[:PREV]->(p:Decision)
    RETURN d.id, d.case_id, d.verdict, d.confidence, d.summary, d.hash, d.prev_hash, d.recorded_at, p.id AS prev_id
    ORDER BY d.recorded_at DESC
    LIMIT $limit
    """
    chain = []
    try:
        res = graph.query(cypher, {"limit": limit})
        if res.result_set:
            for row in res.result_set:
                chain.append({
                    "id": row[0],
                    "case_id": row[1],
                    "verdict": row[2],
                    "confidence": row[3],
                    "summary": row[4],
                    "hash": row[5],
                    "prev_hash": row[6],
                    "recorded_at": row[7],
                    "prev_id": row[8],
                })
    except Exception as e:
        logger.error(f"Error reading decision chain: {e}")
    return {"status": "success", "chain": chain, "length": len(chain)}


# --- Federated Threat Intelligence ---
@app.get("/api/federated/patterns")
async def get_federated_patterns():
    """
    Fetches cross-institutional structural threat fingerprints from shared_patterns.
    """
    publisher = PatternPublisher()
    patterns = publisher.fetch_shared_threat_intelligence()
    return {"status": "success", "patterns": patterns}


# --- Isolated Ground Truth Evaluation ---
@app.get("/api/eval/metrics")
async def get_ground_truth_metrics():
    """
    Computes live unbiased evaluation metrics (Precision, Recall, F1) against eval_truth graph.
    """
    evaluator = GroundTruthEvaluator()
    metrics = evaluator.evaluate_decisions()
    return {"status": "success", "metrics": metrics}


# --- Graph Visualization Subgraph ---
@app.get("/api/graph/subgraph")
async def get_graph_subgraph(account_id: Optional[str] = None):
    """
    Fetches nodes, edges, and active stigmergic trails for interactive UI visualization.
    """
    graph = db_client.get_graph(settings.DEFAULT_TENANT_ID)
    now_ts = asyncio.get_event_loop().time()
    
    # Fetch accounts & devices
    nodes = []
    edges = []

    try:
        # Accounts
        acc_res = graph.query("MATCH (a:Account) RETURN a.id, a.bank, a.balance LIMIT 60")
        if acc_res.result_set:
            for row in acc_res.result_set:
                nodes.append({"id": row[0], "label": "Account", "bank": row[1], "balance": row[2]})

        # Devices
        dev_res = graph.query("MATCH (d:Device) RETURN d.id LIMIT 20")
        if dev_res.result_set:
            for row in dev_res.result_set:
                nodes.append({"id": row[0], "label": "Device"})

        # Transfers
        tx_res = graph.query("MATCH (s:Account)-[r:TRANSFERRED]->(d:Account) RETURN s.id, d.id, r.amount LIMIT 150")
        if tx_res.result_set:
            for row in tx_res.result_set:
                edges.append({"source": row[0], "target": row[1], "type": "TRANSFERRED", "amount": row[2]})

        # Uses Device
        uses_res = graph.query("MATCH (a:Account)-[r:USES]->(d:Device) RETURN a.id, d.id LIMIT 50")
        if uses_res.result_set:
            for row in uses_res.result_set:
                edges.append({"source": row[0], "target": row[1], "type": "USES"})

        # Stigmergic Trails with decay
        trail_query = """
        MATCH (ag:Agent)-[r:TRAIL]->(e)
        RETURN ag.id, e.id, r.type, r.weight, r.last_reinforced
        """
        trail_res = graph.query(trail_query)
        trails = []
        if trail_res.result_set:
            for row in trail_res.result_set:
                trails.append({
                    "agent": row[0],
                    "target": row[1],
                    "type": row[2],
                    "weight": row[3],
                    "last_reinforced": row[4],
                })

        return {"nodes": nodes, "edges": edges, "trails": trails}
    except Exception as e:
        logger.error(f"Error fetching subgraph: {e}")
        return {"nodes": [], "edges": [], "trails": [], "error": str(e)}


# --- WebSocket Streaming ---
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            # Keep connection alive & handle incoming client messages
            data = await websocket.receive_text()
            # Echo or ping/pong
            await websocket.send_json({"type": "PONG", "data": data})
    except WebSocketDisconnect:
        manager.disconnect(websocket)


# Serve Static UI if built
static_dir = os.path.join(os.path.dirname(__file__), "..", "static")
if os.path.exists(static_dir):
    app.mount("/static", StaticFiles(directory=static_dir), name="static")

@app.get("/")
async def serve_index():
    index_path = os.path.join(static_dir, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return {"message": "Ariadne API is live. Static UI will be served from /static/index.html"}


if __name__ == "__main__":
    uvicorn.run("ariadne.server:app", host=settings.HOST, port=settings.PORT, reload=True)
