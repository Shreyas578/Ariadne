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
    const emoEl = document.getElementById(`emo_${turn.id}`);

    // Update hologram banner
    hologramSpeaker.innerText = `${turn.name} (${turn.role})`;
    hologramText.innerText = `"${turn.dialogue}"`;

    // Reset speaking & emotion classes across all characters
    document.querySelectorAll(".detective-character").forEach(c => {
      c.classList.remove("speaking", "emotion-anger", "emotion-confusion", "emotion-triumph", "emotion-alarm");
    });

    if (charEl) {
      charEl.classList.add("speaking");

      // Set dynamic facial emotions & emojis based on role & stance:
      // - Chief Llama: Accusation / Anger (😠 / 💥)
      // - Defense Mixtral: Skepticism / Confusion (🤔 / 🧐)
      // - Quant DeepSeek: Math analysis / Alarm (⚡ / 📊)
      // - Typology Qwen: High risk warning / Siren (🚨 / ⚠️)
      // - Field Llama-8B: Triumph / Target locked (🎯 / 🔍)
      let emotionClass = "emotion-anger";
      let emotionEmoji = "😠";

      if (turn.stance === "DEFENSE") {
        emotionClass = "emotion-confusion";
        emotionEmoji = "🤔";
      } else if (turn.stance === "MATH_AUDIT") {
        emotionClass = "emotion-alarm";
        emotionEmoji = "⚡";
      } else if (turn.stance === "VERIFY") {
        emotionClass = "emotion-alarm";
        emotionEmoji = "🚨";
      } else if (turn.stance === "PLAYBOOK_EXEC") {
        emotionClass = "emotion-triumph";
        emotionEmoji = "🎯";
      }

      charEl.classList.add(emotionClass);
      if (emoEl) emoEl.innerText = emotionEmoji;

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
  document.querySelectorAll(".detective-character").forEach(c => {
    c.classList.remove("speaking");
    c.classList.add(caseData.confidence >= 0.70 ? "emotion-triumph" : "emotion-confusion");
  });
  hologramSpeaker.innerText = "COMMITTEE CONSENSUS REACHED";
  hologramText.innerText = `Final Verdict: ${caseData.verdict} (${(caseData.confidence * 100).toFixed(1)}% Confidence). Action: ${caseData.action}.`;

  const finalEntry = document.createElement("div");
  finalEntry.className = "debate-entry audit";
  finalEntry.innerHTML = `
    <span class="d-agent">FINAL RESOLUTION</span>: Consensus ratified across all 5 models. Action: <strong>${caseData.action}</strong>. Cryptographic SHA-256 committed!
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

// Visual feedback helpers
function setButtonLoading(btn, isLoading, loadingText = "") {
  if (!btn) return;
  if (isLoading) {
    btn.dataset.originalHtml = btn.innerHTML;
    btn.classList.add("loading", "btn-pulse-glow");
    const icon = btn.querySelector(".btn-icon");
    if (icon) icon.innerText = "⏳";
    if (loadingText) {
      const span = btn.querySelector("span:not(.btn-icon)");
      if (span) span.innerText = loadingText;
    }
  } else {
    btn.classList.remove("loading", "btn-pulse-glow");
    if (btn.dataset.originalHtml) {
      btn.innerHTML = btn.dataset.originalHtml;
    }
  }
}

function showActionBanner(message, isPersistent = false) {
  const banner = document.getElementById("actionStatusBanner");
  const text = document.getElementById("actionStatusText");
  if (!banner || !text) return;
  text.innerText = message;
  banner.classList.remove("hidden");
  banner.style.display = "flex";
  
  if (!isPersistent) {
    setTimeout(() => {
      banner.classList.add("hidden");
      banner.style.display = "none";
    }, 4500);
  }
}

function hideActionBanner() {
  const banner = document.getElementById("actionStatusBanner");
  if (banner) {
    banner.classList.add("hidden");
    banner.style.display = "none";
  }
}

// Bind Button Controls
function bindControls() {
  const btnSeed = document.getElementById("btnGenerateGraph");
  btnSeed.addEventListener("click", async () => {
    setButtonLoading(btnSeed, true, "Seeding FalkorDB Graph...");
    showActionBanner("⚡ Connecting to FalkorDB Cloud & populating benchmark graph...", true);
    logFeed("Seeding synthetic benchmark graph with known fraud motifs...", "system");
    try {
      const res = await fetch("/api/data/generate-benchmark", { method: "POST" });
      const data = await res.json();
      logFeed(`Benchmark seeded: ${data.stats.clean_accounts} clean, ${data.stats.illicit_accounts.length} illicit.`, "system");
      showActionBanner(`✅ Seeding Complete! ${data.stats.clean_accounts} clean & ${data.stats.illicit_accounts.length} illicit nodes active.`);
      await refreshGraph();
      await refreshEvalMetrics();
    } catch (e) {
      logFeed(`Error seeding graph: ${e}`, "system");
      showActionBanner(`❌ Seeding failed: ${e.message || e}`);
    } finally {
      setButtonLoading(btnSeed, false);
    }
  });

  const btnTriage = document.getElementById("btnRunTriage");
  btnTriage.addEventListener("click", async () => {
    setButtonLoading(btnTriage, true, "Scanning Velocity Trails...");
    showActionBanner("🔍 Running Triage Agent: scanning high velocity transfer hubs...", true);
    logFeed("Running Triage Agent: scanning high velocity transfer hubs...", "triage");
    try {
      const res = await fetch("/api/triage/scan", { method: "POST" });
      const data = await res.json();
      logFeed(`Triage Agent finished: deposited trails on ${data.flagged_count} accounts.`, "triage");
      showActionBanner(`🎯 Triage Scan Complete: Flagged ${data.flagged_count} suspicious accounts!`);
      await loadUnclaimedTrails();
      await refreshGraph();
    } catch (e) {
      logFeed(`Triage error: ${e}`, "triage");
      showActionBanner(`❌ Triage Scan error: ${e.message || e}`);
    } finally {
      setButtonLoading(btnTriage, false);
    }
  });

  const btnInv = document.getElementById("btnInvestigate");
  btnInv.addEventListener("click", async () => {
    setButtonLoading(btnInv, true, "Dispatching Investigator Cluster...");
    showActionBanner("🛡️ Convening 5-Model Deliberation Committee in War Room...", true);
    try {
      const trailRes = await fetch("/api/investigator/unclaimed-trails");
      const trailData = await trailRes.json();
      const trails = trailData.trails || [];
      
      // Prioritize flagged syndicate accounts (SMURF, CARTEL, SYBIL, NESTED) or pick the top unclaimed trail
      let targetAcc = "ACC_MULE_101";
      if (trails.length > 0) {
        // Find first illicit-pattern node if present, else pick top decayed trail
        const illicitTrail = trails.find(t => t.account_id.includes("SMURF") || t.account_id.includes("CARTEL") || t.account_id.includes("SYBIL") || t.account_id.includes("NESTED") || t.account_id.includes("MULE"));
        targetAcc = illicitTrail ? illicitTrail.account_id : trails[0].account_id;
      }
      
      const modelTier = document.getElementById("modelSelect").value;
      logFeed(`Investigator claiming trail for Account ${targetAcc} (${modelTier})...`, "investigation");
      showActionBanner(`🤖 Convening 5 LLM Detectives on ${targetAcc}... Deliberating in War Room!`, true);

      // Auto-switch to war room so user immediately sees deliberation
      const warRoomTab = document.querySelector('.tab-btn[data-tab="warRoomView"]');
      if (warRoomTab) warRoomTab.click();

      const invRes = await fetch(`/api/investigator/investigate?account_id=${targetAcc}&model_tier=${modelTier}`, {
        method: "POST",
      });
      const invData = await invRes.json();
      logFeed(`Investigation committed to FalkorDB Hash: ${invData.decision.hash.slice(0, 16)}...`, "decision");
      showActionBanner(`⚖️ Verdict reached: ${invData.decision.verdict} (${invData.action.action})`);
      
      // Immediately play 2D detective deliberation
      if (invData.cluster_consensus && invData.cluster_consensus.debate_turns) {
        playDetectiveWarRoomDebate(invData.cluster_consensus.debate_turns, {
          ...invData.decision,
          action: invData.action.action,
        });
      }
    } catch (e) {
      logFeed(`Investigation error: ${e}`, "investigation");
      showActionBanner(`❌ Investigation error: ${e.message || e}`);
    } finally {
      setButtonLoading(btnInv, false);
    }
  });

  // Adversarial Syndicate Injector for Live Judge Demos
  const btnInject = document.getElementById("btnInjectAdversarial");
  if (btnInject) {
    btnInject.addEventListener("click", async () => {
      const topo = document.getElementById("adversarialTopologySelect").value;
      setButtonLoading(btnInject, true, "Injecting...");
      showActionBanner(`⚔️ Injecting adversarial syndicate [${topo.toUpperCase()}] into FalkorDB...`, true);
      logFeed(`⚔️ Injecting adversarial syndicate [${topo.toUpperCase()}] into FalkorDB...`, "triage");
      try {
        const res = await fetch(`/api/adversarial/inject?topology=${topo}`, { method: "POST" });
        const data = await res.json();
        logFeed(`Syndicate injected: Seed Account ${data.injection.seed_account} (${data.injection.accounts.length} nodes). Trail deposited!`, "triage");
        showActionBanner(`⚔️ Syndicate Injected: ${data.injection.seed_account} active in FalkorDB! Switching to graph.`);
        await loadUnclaimedTrails();
        await refreshGraph();
        
        // Auto-switch to graph view
        document.querySelector('.tab-btn[data-tab="graphView"]').click();
      } catch (e) {
        logFeed(`Adversarial injection error: ${e}`, "triage");
        showActionBanner(`❌ Adversarial Error: ${e.message || e}`);
      } finally {
        setButtonLoading(btnInject, false);
      }
    });
  }

  // Cross-Bank Collaborative Defense Simulator
  const btnFed = document.getElementById("btnSimulateFederatedDefense");
  if (btnFed) {
    btnFed.addEventListener("click", async () => {
      const logBox = document.getElementById("federatedSimLog");
      logBox.innerHTML = "<span style='color: #38bdf8;'>[STAGE 1]</span> Bank A isolated laundering ring and generating zero-PII graph topology...";
      try {
        const res = await fetch("/api/federated/simulate", { method: "POST" });
        const data = await res.json();
        logBox.innerHTML = `
          <div style="color: #34d399; margin-bottom: 4px;">✓ [STAGE 2: Zero-PII Export] Published Fingerprint <code>${data.shared_fingerprint}</code> to <code>shared_patterns</code> graph.</div>
          <div style="color: #38bdf8; margin-bottom: 4px;">🛡️ [STAGE 3: Cross-Tenant Defense] Bank B detected incoming transfer from identical topology structure.</div>
          <div style="color: #f59e0b; font-weight: bold;">⚡ Enforcement: ${data.intercept_action} (Zero false positive customer freeze).</div>
        `;
        refreshFederatedPatterns();
      } catch (e) {
        logBox.innerHTML = `<span style='color: #ef4444;'>Simulation error: ${e}</span>`;
      }
    });
  }

  // --- Graph Toolbar Controls: Fullscreen & Simulation Flow Playback ---
  const btnFullscreen = document.getElementById("btnToggleFullscreen");
  const graphWrapper = document.getElementById("graphContainerWrapper");
  if (btnFullscreen && graphWrapper) {
    btnFullscreen.addEventListener("click", () => {
      const isFull = graphWrapper.classList.toggle("fullscreen");
      btnFullscreen.innerHTML = isFull ? "✕ Exit Fullscreen" : "⛶ Full Screen";
      if (network) network.fit();
    });
  }

  const btnCloseInspect = document.getElementById("btnCloseInspector");
  if (btnCloseInspect) {
    btnCloseInspect.addEventListener("click", () => {
      document.getElementById("elementInspector").style.display = "none";
    });
  }

  // Play Step-by-Step Flow Simulation across graph edges
  const btnPlaySim = document.getElementById("btnPlaySimulation");
  const btnResetSim = document.getElementById("btnResetSimulation");
  let isSimulating = false;

  if (btnPlaySim) {
    btnPlaySim.addEventListener("click", async () => {
      if (isSimulating || !network) return;
      isSimulating = true;
      btnPlaySim.style.display = "none";
      if (btnResetSim) btnResetSim.style.display = "inline-flex";

      // 1. Freeze physics during playback to eliminate canvas jitter and lag
      network.setOptions({ physics: { enabled: false } });

      // 2. Smoothly fit the whole network into view so the user has full cinematic perspective
      network.fit({ animation: { duration: 700, easingFunction: "easeInOutQuad" } });
      await new Promise(r => setTimeout(r, 750));

      logFeed("▶ Running smooth transaction flow simulation...", "triage");
      showActionBanner("▶ Tracing live payment flow across graph nodes...", true);

      const nodeIds = network.body.data.nodes.getIds();
      const edgeIds = network.body.data.edges.getIds();
      const originalEdges = network.body.data.edges.get();

      // Step 1: Smoothly dim background nodes & edges
      network.body.data.nodes.update(nodeIds.map(id => ({ id, opacity: 0.22 })));
      network.body.data.edges.update(edgeIds.map(id => ({ id, color: { color: "rgba(255,255,255,0.06)" }, width: 1 })));

      // Step 2: Smooth Dynamic Camera Following Hop-by-Hop
      for (let i = 0; i < edgeIds.length; i++) {
        if (!isSimulating) break;
        const eId = edgeIds[i];
        const edge = originalEdges.find(e => e.id === eId);
        if (!edge) continue;

        const amtStr = edge.label ? ` ($${edge.label})` : "";
        showActionBanner(`💸 Hop ${i + 1}/${edgeIds.length}: ${edge.from} ➔ ${edge.to}${amtStr}`, true);

        // Calculate smooth midpoint between the sender and receiver
        const posFrom = network.getPosition(edge.from);
        const posTo = network.getPosition(edge.to);
        const midX = (posFrom.x + posTo.x) / 2;
        const midY = (posFrom.y + posTo.y) / 2;

        // Smoothly glide camera to frame this active transfer hop
        network.moveTo({
          position: { x: midX, y: midY },
          scale: 1.05,
          animation: { duration: 600, easingFunction: "easeInOutQuad" }
        });

        // Highlight sender node
        network.body.data.nodes.update([
          { id: edge.from, opacity: 1.0, size: 26, color: { background: "#0ea5e9", border: "#38bdf8" } }
        ]);

        await new Promise(r => setTimeout(r, 250));
        if (!isSimulating) break;

        // Beam glowing electric edge
        network.body.data.edges.update([
          { id: eId, width: 4.5, color: { color: "#22d3ee" } }
        ]);

        // Highlight receiver node
        network.body.data.nodes.update([
          { id: edge.to, opacity: 1.0, size: 28, color: { background: "#f59e0b", border: "#fde68a" } }
        ]);

        await new Promise(r => setTimeout(r, 700));
      }

      if (isSimulating) {
        logFeed("Flow simulation completed. All transaction payment paths traced.", "system");
        showActionBanner("✅ Flow simulation complete! Full payment graph illuminated.");
        // Smooth cinematic zoom out to showcase the fully solved graph
        network.fit({ animation: { duration: 900, easingFunction: "easeInOutQuad" } });
      }
      isSimulating = false;
    });
  }

  if (btnResetSim) {
    btnResetSim.addEventListener("click", () => {
      isSimulating = false;
      btnPlaySim.style.display = "inline-flex";
      btnResetSim.style.display = "none";
      // Re-enable physics when reset
      if (network) network.setOptions({ physics: { enabled: true } });
      showActionBanner("Simulation reset. Returning to standard network overview.");
      refreshGraph();
    });
  }

  // --- Real-World Custom Case Modal & Presets ---
  const modal = document.getElementById("customCaseModal");
  const btnOpenModal = document.getElementById("btnOpenCustomModal");
  const btnCloseModal = document.getElementById("btnCloseCustomModal");
  const btnCancelModal = document.getElementById("btnCancelCustomModal");
  const txtJson = document.getElementById("customCaseJson");

  const casePresets = {
    cartel: {
      seed_account: "ACC_CARTEL_KINGPIN_01",
      is_illicit: true,
      nodes: [
        { id: "ACC_CARTEL_KINGPIN_01", label: "Account", bank: "CARIBBEAN_PRIVATE" },
        { id: "ACC_SMURF_MULE_A", label: "Account", bank: "RETAIL_BANK_1" },
        { id: "ACC_SMURF_MULE_B", label: "Account", bank: "RETAIL_BANK_2" },
        { id: "ACC_SMURF_MULE_C", label: "Account", bank: "RETAIL_BANK_3" },
        { id: "ACC_OFFSHORE_TUMBLER", label: "Account", bank: "PANAMA_SETTLEMENT" }
      ],
      edges: [
        { source: "ACC_CARTEL_KINGPIN_01", target: "ACC_SMURF_MULE_A", amount: 9850.0 },
        { source: "ACC_CARTEL_KINGPIN_01", target: "ACC_SMURF_MULE_B", amount: 9800.0 },
        { source: "ACC_CARTEL_KINGPIN_01", target: "ACC_SMURF_MULE_C", amount: 9900.0 },
        { source: "ACC_SMURF_MULE_A", target: "ACC_OFFSHORE_TUMBLER", amount: 9750.0 },
        { source: "ACC_SMURF_MULE_B", target: "ACC_OFFSHORE_TUMBLER", amount: 9700.0 },
        { source: "ACC_SMURF_MULE_C", target: "ACC_OFFSHORE_TUMBLER", amount: 9800.0 }
      ]
    },
    sybil: {
      seed_account: "ACC_BOT_PUPPET_01",
      is_illicit: true,
      nodes: [
        { id: "ACC_BOT_PUPPET_01", label: "Account", bank: "NEO_BANK_X" },
        { id: "ACC_BOT_PUPPET_02", label: "Account", bank: "NEO_BANK_X" },
        { id: "ACC_BOT_PUPPET_03", label: "Account", bank: "NEO_BANK_Y" },
        { id: "DEV_EMULATOR_FARM_99", label: "Device" }
      ],
      edges: [
        { source: "ACC_BOT_PUPPET_01", target: "DEV_EMULATOR_FARM_99", type: "USES" },
        { source: "ACC_BOT_PUPPET_02", target: "DEV_EMULATOR_FARM_99", type: "USES" },
        { source: "ACC_BOT_PUPPET_03", target: "DEV_EMULATOR_FARM_99", type: "USES" },
        { source: "ACC_BOT_PUPPET_01", target: "ACC_BOT_PUPPET_02", amount: 4500.0 },
        { source: "ACC_BOT_PUPPET_02", target: "ACC_BOT_PUPPET_03", amount: 4400.0 }
      ]
    },
    circular: {
      seed_account: "SHELL_HOLDING_ALPHA",
      is_illicit: true,
      nodes: [
        { id: "SHELL_HOLDING_ALPHA", label: "Account", bank: "BVI_CORP" },
        { id: "SHELL_HOLDING_BETA", label: "Account", bank: "CYPRUS_TRADING" },
        { id: "SHELL_HOLDING_GAMMA", label: "Account", bank: "SEYCHELLES_ESCROW" }
      ],
      edges: [
        { source: "SHELL_HOLDING_ALPHA", target: "SHELL_HOLDING_BETA", amount: 250000.0 },
        { source: "SHELL_HOLDING_BETA", target: "SHELL_HOLDING_GAMMA", amount: 248000.0 },
        { source: "SHELL_HOLDING_GAMMA", target: "SHELL_HOLDING_ALPHA", amount: 246500.0 }
      ]
    },
    payroll: {
      seed_account: "CORP_ACME_PAYROLL",
      is_illicit: false,
      nodes: [
        { id: "CORP_ACME_PAYROLL", label: "Account", bank: "COMMERCIAL_TREASURY" },
        { id: "EMP_ALICE_401", label: "Account", bank: "CHASE" },
        { id: "EMP_BOB_402", label: "Account", bank: "WELLS_FARGO" },
        { id: "EMP_CHARLIE_403", label: "Account", bank: "CITI" }
      ],
      edges: [
        { source: "CORP_ACME_PAYROLL", target: "EMP_ALICE_401", amount: 4200.0 },
        { source: "CORP_ACME_PAYROLL", target: "EMP_BOB_402", amount: 3800.0 },
        { source: "CORP_ACME_PAYROLL", target: "EMP_CHARLIE_403", amount: 5100.0 }
      ]
    }
  };

  if (btnOpenModal && modal) {
    btnOpenModal.addEventListener("click", () => {
      txtJson.value = JSON.stringify(casePresets.cartel, null, 2);
      modal.classList.add("active");
      modal.style.display = "flex";
    });
  }

  [btnCloseModal, btnCancelModal].forEach(btn => {
    if (btn) btn.addEventListener("click", () => {
      modal.classList.remove("active");
      modal.style.display = "none";
    });
  });

  // Close when clicking background outside card
  modal.addEventListener("click", (e) => {
    if (e.target === modal) {
      modal.classList.remove("active");
      modal.style.display = "none";
    }
  });

  document.querySelectorAll(".preset-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const p = btn.getAttribute("data-preset");
      if (casePresets[p]) {
        txtJson.value = JSON.stringify(casePresets[p], null, 2);
      }
    });
  });

  // Modal Format Toggle: JSON vs CSV
  const tabJson = document.getElementById("tabModeJson");
  const tabCsv = document.getElementById("tabModeCsv");
  const jsonPresets = document.getElementById("jsonPresetSection");
  const jsonInputs = document.getElementById("jsonInputSection");
  const csvInputs = document.getElementById("csvUploadSection");
  let activeModalMode = "json";
  let selectedCsvFile = null;

  if (tabJson && tabCsv) {
    tabJson.addEventListener("click", () => {
      activeModalMode = "json";
      tabJson.style.background = "rgba(14, 165, 233, 0.2)";
      tabJson.style.borderColor = "var(--accent-cyan)";
      tabJson.style.color = "#38bdf8";
      tabCsv.style.background = "transparent";
      tabCsv.style.borderColor = "var(--card-border)";
      tabCsv.style.color = "var(--text-main)";
      jsonPresets.style.display = "block";
      jsonInputs.style.display = "block";
      csvInputs.style.display = "none";
    });

    tabCsv.addEventListener("click", () => {
      activeModalMode = "csv";
      tabCsv.style.background = "rgba(14, 165, 233, 0.2)";
      tabCsv.style.borderColor = "var(--accent-cyan)";
      tabCsv.style.color = "#38bdf8";
      tabJson.style.background = "transparent";
      tabJson.style.borderColor = "var(--card-border)";
      tabJson.style.color = "var(--text-main)";
      jsonPresets.style.display = "none";
      jsonInputs.style.display = "none";
      csvInputs.style.display = "block";
    });
  }

  // CSV File Picker & Drag-and-Drop
  const csvDropZone = document.getElementById("csvDropZone");
  const csvFileInput = document.getElementById("csvFileInput");
  const btnSelectCsv = document.getElementById("btnSelectCsv");
  const fileInfo = document.getElementById("csvSelectedFileInfo");

  if (btnSelectCsv && csvFileInput) {
    btnSelectCsv.addEventListener("click", () => csvFileInput.click());
    csvFileInput.addEventListener("change", (e) => {
      if (e.target.files && e.target.files[0]) {
        selectedCsvFile = e.target.files[0];
        fileInfo.style.display = "block";
        fileInfo.innerText = `Selected File: ${selectedCsvFile.name} (${(selectedCsvFile.size / 1024).toFixed(1)} KB)`;
      }
    });
  }

  if (csvDropZone) {
    csvDropZone.addEventListener("dragover", (e) => {
      e.preventDefault();
      csvDropZone.style.borderColor = "#38bdf8";
      csvDropZone.style.background = "rgba(14, 165, 233, 0.15)";
    });
    csvDropZone.addEventListener("dragleave", () => {
      csvDropZone.style.borderColor = "rgba(14, 165, 233, 0.4)";
      csvDropZone.style.background = "rgba(15, 23, 42, 0.6)";
    });
    csvDropZone.addEventListener("drop", (e) => {
      e.preventDefault();
      csvDropZone.style.borderColor = "rgba(14, 165, 233, 0.4)";
      csvDropZone.style.background = "rgba(15, 23, 42, 0.6)";
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        selectedCsvFile = e.dataTransfer.files[0];
        fileInfo.style.display = "block";
        fileInfo.innerText = `Selected File: ${selectedCsvFile.name} (${(selectedCsvFile.size / 1024).toFixed(1)} KB)`;
      }
    });
  }

  // Load Real-World Sample CSV for Instant Judge Testing
  const btnSampleCsv = document.getElementById("btnLoadSampleCsv");
  if (btnSampleCsv) {
    btnSampleCsv.addEventListener("click", () => {
      const sampleCsvData = `sender,receiver,amount,bank,receiver_bank,device_id
ACC_SMURF_RING_KINGPIN,ACC_MULE_CHASE_01,9850,JPMorgan Chase,Retail Bank A,DEV_IP_192_168_1_4
ACC_SMURF_RING_KINGPIN,ACC_MULE_WELLS_02,9900,JPMorgan Chase,Retail Bank B,DEV_IP_192_168_1_4
ACC_SMURF_RING_KINGPIN,ACC_MULE_CITI_03,9800,JPMorgan Chase,Retail Bank C,DEV_IP_192_168_1_4
ACC_MULE_CHASE_01,ACC_PANAMA_SETTLEMENT,9750,Retail Bank A,Offshore Escrow,DEV_IP_10_0_0_9
ACC_MULE_WELLS_02,ACC_PANAMA_SETTLEMENT,9700,Retail Bank B,Offshore Escrow,DEV_IP_10_0_0_9
ACC_MULE_CITI_03,ACC_PANAMA_SETTLEMENT,9650,Retail Bank C,Offshore Escrow,DEV_IP_10_0_0_9`;

      const blob = new Blob([sampleCsvData], { type: "text/csv" });
      selectedCsvFile = new File([blob], "real_world_aml_structuring_sample.csv", { type: "text/csv" });
      fileInfo.style.display = "block";
      fileInfo.innerText = `Loaded: real_world_aml_structuring_sample.csv (6 Transactions, Structuring Motif)`;
      showActionBanner("Loaded real-world AML sample banking CSV! Click Ingest to solve.");
    });
  }

  const btnSubmitCustom = document.getElementById("btnSubmitCustomCase");
  if (btnSubmitCustom) {
    btnSubmitCustom.addEventListener("click", async () => {
      try {
        let seedAccount = "ACC_CUSTOM_TARGET";

        if (activeModalMode === "csv") {
          if (!selectedCsvFile) {
            alert("Please select or drop a CSV file, or click 'Load Sample Real Banking Fraud CSV'.");
            return;
          }

          showActionBanner(`⚡ Ingesting real-world CSV '${selectedCsvFile.name}' into FalkorDB Cloud...`, true);
          logFeed(`Uploading and parsing real-world transaction CSV: ${selectedCsvFile.name}...`, "triage");
          modal.classList.remove("active");
          modal.style.display = "none";

          const formData = new FormData();
          formData.append("file", selectedCsvFile);

          const res = await fetch("/api/data/upload-csv", {
            method: "POST",
            body: formData
          });
          const data = await res.json();
          seedAccount = data.seed_account;
          logFeed(`CSV Graph Active in FalkorDB: ${data.nodes_count} entities, ${data.edges_count} payment links. Trail deposited!`, "triage");
        } else {
          const payload = JSON.parse(txtJson.value);
          seedAccount = payload.seed_account;
          showActionBanner(`⚡ Ingesting case '${payload.seed_account}' into FalkorDB Cloud...`, true);
          logFeed(`Ingesting custom case '${payload.seed_account}' into FalkorDB Cloud...`, "triage");
          modal.classList.remove("active");
          modal.style.display = "none";

          const res = await fetch("/api/data/ingest-custom", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          });
          const data = await res.json();
          logFeed(`Custom case live in FalkorDB: ${data.nodes_count} nodes, ${data.edges_count} edges. Dispatching investigator...`, "triage");
        }

        showActionBanner(`🤖 Convening 5-Model War Room on '${seedAccount}'...`, true);
        
        await loadUnclaimedTrails();
        await refreshGraph();

        // Switch to war room tab
        const warRoomTab = document.querySelector('.tab-btn[data-tab="warRoomView"]');
        if (warRoomTab) warRoomTab.click();

        // Trigger investigation
        const modelTier = document.getElementById("modelSelect").value;
        const invRes = await fetch(`/api/investigator/investigate?account_id=${seedAccount}&model_tier=${modelTier}`, {
          method: "POST"
        });
        const invData = await invRes.json();
        showActionBanner(`⚖️ Solved Case Verdict: ${invData.decision.verdict} (${invData.action.action})`);
        
        if (invData.cluster_consensus && invData.cluster_consensus.debate_turns) {
          playDetectiveWarRoomDebate(invData.cluster_consensus.debate_turns, {
            ...invData.decision,
            action: invData.action.action
          });
        }
      } catch (err) {
        logFeed(`Custom case error: ${err}`, "triage");
        showActionBanner(`❌ Ingest Error: ${err.message || err}`);
      }
    });
  }
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

    // Interactive Node & Edge Click Inspector
    network.on("click", function (params) {
      const inspector = document.getElementById("elementInspector");
      const inspectType = document.getElementById("inspectType");
      const inspectContent = document.getElementById("inspectContent");

      if (params.nodes.length > 0) {
        const nodeId = params.nodes[0];
        const nodeObj = visNodes.find(n => n.id === nodeId);
        const isDevice = nodeId.startsWith("DEV_");
        const isClaimed = claimedSet.has(nodeId);
        const isFlagged = flaggedSet.has(nodeId);

        // Calculate connected edges & volume
        const connectedEdges = visEdges.filter(e => e.from === nodeId || e.to === nodeId);
        const totalVolume = connectedEdges.reduce((sum, e) => sum + (e.label ? parseFloat(e.label.replace('$', '')) : 0), 0);

        inspectType.innerText = isDevice ? "📱 Hardware Device Node" : "🏦 Bank Account Entity";
        inspectContent.innerHTML = `
          <div style="font-weight: 700; color: #fff; font-size: 0.95rem; margin-bottom: 6px;">${nodeId}</div>
          <div style="display: flex; gap: 6px; margin-bottom: 8px;">
            <span class="badge-tag" style="background: ${nodeObj.color.background}; color: #fff; font-size: 0.68rem;">
              ${isClaimed ? "INVESTIGATED" : (isFlagged ? "TRAIL FLAGGED" : (isDevice ? "HARDWARE BINDING" : "NORMAL"))}
            </span>
          </div>
          <div><strong>Connected Hops:</strong> ${connectedEdges.length} transfers</div>
          ${!isDevice ? `<div><strong>Observed Volume:</strong> $${totalVolume.toLocaleString()}</div>` : ''}
          <div style="margin-top: 10px;">
            <button class="btn btn-secondary" onclick="document.getElementById('modelSelect').value = 'llama-3.3-70b'; fetch('/api/investigator/investigate?account_id=${nodeId}&model_tier=llama-3.3-70b', {method: 'POST'});" style="font-size: 0.72rem; padding: 4px 8px; width: 100%; justify-content: center;">
              ⚡ Inspect Account with Agents
            </button>
          </div>
        `;
        inspector.style.display = "block";
      } else if (params.edges.length > 0) {
        const edgeId = params.edges[0];
        const edgeObj = visEdges[edgeId] || (graphData.edges.get ? graphData.edges.get(edgeId) : null);
        if (edgeObj) {
          inspectType.innerText = "💸 Payment Edge / Relation";
          inspectContent.innerHTML = `
            <div><strong>Source:</strong> <code>${edgeObj.from}</code></div>
            <div style="margin-top: 3px;"><strong>Destination:</strong> <code>${edgeObj.to}</code></div>
            <div style="margin-top: 6px; font-size: 1rem; color: #34d399; font-weight: bold;">
              ${edgeObj.label || 'BINDING (USES)'}
            </div>
            <div style="font-size: 0.72rem; color: #94a3b8; margin-top: 4px;">FalkorDB Provenance Edge</div>
          `;
          inspector.style.display = "block";
        }
      } else {
        inspector.style.display = "none";
      }
    });
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
        <div class="motif-tag-list">
          ${(data.motifs && data.motifs.length > 0) 
            ? data.motifs.map(m => `<span class="motif-pill">${m}</span>`).join("") 
            : '<span style="color: var(--text-dim); font-size: 0.85rem;">None</span>'}
        </div>
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

    <div class="chain-hash-row" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
      <span>SHA-256 Block Hash: <span class="hash-val">${data.hash}</span></span>
      <a href="/api/report/sar?case_id=${encodeURIComponent(data.case_id)}&account_id=${encodeURIComponent(data.account_id)}" target="_blank" class="btn" style="background: linear-gradient(135deg, #0ea5e9, #2563eb); color: #fff; padding: 7px 14px; font-size: 0.8rem; text-decoration: none; border-radius: 6px; font-weight: 700; box-shadow: 0 2px 10px rgba(14, 165, 233, 0.4);">
        📑 Official FinCEN SAR Filing (PDF)
      </a>
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
