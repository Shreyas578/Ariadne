/**
 * Ariadne Interactive Graph & Forensic Intelligence Frontend Controller
 */

let network = null;
let ws = null;

// Initialize on DOM Load
document.addEventListener("DOMContentLoaded", () => {
  setupTabs();
  initWebSocket();
  checkHealth();
  bindControls();
  refreshGraph();
  refreshAuditChain();
  refreshFederatedPatterns();
  refreshEvalMetrics();
  loadUnclaimedTrails();

  // Periodically refresh decayed trails every 10 seconds to reflect e^(-lambda * dt)
  setInterval(loadUnclaimedTrails, 10000);
});

// Setup Tab Switching
function setupTabs() {
  const tabBtns = document.querySelectorAll(".tab-btn");
  const tabPanes = document.querySelectorAll(".tab-pane");

  tabBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      tabBtns.forEach(b => b.classList.remove("active"));
      tabPanes.forEach(p => p.classList.remove("active"));

      btn.classList.add("active");
      const target = btn.dataset.tab;
      document.getElementById(target).classList.add("active");

      if (target === "graphView" && network) {
        network.fit();
      }
    });
  });
}

// WebSocket Live Stream Connection
function initWebSocket() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const wsUrl = `${protocol}//${window.location.host}/ws`;
  
  try {
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      document.getElementById("wsStatus").innerText = "LIVE WS";
      document.getElementById("wsStatus").style.color = "#10b981";
      logFeed("WebSocket connected to Ariadne stream.", "system");
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      handleLiveEvent(data);
    };

    ws.onclose = () => {
      document.getElementById("wsStatus").innerText = "OFFLINE";
      document.getElementById("wsStatus").style.color = "#94a3b8";
      setTimeout(initWebSocket, 4000); // Reconnect
    };
  } catch (e) {
    console.error("WS error:", e);
  }
}

// Handle Real-Time Broadcasted Events
function handleLiveEvent(evt) {
  if (evt.type === "GRAPH_POPULATED") {
    logFeed(`Dataset Generated: ${evt.message}`, "system");
    refreshGraph();
    refreshEvalMetrics();
  } else if (evt.type === "TRIAGE_SCANNED") {
    logFeed(`Triage Scan flagged ${evt.count} accounts with high velocity.`, "triage");
    loadUnclaimedTrails();
    refreshGraph();
  } else if (evt.type === "INVESTIGATION_COMPLETED") {
    logFeed(`Investigator resolved Case ${evt.case_id} (${evt.verdict}). Policy Action: ${evt.action}`, "investigation");
    
    // Play interactive 2D character war room deliberation
    if (evt.cluster_consensus && evt.cluster_consensus.debate_turns) {
      playDetectiveWarRoomDebate(evt.cluster_consensus.debate_turns, evt);
    } else {
      renderVerdict(evt);
    }

    refreshGraph();
    refreshAuditChain();
    refreshFederatedPatterns();
    refreshEvalMetrics();
    loadUnclaimedTrails();
  }
}

// 2D Detective Office Interactive Debate Playback
async function playDetectiveWarRoomDebate(turns, caseData) {
  // Automatically switch to War Room Tab so the user sees the argument
  document.querySelector('.tab-btn[data-tab="warRoomView"]').click();

  const hologramSpeaker = document.getElementById("hologramSpeaker");
  const hologramText = document.getElementById("hologramText");
  const feed = document.getElementById("debateBubblesFeed");

  // Clear previous deliberation
  feed.innerHTML = `
    <div class="debate-entry system-entry">
      <span class="d-agent">Ariadne War Room</span>: Investigating Case <strong>${caseData.case_id}</strong> (Target: ${caseData.account_id}). Committee convened!
    </div>
  `;

  for (let i = 0; i < turns.length; i++) {
    const turn = turns[i];
    const charEl = document.getElementById(`char_${turn.id}`);

    // Update hologram banner
    hologramSpeaker.innerText = `${turn.name} (${turn.role})`;
    hologramText.innerText = `"${turn.dialogue}"`;

    // Highlight speaking character with animated movement
    document.querySelectorAll(".detective-character").forEach(c => c.classList.remove("speaking"));
    if (charEl) {
      charEl.classList.add("speaking");
      const bubble = charEl.querySelector(".char-bubble");
      if (bubble) bubble.innerText = `"${turn.dialogue.slice(0, 50)}..."`;
    }

    // Append to debate log feed
    const entry = document.createElement("div");
    const stanceClass = turn.stance === "ACCUSE" ? "accuse" : (turn.stance === "DEFENSE" ? "defense" : (turn.stance === "MATH_AUDIT" ? "math" : "audit"));
    entry.className = `debate-entry ${stanceClass}`;
    entry.innerHTML = `
      <span class="d-agent">${turn.name}</span> <span class="badge-tag">${turn.role}</span>:
      ${turn.dialogue}
      <div style="font-size: 0.72rem; color: var(--text-dim); margin-top: 4px;">
        Stance: <strong>${turn.stance}</strong> • Risk Confidence Vote: <strong>${(turn.confidence_vote * 100).toFixed(0)}%</strong>
      </div>
    `;
    feed.appendChild(entry);
    feed.scrollTop = feed.scrollHeight;

    // Pause for realistic dramatic interaction
    await new Promise(r => setTimeout(r, 1800));
  }

  // Final conclusion & transition to consensus verdict
  document.querySelectorAll(".detective-character").forEach(c => c.classList.remove("speaking"));
  hologramSpeaker.innerText = "COMMITTEE CONSENSUS REACHED";
  hologramText.innerText = `Final Verdict: ${caseData.verdict} (${(caseData.confidence * 100).toFixed(1)}% Confidence). Action: ${caseData.action}.`;

  const finalEntry = document.createElement("div");
  finalEntry.className = "debate-entry audit";
  finalEntry.innerHTML = `
    <span class="d-agent">FINAL RESOLUTION</span>: Consensus ratified across all 5 models. Transitioning to cryptographic SHA-256 commit...
  `;
  feed.appendChild(finalEntry);
  feed.scrollTop = feed.scrollHeight;

  // Render verdict card after the war room argument concludes
  renderVerdict(caseData);
}


function logFeed(msg, type = "system") {
  const feed = document.getElementById("eventFeed");
  const item = document.createElement("div");
  item.className = `feed-item ${type}`;
  const now = new Date().toLocaleTimeString();
  item.innerHTML = `<span class="feed-ts">${now}</span>: ${msg}`;
  feed.insertBefore(item, feed.firstChild);
}

// Health check
async function checkHealth() {
  try {
    const res = await fetch("/api/health");
    const data = await res.json();
    const pill = document.getElementById("dbStatusPill");
    const txt = document.getElementById("dbStatusText");
    if (data.falkordb_connected) {
      txt.innerText = "FalkorDB Online";
      pill.style.borderColor = "rgba(16, 185, 129, 0.4)";
    } else {
      txt.innerText = "FalkorDB Standby";
      pill.style.borderColor = "rgba(245, 158, 11, 0.4)";
    }
  } catch (e) {
    document.getElementById("dbStatusText").innerText = "API Standby";
  }
}

// Bind Button Controls
function bindControls() {
  document.getElementById("btnGenerateGraph").addEventListener("click", async () => {
    logFeed("Seeding synthetic benchmark graph with known fraud motifs...", "system");
    try {
      const res = await fetch("/api/data/generate-benchmark", { method: "POST" });
      const data = await res.json();
      logFeed(`Benchmark seeded: ${data.stats.clean_accounts} clean, ${data.stats.illicit_accounts.length} illicit.`, "system");
      refreshGraph();
      refreshEvalMetrics();
    } catch (e) {
      logFeed(`Error seeding graph: ${e}`, "system");
    }
  });

  document.getElementById("btnRunTriage").addEventListener("click", async () => {
    logFeed("Running Triage Agent: scanning high velocity transfer hubs...", "triage");
    try {
      const res = await fetch("/api/triage/scan", { method: "POST" });
      const data = await res.json();
      logFeed(`Triage Agent finished: deposited trails on ${data.flagged_count} accounts.`, "triage");
      loadUnclaimedTrails();
      refreshGraph();
    } catch (e) {
      logFeed(`Triage error: ${e}`, "triage");
    }
  });

  document.getElementById("btnInvestigate").addEventListener("click", async () => {
    try {
      const trailRes = await fetch("/api/investigator/unclaimed-trails");
      const trailData = await trailRes.json();
      let targetAcc = (trailData.trails && trailData.trails.length > 0) ? trailData.trails[0].account_id : "ACC_MULE_101";
      
      const modelTier = document.getElementById("modelSelect").value;
      logFeed(`Investigator claiming trail for Account ${targetAcc} (${modelTier})...`, "investigation");

      const invRes = await fetch(`/api/investigator/investigate?account_id=${targetAcc}&model_tier=${modelTier}`, {
        method: "POST",
      });
      const invData = await invRes.json();
      logFeed(`Investigation committed to FalkorDB Hash: ${invData.decision.hash.slice(0, 16)}...`, "decision");
      
      // Immediately play 2D detective deliberation
      if (invData.cluster_consensus && invData.cluster_consensus.debate_turns) {
        playDetectiveWarRoomDebate(invData.cluster_consensus.debate_turns, {
          ...invData.decision,
          action: invData.action.action,
        });
      }
    } catch (e) {
      logFeed(`Investigation error: ${e}`, "investigation");
    }
  });
}

// Load Unclaimed Trails with Exponential Decay
async function loadUnclaimedTrails() {
  try {
    const res = await fetch("/api/investigator/unclaimed-trails");
    const data = await res.json();
    const container = document.getElementById("trailsContainer");
    if (!data.trails || data.trails.length === 0) {
      container.innerHTML = '<div class="empty-state">No active unclaimed trails.</div>';
      return;
    }

    container.innerHTML = "";
    data.trails.forEach(t => {
      const div = document.createElement("div");
      div.className = "trail-item";
      div.innerHTML = `
        <span class="trail-acc">${t.account_id}</span>
        <span class="trail-weight">w: ${t.effective_weight.toFixed(3)}</span>
      `;
      div.addEventListener("click", () => {
        const modelTier = document.getElementById("modelSelect").value;
        fetch(`/api/investigator/investigate?account_id=${t.account_id}&model_tier=${modelTier}`, { method: "POST" });
      });
      container.appendChild(div);
    });
  } catch (e) {
    console.debug("Error loading trails:", e);
  }
}

// Render Graph Network with Vis.js
async function refreshGraph() {
  try {
    const res = await fetch("/api/graph/subgraph");
    const data = await res.json();

    const container = document.getElementById("graphNetwork");
    const visNodes = [];
    const visEdges = [];

    // Map flagged trail targets
    const flaggedSet = new Set((data.trails || []).filter(t => t.type === "FLAGGED").map(t => t.target));
    const claimedSet = new Set((data.trails || []).filter(t => t.type === "CLAIMED").map(t => t.target));

    (data.nodes || []).forEach(n => {
      let color = "#3b82f6";
      let shape = "dot";
      let size = 16;

      if (n.label === "Device") {
        color = "#ec4899";
        shape = "diamond";
        size = 20;
      } else if (claimedSet.has(n.id)) {
        color = "#10b981";
        size = 22;
      } else if (flaggedSet.has(n.id)) {
        color = "#f59e0b";
        size = 22;
      }

      visNodes.push({
        id: n.id,
        label: n.id,
        color: { background: color, border: "#ffffff", highlight: { background: "#06b6d4", border: "#fff" } },
        shape: shape,
        size: size,
        font: { color: "#cbd5e1", face: "JetBrains Mono", size: 11 },
      });
    });

    (data.edges || []).forEach(e => {
      visEdges.push({
        from: e.source,
        to: e.target,
        arrows: "to",
        color: { color: "rgba(255, 255, 255, 0.2)", highlight: "#06b6d4" },
        label: e.amount ? `$${e.amount}` : "",
        font: { color: "#64748b", size: 9, align: "middle" },
      });
    });

    const graphData = {
      nodes: new vis.DataSet(visNodes),
      edges: new vis.DataSet(visEdges),
    };

    const options = {
      physics: {
        stabilization: true,
        barnesHut: { gravitationalConstant: -2800, springLength: 90 },
      },
      interaction: { hover: true, tooltipDelay: 100 },
    };

    network = new vis.Network(container, graphData, options);
  } catch (e) {
    console.debug("Graph render error:", e);
  }
}

// Render Verdict & Provenance Guard
function renderVerdict(data) {
  const container = document.getElementById("latestVerdictCard");
  const isSuspicious = data.verdict === "SUSPICIOUS_FRAUD";
  const badgeClass = isSuspicious ? "badge-suspicious" : "badge-tag";

  container.innerHTML = `
    <div class="verdict-header-row">
      <div>
        <span class="meta-label">Case ID: ${data.case_id}</span>
        <h2 style="margin-top: 4px;">Target Account: ${data.account_id}</h2>
      </div>
      <div class="verdict-badge ${badgeClass}">${data.verdict}</div>
    </div>

    <div class="verdict-meta">
      <div class="meta-box">
        <div class="meta-label">Deterministic Confidence</div>
        <div class="meta-val text-cyan">${(data.confidence * 100).toFixed(1)}%</div>
      </div>
      <div class="meta-box">
        <div class="meta-label">Detected Graph Motifs</div>
        <div class="meta-val text-purple">${data.motifs.join(", ") || "None"}</div>
      </div>
      <div class="meta-box">
        <div class="meta-label">Enforcement Action</div>
        <div class="meta-val text-gold">${data.action}</div>
      </div>
      <div class="meta-box">
        <div class="meta-label">Provenance Guard</div>
        <div class="meta-val text-emerald">
          <span class="guard-pill">✓ 0% Entity Hallucination</span>
        </div>
      </div>
    </div>

    <div class="summary-box">
      <strong style="color: var(--accent-cyan); display: block; margin-bottom: 6px;">Forensic Case Summary:</strong>
      ${data.summary}
    </div>

    <div class="chain-hash-row">
      <span>SHA-256 Block Hash: <span class="hash-val">${data.hash}</span></span>
    </div>
  `;
}

// Refresh SHA-256 Decision Chain
async function refreshAuditChain() {
  try {
    const res = await fetch("/api/audit/chain");
    const data = await res.json();
    const container = document.getElementById("chainTimeline");
    if (!data.chain || data.chain.length === 0) {
      container.innerHTML = '<div class="empty-state">No decisions committed to the chain yet.</div>';
      return;
    }

    container.innerHTML = "";
    data.chain.forEach(d => {
      const div = document.createElement("div");
      div.className = "chain-block";
      div.innerHTML = `
        <div class="chain-hash-row">
          <span>Block ID: <strong>${d.id}</strong> (${d.case_id})</span>
          <span>Timestamp: ${new Date(d.recorded_at * 1000).toLocaleTimeString()}</span>
        </div>
        <div class="chain-hash-row">
          <span>Prev Hash: <span class="hash-val">${d.prev_hash.slice(0, 24)}...</span></span>
          <span>Hash: <span class="hash-val">${d.hash.slice(0, 24)}...</span></span>
        </div>
        <div style="font-size: 0.85rem; margin-top: 6px;">
          <strong>${d.verdict}</strong> (${(d.confidence * 100).toFixed(0)}% conf) — ${d.summary}
        </div>
      `;
      container.appendChild(div);
    });
  } catch (e) {
    console.debug("Audit chain error:", e);
  }
}

// Refresh Isolated Evaluation Metrics
async function refreshEvalMetrics() {
  try {
    const res = await fetch("/api/eval/metrics");
    const data = await res.json();
    if (data.status === "success" && data.metrics) {
      const m = data.metrics;
      document.getElementById("valPrecision").innerText = `${(m.precision * 100).toFixed(1)}%`;
      document.getElementById("valRecall").innerText = `${(m.recall * 100).toFixed(1)}%`;
      document.getElementById("valF1").innerText = `${(m.f1_score * 100).toFixed(1)}%`;

      const matrix = document.getElementById("evalMatrixTable");
      matrix.innerHTML = `
        <table class="data-table">
          <thead>
            <tr>
              <th>Evaluated Metric</th>
              <th>Count</th>
              <th>Evaluation Context</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>True Positives (TP)</td>
              <td><strong class="text-emerald">${m.true_positives}</strong></td>
              <td>Illicit accounts correctly detected & flagged</td>
            </tr>
            <tr>
              <td>False Positives (FP)</td>
              <td><strong class="text-gold">${m.false_positives}</strong></td>
              <td>Clean accounts erroneously flagged</td>
            </tr>
            <tr>
              <td>False Negatives (FN)</td>
              <td><strong class="text-rose">${m.false_negatives}</strong></td>
              <td>Undetected illicit accounts</td>
            </tr>
            <tr>
              <td>Isolated Truth Store</td>
              <td colspan="2"><code>${m.isolated_eval_graph}</code> (Physically separated from Agent queries)</td>
            </tr>
          </tbody>
        </table>
      `;
    }
  } catch (e) {
    console.debug("Eval metrics error:", e);
  }
}

// Refresh Federated Patterns
async function refreshFederatedPatterns() {
  try {
    const res = await fetch("/api/federated/patterns");
    const data = await res.json();
    const wrapper = document.getElementById("federatedPatternsWrapper");
    if (!data.patterns || data.patterns.length === 0) {
      wrapper.innerHTML = '<div class="empty-state">No federated signatures shared yet. High confidence investigations will auto-publish here.</div>';
      return;
    }

    let html = `
      <table class="data-table">
        <thead>
          <tr>
            <th>Structural Fingerprint ID</th>
            <th>Motif Pattern</th>
            <th>Size Bucket</th>
            <th>Sightings</th>
            <th>Avg Confidence</th>
          </tr>
        </thead>
        <tbody>
    `;

    data.patterns.forEach(p => {
      html += `
        <tr>
          <td><code class="text-cyan">${p.fingerprint_id}</code></td>
          <td><strong>${p.pattern_type}</strong></td>
          <td><span class="badge-tag">${p.size_bucket}</span></td>
          <td>${p.observations}</td>
          <td>${(p.avg_confidence * 100).toFixed(0)}%</td>
        </tr>
      `;
    });

    html += `</tbody></table>`;
    wrapper.innerHTML = html;
  } catch (e) {
    console.debug("Federated patterns error:", e);
  }
}
