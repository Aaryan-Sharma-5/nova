"""Graph analytics endpoints for centrality and burnout propagation."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from ai.graph.centrality import NetworkAnalyzer
from ai.graph.propagation import simulate_burnout_propagation
from api.deps import require_role
from models.user import User, UserRole

router = APIRouter()


def _graph_role_dependency() -> Depends:
    return Depends(require_role([UserRole.HR, UserRole.MANAGER, UserRole.LEADERSHIP]))


def _build_mock_graph_data(department: str | None = None) -> tuple[list[dict], list[dict]]:
    nodes = [
        {"id": "node-1", "name": "Alice", "department": "Engineering", "burnout_risk_score": 0.72},
        {"id": "node-2", "name": "Bob", "department": "Engineering", "burnout_risk_score": 0.48},
        {"id": "node-3", "name": "Carol", "department": "Sales", "burnout_risk_score": 0.61},
        {"id": "node-4", "name": "David", "department": "Sales", "burnout_risk_score": 0.35},
        {"id": "node-5", "name": "Emma", "department": "Marketing", "burnout_risk_score": 0.55},
        {"id": "node-6", "name": "Frank", "department": "Marketing", "burnout_risk_score": 0.41},
        {"id": "node-7", "name": "Grace", "department": "Operations", "burnout_risk_score": 0.66},
        {"id": "node-8", "name": "Henry", "department": "Operations", "burnout_risk_score": 0.29},
        {"id": "node-9", "name": "Iris", "department": "Engineering", "burnout_risk_score": 0.78},
        {"id": "node-10", "name": "Jack", "department": "Sales", "burnout_risk_score": 0.57},
    ]

    edges = [
        {"source": "node-1", "target": "node-2", "weight": 0.8},
        {"source": "node-1", "target": "node-9", "weight": 0.9},
        {"source": "node-2", "target": "node-3", "weight": 0.45},
        {"source": "node-3", "target": "node-4", "weight": 0.75},
        {"source": "node-3", "target": "node-10", "weight": 0.65},
        {"source": "node-4", "target": "node-5", "weight": 0.35},
        {"source": "node-5", "target": "node-6", "weight": 0.7},
        {"source": "node-6", "target": "node-7", "weight": 0.55},
        {"source": "node-7", "target": "node-8", "weight": 0.6},
        {"source": "node-8", "target": "node-10", "weight": 0.4},
        {"source": "node-9", "target": "node-10", "weight": 0.7},
        {"source": "node-2", "target": "node-5", "weight": 0.3},
    ]

    if not department:
        return nodes, edges

    filtered_nodes = [node for node in nodes if node["department"].lower() == department.lower()]
    node_ids = {node["id"] for node in filtered_nodes}
    filtered_edges = [
        edge for edge in edges if edge["source"] in node_ids and edge["target"] in node_ids
    ]
    return filtered_nodes, filtered_edges


@router.get("/propagation")
async def get_graph_propagation(
    department: str | None = Query(default=None, description="Optional department filter"),
    steps: int = Query(default=8, ge=1, le=30, description="Simulation steps"),
    _current_user: User = _graph_role_dependency(),
) -> dict:
    nodes, edges = _build_mock_graph_data(department)

    analyzer = NetworkAnalyzer()
    for edge in edges:
        analyzer.add_edge(edge["source"], edge["target"], float(edge.get("weight", 1.0)))

    centralities = analyzer.compute_all_centralities()
    propagation = simulate_burnout_propagation(
        nodes=nodes,
        edges=edges,
        centrality_map=centralities,
        steps=steps,
    )

    propagation_by_node = {
        row["node_id"]: row for row in propagation["nodes"]
    }

    enriched_nodes = []
    for node in nodes:
        node_id = node["id"]
        centrality = centralities.get(node_id)
        propagation_row = propagation_by_node.get(node_id, {})

        enriched_nodes.append(
            {
                "id": node_id,
                "name": node["name"],
                "department": node["department"],
                "burnout_risk_score": node["burnout_risk_score"],
                "propagation_risk": propagation_row.get("propagation_risk", node["burnout_risk_score"]),
                "cluster_id": propagation_row.get("cluster_id"),
                "centrality": {
                    "degree": centrality.degree_centrality if centrality else 0.0,
                    "betweenness": centrality.betweenness_centrality if centrality else 0.0,
                    "closeness": centrality.closeness_centrality if centrality else 0.0,
                    "eigenvector": centrality.eigenvector_centrality if centrality else 0.0,
                    "influence": centrality.influence_score if centrality else 0.0,
                },
            }
        )

    return {
        "nodes": enriched_nodes,
        "edges": edges,
        "cluster_ids": [cluster["cluster_id"] for cluster in propagation["clusters"]],
        "clusters": propagation["clusters"],
        "estimated_spread_timeline": propagation["estimated_spread_timeline"],
    }
