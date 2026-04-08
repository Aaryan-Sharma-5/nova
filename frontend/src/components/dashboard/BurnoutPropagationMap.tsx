import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { protectedGetApi } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { useEffect, useMemo, useRef, useState } from "react";
import { Download } from "lucide-react";
import * as d3 from "d3";
import html2canvas from "html2canvas";

type GraphNode = {
  id: string;
  name: string;
  department: string;
  burnout_risk_score: number;
  propagation_risk: number;
  cluster_id: string | null;
  centrality: {
    degree: number;
    betweenness: number;
    closeness: number;
    eigenvector: number;
    influence: number;
  };
};

type GraphEdge = {
  source: string;
  target: string;
  weight: number;
};

type ClusterInfo = {
  cluster_id: string;
  node_ids: string[];
  size: number;
  avg_risk: number;
};

type TimelineStep = {
  step: number;
  estimated_affected: number;
  avg_propagation_risk: number;
};

type PropagationResponse = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  clusters: ClusterInfo[];
  estimated_spread_timeline: TimelineStep[];
};

type SimulationNode = GraphNode & d3.SimulationNodeDatum;

type SimulationLink = d3.SimulationLinkDatum<SimulationNode> & {
  source: string | SimulationNode;
  target: string | SimulationNode;
  weight: number;
};

type ClusterBubbleDatum = {
  clusterId: string;
};

const WIDTH = 920;
const HEIGHT = 560;

const departmentColor = d3
  .scaleOrdinal<string, string>()
  .domain(["Engineering", "Sales", "Marketing", "Operations"])
  .range(["#3b82f6", "#8b5cf6", "#10b981", "#f59e0b"]);

export default function BurnoutPropagationMap() {
  const { token } = useAuth();
  const svgRef = useRef<SVGSVGElement>(null);
  const chartRef = useRef<HTMLDivElement>(null);

  const [graph, setGraph] = useState<PropagationResponse | null>(null);
  const [showPropagationRisk, setShowPropagationRisk] = useState(true);
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);

  const riskColor = useMemo(
    () =>
      d3
        .scaleLinear<string>()
        .domain([0, 0.5, 1])
        .range(["#22c55e", "#eab308", "#ef4444"])
        .clamp(true),
    []
  );

  useEffect(() => {
    let mounted = true;

    async function loadGraph() {
      if (!token) {
        setGraph(null);
        return;
      }

      try {
        const payload = await protectedGetApi<PropagationResponse>("/api/graph/propagation?steps=10", token);
        if (mounted) {
          setGraph(payload);
        }
      } catch {
        if (mounted) {
          setGraph({ nodes: [], edges: [], clusters: [], estimated_spread_timeline: [] });
        }
      }
    }

    void loadGraph();

    return () => {
      mounted = false;
    };
  }, [token]);

  useEffect(() => {
    if (!svgRef.current || !graph || graph.nodes.length === 0) {
      return;
    }

    const nodes: SimulationNode[] = graph.nodes.map((n) => ({ ...n }));
    const links: SimulationLink[] = graph.edges.map((e) => ({
      ...e,
      source: e.source,
      target: e.target,
      weight: e.weight ?? 1,
    }));

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    svg.attr("viewBox", `0 0 ${WIDTH} ${HEIGHT}`).attr("width", WIDTH).attr("height", HEIGHT);

    const root = svg.append("g");
    const clusterLayer = root.append("g").attr("class", "cluster-layer");
    const linkLayer = root.append("g").attr("class", "link-layer");
    const nodeLayer = root.append("g").attr("class", "node-layer");

    const simulation = d3
      .forceSimulation<SimulationNode>(nodes)
      .force(
        "link",
        d3
          .forceLink<SimulationNode, SimulationLink>(links)
          .id((d) => d.id)
          .distance((d) => 90 + (1 - Number(d.weight ?? 0.5)) * 80)
          .strength((d) => 0.25 + Number(d.weight ?? 0.5) * 0.55)
      )
      .force("charge", d3.forceManyBody().strength(-260))
      .force("center", d3.forceCenter(WIDTH / 2, HEIGHT / 2))
      .force("collision", d3.forceCollide<SimulationNode>().radius((d) => 18 + Number(d.propagation_risk ?? 0) * 22));

    const link = linkLayer
      .selectAll<SVGLineElement, SimulationLink>("line")
      .data(links)
      .enter()
      .append("line")
      .attr("stroke", "#64748b")
      .attr("stroke-opacity", 0.35)
      .attr("stroke-width", (d) => 1 + (d.weight || 0) * 5);

    const node = nodeLayer
      .selectAll<SVGGElement, SimulationNode>("g")
      .data(nodes)
      .enter()
      .append("g")
      .style("cursor", "pointer")
      .call(
        d3
          .drag<SVGGElement, SimulationNode>()
          .on("start", (event, d) => {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on("drag", (event, d) => {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on("end", (event, d) => {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          })
      );

    node
      .append("circle")
      .attr("r", (d) => {
        if (showPropagationRisk) {
          return 8 + Number(d.propagation_risk ?? 0) * 28;
        }
        return 10 + Number(d.centrality?.influence ?? 0) * 22;
      })
      .attr("fill", (d) => {
        if (showPropagationRisk) {
          return riskColor(Number(d.propagation_risk ?? 0));
        }
        return departmentColor(String(d.department));
      })
      .attr("stroke", "#ffffff")
      .attr("stroke-width", 2)
      .on("mouseenter", function (_event, d) {
        d3.select(this).attr("stroke-width", 4);
        setHoveredNode(d);
      })
      .on("mouseleave", function () {
        d3.select(this).attr("stroke-width", 2);
        setHoveredNode(null);
      });

    node
      .append("text")
      .attr("text-anchor", "middle")
      .attr("y", (d) => -(14 + Number(d.propagation_risk ?? 0) * 20))
      .attr("font-size", "11px")
      .attr("font-weight", 600)
      .attr("fill", "#0f172a")
      .text((d) => d.name);

    const clusterNodesById = new Map<string, SimulationNode[]>();
    graph.clusters.forEach((cluster) => {
      const members = nodes.filter((n) => cluster.node_ids.includes(n.id));
      if (members.length > 1) {
        clusterNodesById.set(cluster.cluster_id, members);
      }
    });

    const clusterEntries: ClusterBubbleDatum[] = Array.from(clusterNodesById.entries()).map(([clusterId]) => ({
      clusterId,
    }));

    const clusterBubble = clusterLayer
      .selectAll<SVGCircleElement, ClusterBubbleDatum>("circle")
      .data(clusterEntries)
      .enter()
      .append("circle")
      .attr("fill", "#ef4444")
      .attr("fill-opacity", 0.08)
      .attr("stroke", "#ef4444")
      .attr("stroke-opacity", 0.25)
      .attr("stroke-dasharray", "4 4")
      .attr("stroke-width", 1.2);

    simulation.on("tick", () => {
      link
        .attr("x1", (d) => ((d.source as SimulationNode).x ?? 0))
        .attr("y1", (d) => ((d.source as SimulationNode).y ?? 0))
        .attr("x2", (d) => ((d.target as SimulationNode).x ?? 0))
        .attr("y2", (d) => ((d.target as SimulationNode).y ?? 0));

      node.attr("transform", (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);

      clusterBubble
        .attr("cx", (entry) => {
          const members = clusterNodesById.get(entry.clusterId) || [];
          return d3.mean(members, (m) => m.x ?? 0) ?? 0;
        })
        .attr("cy", (entry) => {
          const members = clusterNodesById.get(entry.clusterId) || [];
          return d3.mean(members, (m) => m.y ?? 0) ?? 0;
        })
        .attr("r", (entry) => {
          const members = clusterNodesById.get(entry.clusterId) || [];
          const cx = d3.mean(members, (m) => m.x ?? 0) ?? 0;
          const cy = d3.mean(members, (m) => m.y ?? 0) ?? 0;
          const farthest = d3.max(members, (m) => Math.hypot((m.x ?? 0) - cx, (m.y ?? 0) - cy)) ?? 20;
          return farthest + 32;
        });
    });

    return () => {
      simulation.stop();
    };
  }, [graph, showPropagationRisk, riskColor]);

  const handleExport = async () => {
    if (!chartRef.current) {
      return;
    }
    const canvas = await html2canvas(chartRef.current);
    const link = document.createElement("a");
    link.download = "burnout-propagation-map.png";
    link.href = canvas.toDataURL();
    link.click();
  };

  const highRiskCount = graph?.nodes.filter((node) => node.propagation_risk >= 0.66).length ?? 0;
  const clusterCount = graph?.clusters.length ?? 0;
  const latestStep = graph?.estimated_spread_timeline.at(-1);

  return (
    <Card className="col-span-4">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Burnout Propagation Map</CardTitle>
        <div className="flex items-center gap-2">
          <Button
            variant={showPropagationRisk ? "default" : "outline"}
            size="sm"
            onClick={() => setShowPropagationRisk((value) => !value)}
          >
            {showPropagationRisk ? "Hide Propagation Risk" : "Show Propagation Risk"}
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div ref={chartRef} className="relative">
          <div className="absolute top-3 left-3 bg-white/90 backdrop-blur border rounded-md p-3 z-10 shadow-sm">
            <p className="text-xs font-semibold mb-1">Legend</p>
            <p className="text-xs">Node size: {showPropagationRisk ? "Propagation risk" : "Influence"}</p>
            <p className="text-xs">Edge thickness: Interaction frequency</p>
            <p className="text-xs">Red bubble: Propagation cluster</p>
            {showPropagationRisk && (
              <div className="mt-2 flex items-center gap-1">
                <span className="h-2 w-8 rounded bg-green-500" />
                <span className="h-2 w-8 rounded bg-yellow-400" />
                <span className="h-2 w-8 rounded bg-red-500" />
              </div>
            )}
          </div>

          {hoveredNode && (
            <div className="absolute top-3 right-3 bg-white border rounded-md p-3 z-10 shadow-sm min-w-52">
              <p className="font-semibold text-sm">{hoveredNode.name}</p>
              <p className="text-xs text-muted-foreground">{hoveredNode.department}</p>
              <div className="mt-2 space-y-1 text-xs">
                <p>Burnout risk: {(hoveredNode.burnout_risk_score * 100).toFixed(0)}%</p>
                <p>Propagation risk: {(hoveredNode.propagation_risk * 100).toFixed(0)}%</p>
                <p>Influence: {(hoveredNode.centrality.influence * 100).toFixed(0)}%</p>
                <p>Cluster: {hoveredNode.cluster_id ?? "None"}</p>
              </div>
            </div>
          )}

          <div className="bg-slate-50 border rounded-lg p-2">
            <svg ref={svgRef} />
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="rounded-md border bg-slate-50 p-3 text-center">
            <p className="text-2xl font-bold text-slate-900">{graph?.nodes.length ?? 0}</p>
            <p className="text-xs text-muted-foreground">Employees in graph</p>
          </div>
          <div className="rounded-md border bg-slate-50 p-3 text-center">
            <p className="text-2xl font-bold text-red-600">{highRiskCount}</p>
            <p className="text-xs text-muted-foreground">High propagation risk</p>
          </div>
          <div className="rounded-md border bg-slate-50 p-3 text-center">
            <p className="text-2xl font-bold text-amber-600">{clusterCount}</p>
            <p className="text-xs text-muted-foreground">Propagation clusters</p>
          </div>
          <div className="rounded-md border bg-slate-50 p-3 text-center">
            <p className="text-2xl font-bold text-indigo-600">
              {latestStep ? Math.round(latestStep.estimated_affected) : 0}
            </p>
            <p className="text-xs text-muted-foreground">Est. affected at final step</p>
          </div>
        </div>

        {graph && graph.clusters.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {graph.clusters.map((cluster) => (
              <Badge key={cluster.cluster_id} variant="outline" className="border-red-200 text-red-700">
                {cluster.cluster_id}: {cluster.size} nodes, avg risk {(cluster.avg_risk * 100).toFixed(0)}%
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
