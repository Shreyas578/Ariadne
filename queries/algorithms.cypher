// ==============================================================================
// Motif Detection & Graph Cypher Queries - Ariadne
// Pure Cypher motif matchers with deterministic fraud indicators
// ==============================================================================

// 1. Cycle Detection (Circular Smurfing / Laundering Loop: 3 to 5 hops)
// Parameters: $start_account_id, $min_amount
MATCH path = (a:Account {id: $start_account_id})-[:TRANSFERRED*3..5]->(a)
WHERE ALL(r IN relationships(path) WHERE r.amount >= $min_amount)
RETURN 
    [n IN nodes(path) | n.id] AS cycle_accounts,
    [r IN relationships(path) | {amount: r.amount, ts: r.ts}] AS transactions,
    length(path) AS cycle_length
LIMIT 5;

// 2. Fan-Out (Structuring / Scattering from a single hub to multiple beneficiaries)
// Parameters: $account_id, $time_window_start, $time_window_end, $min_beneficiaries
MATCH (source:Account {id: $account_id})-[r:TRANSFERRED]->(dest:Account)
WHERE r.ts >= $time_window_start AND r.ts <= $time_window_end
WITH source, count(DISTINCT dest) AS out_degree, sum(r.amount) AS total_out, collect(dest.id) AS recipients
WHERE out_degree >= $min_beneficiaries
RETURN source.id AS source_account, out_degree, total_out, recipients;

// 3. Fan-In (Gathering / Funneling from multiple mules to a single sink)
// Parameters: $account_id, $time_window_start, $time_window_end, $min_senders
MATCH (source:Account)-[r:TRANSFERRED]->(sink:Account {id: $account_id})
WHERE r.ts >= $time_window_start AND r.ts <= $time_window_end
WITH sink, count(DISTINCT source) AS in_degree, sum(r.amount) AS total_in, collect(source.id) AS senders
WHERE in_degree >= $min_senders
RETURN sink.id AS sink_account, in_degree, total_in, senders;

// 4. Scatter-Gather (Scatter from Source -> Mules -> Gather at Destination within 48h)
// Parameters: $source_id, $max_delay_seconds
MATCH (src:Account {id: $source_id})-[r1:TRANSFERRED]->(mule:Account)-[r2:TRANSFERRED]->(dst:Account)
WHERE src <> dst 
  AND r2.ts >= r1.ts 
  AND (r2.ts - r1.ts) <= $max_delay_seconds
RETURN 
    src.id AS source,
    mule.id AS mule,
    dst.id AS destination,
    r1.amount AS amount_in,
    r2.amount AS amount_out,
    (r2.ts - r1.ts) AS latency_seconds;

// 5. Shared Device / Card Ring (Identity and Synthetic ID Sybil network)
// Parameters: $account_id
MATCH (a:Account {id: $account_id})-[:USES]->(device:Device)<-[:USES]-(other:Account)
WHERE a <> other
RETURN 
    device.id AS shared_device_id,
    collect(DISTINCT other.id) AS linked_accounts,
    count(DISTINCT other) AS sybil_cluster_size;
