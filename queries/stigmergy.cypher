// ==============================================================================
// Stigmergy Cypher Queries - Ariadne
// Pheromone trail deposit, reinforcement, and query-time exponential decay
// ==============================================================================

// 1. Deposit or Reinforce a Trail on an Entity (Account, Device, Card, Transaction)
// Parameters: $agent_id, $entity_id, $trail_type ('CHECKED', 'FLAGGED', 'CLAIMED'), $delta_weight, $now_ts
MATCH (ag:Agent {id: $agent_id})
MATCH (e {id: $entity_id})
MERGE (ag)-[r:TRAIL {type: $trail_type}]->(e)
ON CREATE SET 
    r.weight = $delta_weight,
    r.created_at = $now_ts,
    r.last_reinforced = $now_ts
ON MATCH SET 
    // Reinforce with saturation cap at 10.0
    r.weight = CASE WHEN (r.weight + $delta_weight) > 10.0 THEN 10.0 ELSE (r.weight + $delta_weight) END,
    r.last_reinforced = $now_ts
RETURN r.type AS trail_type, r.weight AS weight, r.last_reinforced AS last_reinforced;

// 2. Query Trails with Read-Time Exponential Decay: weight * exp(-lambda * dt)
// Parameters: $entity_id, $now_ts, $lambda (e.g. 0.005)
MATCH (ag:Agent)-[r:TRAIL]->(e {id: $entity_id})
WITH ag, r, ($now_ts - r.last_reinforced) AS dt, $lambda AS lambda
WITH ag, r, dt, (r.weight * exp(-lambda * dt)) AS effective_weight
WHERE effective_weight > 0.01
RETURN 
    ag.id AS agent_id,
    r.type AS trail_type,
    r.weight AS nominal_weight,
    dt AS seconds_elapsed,
    effective_weight
ORDER BY effective_weight DESC;

// 3. Find Unclaimed High-Priority Trails for Investigator Agent
// Parameters: $now_ts, $lambda, $min_effective_weight
MATCH (ag:Agent {role: 'triage'})-[r:TRAIL {type: 'FLAGGED'}]->(a:Account)
WHERE NOT EXISTS {
    MATCH (:Agent {role: 'investigator'})-[c:TRAIL {type: 'CLAIMED'}]->(a)
}
WITH a, r, ($now_ts - r.last_reinforced) AS dt, $lambda AS lambda
WITH a, (r.weight * exp(-lambda * dt)) AS effective_weight
WHERE effective_weight >= $min_effective_weight
RETURN a.id AS account_id, effective_weight
ORDER BY effective_weight DESC
LIMIT 10;
