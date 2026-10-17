// ==============================================================================
// FalkorDB Graph Schema & Index Definitions - Ariadne
// ==============================================================================

// --- Node Indices ---
// Account indices
CREATE INDEX FOR (a:Account) ON (a.id);
CREATE INDEX FOR (a:Account) ON (a.bank);

// Device and Card indices
CREATE INDEX FOR (d:Device) ON (d.id);
CREATE INDEX FOR (c:Card) ON (c.id);
CREATE INDEX FOR (m:Merchant) ON (m.id);

// Agent & Case indices
CREATE INDEX FOR (ag:Agent) ON (ag.id);
CREATE INDEX FOR (cs:Case) ON (cs.id);
CREATE INDEX FOR (cs:Case) ON (cs.status);

// Memory: Fact, Playbook, PatternType indices
CREATE INDEX FOR (f:Fact) ON (f.id);
CREATE INDEX FOR (f:Fact) ON (f.subject_id);
CREATE INDEX FOR (pt:PatternType) ON (pt.name);
CREATE INDEX FOR (pb:Playbook) ON (pb.id);

// Tamper-Evident Hash Chain Decision indices
CREATE INDEX FOR (dec:Decision) ON (dec.id);
CREATE INDEX FOR (dec:Decision) ON (dec.hash);
CREATE INDEX FOR (dec:Decision) ON (dec.case_id);

// --- Shared Graph Indices (for shared_patterns) ---
CREATE INDEX FOR (fp:Fingerprint) ON (fp.pattern_type);
CREATE INDEX FOR (fp:Fingerprint) ON (fp.size_bucket);
