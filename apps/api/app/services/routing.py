import networkx as nx


NODES = {
    "A": (26.1445, 91.7362, "Guwahati Medical College"),
    "B": (26.1164, 91.8721, "Jorabat"),
    "C": (26.1127, 91.9898, "Sonapur"),
    "D": (26.1804, 91.9953, "Chandrapur"),
    "E": (26.1021, 92.1124, "Khetri"),
    "F": (26.1810, 92.1452, "District Relief Hub"),
}

EDGES = [
    ("A", "B", 14.0, 18, "R-01"),
    ("B", "C", 13.0, 55, "R-02"),
    ("C", "E", 14.0, 29, "R-03"),
    ("B", "D", 16.0, 22, "R-04"),
    ("D", "E", 17.0, 24, "R-05"),
    ("E", "F", 10.0, 16, "R-06"),
    ("D", "F", 19.0, 32, "R-07"),
    ("C", "D", 11.0, 35, "R-08"),
]


def _route_cost(distance: float, risk: int) -> float:
    """Prefer a modest detour over exposing critical logistics to a risky corridor."""
    high_risk_penalty = 18 if risk >= 75 else 7 if risk >= 50 else 0
    return distance * (1 + (risk / 100) * 1.8) + high_risk_penalty


def _graph(avoid: set[str], risk_by_road: dict[str, int] | None = None) -> nx.Graph:
    risk_by_road = risk_by_road or {}
    graph = nx.Graph()
    for node, (lat, lng, name) in NODES.items():
        graph.add_node(node, lat=lat, lng=lng, name=name)
    for left, right, distance, risk, road_id in EDGES:
        if road_id in avoid:
            continue
        live_risk = risk_by_road.get(road_id, risk)
        graph.add_edge(
            left, right, distance=distance, risk=live_risk, road_id=road_id,
            weight=_route_cost(distance, live_risk),
        )
    return graph


def safest_route(start: str, destination: str, avoid_road_ids: list[str], risk_by_road: dict[str, int] | None = None) -> dict:
    if start not in NODES or destination not in NODES:
        raise ValueError("Unknown start or destination node")

    graph = _graph(set(avoid_road_ids), risk_by_road)
    try:
        path = nx.shortest_path(graph, source=start, target=destination, weight="weight", method="dijkstra")
    except (nx.NetworkXNoPath, nx.NodeNotFound) as exc:
        raise ValueError("No safe route is available") from exc
    roads = [graph.edges[left, right] for left, right in zip(path, path[1:])]
    distance = sum(edge["distance"] for edge in roads)
    avg_risk = round(sum(edge["risk"] * edge["distance"] for edge in roads) / max(distance, 1))
    return {
        "nodes": path,
        "road_ids": [edge["road_id"] for edge in roads],
        "coordinates": [[NODES[item][0], NODES[item][1]] for item in path],
        "distance_km": round(distance, 1),
        "eta_minutes": round(distance / 38 * 60),
        "risk_score": avg_risk,
        "route_name": " → ".join(NODES[item][2] for item in path),
        "reason": f"Completely avoids {', '.join(avoid_road_ids) or 'no closed roads'} and minimizes risk-adjusted travel cost",
        "algorithm": "Risk-aware Dijkstra (distance × live-risk exposure + high-risk penalty)",
    }


def ranked_routes(
    start: str,
    destination: str,
    road_assessments: dict[str, dict],
    limit: int = 4,
) -> list[dict]:
    """Rank all viable graph paths from latest road risk; blocked paths remain visible but rank last."""
    if start not in NODES or destination not in NODES:
        raise ValueError("Unknown start or destination node")
    risk_by_road = {road_id: item["risk_score"] for road_id, item in road_assessments.items()}
    graph = _graph(set(), risk_by_road)
    candidates: list[dict] = []
    for path in nx.all_simple_paths(graph, source=start, target=destination):
        edges = [graph.edges[left, right] for left, right in zip(path, path[1:])]
        road_ids = [edge["road_id"] for edge in edges]
        distance = sum(edge["distance"] for edge in edges)
        weighted_risk = round(sum(edge["risk"] * edge["distance"] for edge in edges) / max(distance, 1))
        blocked_roads = [road_id for road_id in road_ids if road_assessments.get(road_id, {}).get("status") == "BLOCKED"]
        status = "BLOCKED" if blocked_roads else "HIGH_RISK" if weighted_risk >= 50 else "CAUTION" if weighted_risk >= 25 else "SAFE"
        candidates.append({
            "route_name": " → ".join(NODES[node][2] for node in path),
            "road_ids": road_ids,
            "coordinates": [[NODES[node][0], NODES[node][1]] for node in path],
            "distance_km": round(distance, 1),
            "eta_minutes": round(distance / 38 * 60),
            "risk_score": weighted_risk,
            "status": status,
            "blocked_roads": blocked_roads,
            "score": round(_route_cost(distance, weighted_risk) + (1000 if blocked_roads else 0), 2),
        })
    candidates.sort(key=lambda item: item["score"])
    selected = candidates[:limit]
    for index, route in enumerate(selected):
        route["route_id"] = f"Route {index + 1}"
        route["recommended"] = index == 0 and route["status"] != "BLOCKED"
    return selected
