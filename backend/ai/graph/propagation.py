"""Burnout propagation model using an SIR-like network simulation."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from ai.graph.centrality import CentralityScores


@dataclass
class PropagationNodeResult:
    node_id: str
    propagation_risk: float  # 0-1
    cluster_id: str | None


def _clamp01(value: float) -> float:
    return max(0.0, min(1.0, value))


def _find_high_risk_clusters(
    node_ids: list[str],
    edges: list[dict[str, Any]],
    risks: dict[str, float],
    threshold: float = 0.55,
) -> tuple[dict[str, str | None], dict[str, list[str]]]:
    high_risk = {node_id for node_id in node_ids if risks.get(node_id, 0.0) >= threshold}
    adjacency: dict[str, set[str]] = {node_id: set() for node_id in high_risk}

    for edge in edges:
        source = str(edge["source"])
        target = str(edge["target"])
        if source in high_risk and target in high_risk:
            adjacency[source].add(target)
            adjacency[target].add(source)

    visited: set[str] = set()
    node_cluster_map: dict[str, str | None] = {node_id: None for node_id in node_ids}
    clusters: dict[str, list[str]] = {}
    cluster_index = 1

    for node_id in high_risk:
        if node_id in visited:
            continue

        queue = [node_id]
        visited.add(node_id)
        component: list[str] = []

        while queue:
            current = queue.pop(0)
            component.append(current)
            for neighbor in adjacency.get(current, set()):
                if neighbor not in visited:
                    visited.add(neighbor)
                    queue.append(neighbor)

        cluster_id = f"cluster-{cluster_index}"
        cluster_index += 1
        clusters[cluster_id] = component
        for member in component:
            node_cluster_map[member] = cluster_id

    return node_cluster_map, clusters


def simulate_burnout_propagation(
    nodes: list[dict[str, Any]],
    edges: list[dict[str, Any]],
    centrality_map: dict[str, CentralityScores],
    steps: int = 8,
    beta: float = 0.32,
    gamma: float = 0.14,
) -> dict[str, Any]:
    """Run an SIR-like simulation over the employee interaction graph.

    Model design:
    - Initial infection probability comes from current burnout risk.
    - Infection pressure from neighbors is weighted by edge interaction frequency.
    - Neighbor influence multiplier comes from centrality influence score.
    - Recovery slowly reduces infection pressure over time.
    """
    node_ids = [str(node["id"]) for node in nodes]

    adjacency: dict[str, list[tuple[str, float]]] = {node_id: [] for node_id in node_ids}
    for edge in edges:
        source = str(edge["source"])
        target = str(edge["target"])
        weight = float(edge.get("weight", edge.get("strength", 1.0)))
        weight = _clamp01(weight)

        if source in adjacency and target in adjacency:
            adjacency[source].append((target, weight))
            adjacency[target].append((source, weight))

    susceptible: dict[str, float] = {}
    infected: dict[str, float] = {}
    recovered: dict[str, float] = {}

    for node in nodes:
        node_id = str(node["id"])
        base_risk = _clamp01(float(node.get("burnout_risk_score", 0.0)))
        influence = centrality_map.get(node_id).influence_score if node_id in centrality_map else 0.0
        infected_0 = _clamp01(base_risk * (0.75 + 0.25 * influence))
        susceptible[node_id] = 1.0 - infected_0
        infected[node_id] = infected_0
        recovered[node_id] = 0.0

    timeline: list[dict[str, Any]] = []

    for step in range(1, max(steps, 1) + 1):
        next_s: dict[str, float] = {}
        next_i: dict[str, float] = {}
        next_r: dict[str, float] = {}

        for node_id in node_ids:
            infection_pressure = 0.0
            for neighbor_id, weight in adjacency.get(node_id, []):
                neighbor_i = infected.get(neighbor_id, 0.0)
                neighbor_influence = centrality_map.get(neighbor_id).influence_score if neighbor_id in centrality_map else 0.0
                infection_pressure += beta * weight * neighbor_i * (0.7 + 0.3 * neighbor_influence)

            infection_pressure = _clamp01(infection_pressure)
            new_infections = susceptible[node_id] * infection_pressure
            recoveries = gamma * infected[node_id]

            i_next = _clamp01(infected[node_id] + new_infections - recoveries)
            r_next = _clamp01(recovered[node_id] + recoveries)
            s_next = _clamp01(1.0 - i_next - r_next)

            next_s[node_id] = s_next
            next_i[node_id] = i_next
            next_r[node_id] = r_next

        susceptible = next_s
        infected = next_i
        recovered = next_r

        expected_spread = sum(infected.values())
        affected_estimate = round(expected_spread * len(node_ids), 2)
        avg_risk = expected_spread / max(len(node_ids), 1)

        timeline.append(
            {
                "step": step,
                "estimated_affected": affected_estimate,
                "avg_propagation_risk": round(avg_risk, 4),
            }
        )

    propagation_risks = {node_id: _clamp01(infected[node_id] + 0.5 * recovered[node_id]) for node_id in node_ids}
    cluster_map, clusters = _find_high_risk_clusters(node_ids, edges, propagation_risks)

    node_results = [
        PropagationNodeResult(
            node_id=node_id,
            propagation_risk=round(propagation_risks[node_id], 4),
            cluster_id=cluster_map.get(node_id),
        )
        for node_id in node_ids
    ]

    cluster_payload = [
        {
            "cluster_id": cluster_id,
            "node_ids": members,
            "size": len(members),
            "avg_risk": round(
                sum(propagation_risks.get(member, 0.0) for member in members) / max(len(members), 1),
                4,
            ),
        }
        for cluster_id, members in clusters.items()
    ]

    return {
        "nodes": [
            {
                "node_id": node.node_id,
                "propagation_risk": node.propagation_risk,
                "cluster_id": node.cluster_id,
            }
            for node in node_results
        ],
        "clusters": cluster_payload,
        "estimated_spread_timeline": timeline,
    }
