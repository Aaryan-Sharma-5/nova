import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Download, Lightbulb, Users, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import html2canvas from "html2canvas";
import { useEmployees } from "@/contexts/EmployeeContext";
import { useAuth } from "@/contexts/AuthContext";
import { protectedGetApi } from "@/lib/api";

type NetworkNode = {
  id: string;
  name: string;
  department: string;
  sentiment: number;
  influence: number;
};

type NetworkLink = {
  source: string | { id: string };
  target: string | { id: string };
  strength: number;
};

type PropagationPayload = {
  nodes: Array<{
    id: string;
    name: string;
    department: string;
    burnout_risk_score: number;
    centrality?: { influence?: number };
  }>;
  edges: Array<{ source: string; target: string; weight: number }>;
};

type NetworkMetrics = {
  connectionCount: Map<string, number>;
  weightedConnections: Map<string, number>;
  centrality: Map<string, number>;
  entropy: Map<string, number>;
  propagationRisk: Map<string, number>;
};

type PeerNetworkGraphProps = {
  departmentFilter?: string | null;
  className?: string;
};

function computeNetworkMetrics(nodes: NetworkNode[], links: NetworkLink[]): NetworkMetrics {
  const connectionCount = new Map<string, number>();
  const weightedConnections = new Map<string, number>();
  const neighborWeights = new Map<string, number[]>();

  nodes.forEach((node) => {
    connectionCount.set(node.id, 0);
    weightedConnections.set(node.id, 0);
    neighborWeights.set(node.id, []);
  });

  links.forEach((link) => {
    const sourceId = typeof link.source === "string" ? link.source : (link.source as any).id;
    const targetId = typeof link.target === "string" ? link.target : (link.target as any).id;
    const strength = typeof (link as any).strength === "number" ? (link as any).strength : 1;

    connectionCount.set(sourceId, (connectionCount.get(sourceId) || 0) + 1);
    connectionCount.set(targetId, (connectionCount.get(targetId) || 0) + 1);
    weightedConnections.set(sourceId, (weightedConnections.get(sourceId) || 0) + strength);
    weightedConnections.set(targetId, (weightedConnections.get(targetId) || 0) + strength);
    neighborWeights.get(sourceId)?.push(strength);
    neighborWeights.get(targetId)?.push(strength);
  });

  const maxConnections = Math.max(...Array.from(connectionCount.values()), 1);
  const centrality = new Map<string, number>();
  const entropy = new Map<string, number>();
  const propagationRisk = new Map<string, number>();

  nodes.forEach((node) => {
    const degree = connectionCount.get(node.id) || 0;
    const centralityScore = degree / maxConnections;
    centrality.set(node.id, centralityScore);

    const weights = neighborWeights.get(node.id) || [];
    const totalWeight = weights.reduce((sum, value) => sum + value, 0) || 1;
    const distribution = weights.map((weight) => weight / totalWeight);
    const entropyScore = distribution.length
      ? -distribution.reduce((sum, probability) => sum + probability * Math.log2(probability), 0) / Math.log2(distribution.length)
      : 0;
    entropy.set(node.id, entropyScore);

    const sentimentRisk = 1 - node.sentiment / 100;
    const rawScore = Math.min(1, centralityScore * 0.65 + sentimentRisk * 0.35);
    propagationRisk.set(node.id, rawScore);
  });

  const ranked = nodes
    .map((node) => ({ nodeId: node.id, score: propagationRisk.get(node.id) || 0 }))
    .sort((a, b) => a.score - b.score);
  const lowCutoff = Math.floor(ranked.length * 0.3);
  const mediumCutoff = Math.floor(ranked.length * 0.8);

  ranked.forEach((entry, index) => {
    if (index < lowCutoff) {
      propagationRisk.set(entry.nodeId, 0.2 + (index / Math.max(1, lowCutoff)) * 0.19);
    } else if (index < mediumCutoff) {
      const offset = index - lowCutoff;
      const span = Math.max(1, mediumCutoff - lowCutoff);
      propagationRisk.set(entry.nodeId, 0.4 + (offset / span) * 0.25);
    } else {
      const offset = index - mediumCutoff;
      const span = Math.max(1, ranked.length - mediumCutoff);
      propagationRisk.set(entry.nodeId, 0.66 + (offset / span) * 0.29);
    }
  });

  return { connectionCount, weightedConnections, centrality, entropy, propagationRisk };
}

export default function PeerNetworkGraph({ departmentFilter, className }: PeerNetworkGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  const [selectedDept, setSelectedDept] = useState<string>(departmentFilter ?? "all");
  const [hoveredNode, setHoveredNode] = useState<NetworkNode | null>(null);
  const { employees } = useEmployees();
  const { token } = useAuth();
  const [nodes, setNodes] = useState<NetworkNode[]>([]);
  const [links, setLinks] = useState<NetworkLink[]>([]);

  useEffect(() => {
    setSelectedDept(departmentFilter ?? "all");
  }, [departmentFilter]);

  const isExternallyFiltered = typeof departmentFilter === "string";
  const activeDepartment = departmentFilter ?? selectedDept;

  useEffect(() => {
    const load = async () => {
      if (!token) {
        setNodes([]);
        setLinks([]);
        return;
      }

      try {
        const payload = await protectedGetApi<PropagationPayload>("/api/graph/propagation", token);
        setNodes((payload.nodes || []).map((node) => ({
          id: node.id,
          name: node.name,
          department: node.department,
          sentiment: Math.max(0, Math.min(100, Math.round((1 - node.burnout_risk_score) * 100))),
          influence: Math.max(5, Math.min(100, Math.round((node.centrality?.influence || 0) * 100))),
        })));
        setLinks((payload.edges || []).map((edge) => ({
          source: edge.source,
          target: edge.target,
          strength: edge.weight,
        })));
      } catch {
        const fallback = employees.slice(0, 12).map((employee, index) => ({
          id: employee.id,
          name: employee.name,
          department: employee.department,
          sentiment: Math.max(0, Math.min(100, Math.round((employee.sentimentScore + 1) * 50))),
          influence: Math.max(5, 20 + index * 4),
        }));

        setNodes(fallback);
        setLinks(fallback.slice(1).map((node, index) => ({
          source: fallback[index].id,
          target: node.id,
          strength: 0.5,
        })));
      }
    };

    void load();
  }, [token, employees]);

  function shortLabel(fullName: string): string {
    const parts = fullName.trim().split(/\s+/);
    if (parts.length === 0) return fullName;
    if (parts.length === 1) return parts[0];
    return `${parts[0]} ${parts[parts.length - 1][0]}.`;
  }

  const filteredGraph = useMemo(() => {
    const scopedNodes = activeDepartment === "all"
      ? nodes
      : nodes.filter((node) => node.department === activeDepartment);
    const scopedIds = new Set(scopedNodes.map((node) => node.id));
    const scopedLinks = links.filter((link) => {
      const sourceId = typeof link.source === "string" ? link.source : (link.source as any).id;
      const targetId = typeof link.target === "string" ? link.target : (link.target as any).id;
      return scopedIds.has(sourceId) && scopedIds.has(targetId);
    });
    return { nodes: scopedNodes, links: scopedLinks };
  }, [activeDepartment, nodes, links]);

  const metrics = useMemo(
    () => computeNetworkMetrics(filteredGraph.nodes, filteredGraph.links),
    [filteredGraph],
  );

  const departmentOptions = useMemo(() => {
    const values = new Set(nodes.map((node) => node.department).filter(Boolean));
    return Array.from(values).sort((left, right) => left.localeCompare(right));
  }, [nodes]);

  const isolatedEmployees = useMemo(
    () => filteredGraph.nodes.filter((node) => (metrics.connectionCount.get(node.id) || 0) <= 2),
    [filteredGraph.nodes, metrics.connectionCount],
  );

  const priorityWatchlist = useMemo(() => {
    return [...filteredGraph.nodes]
      .map((node) => {
        const connectivity = metrics.connectionCount.get(node.id) || 0;
        const riskScore = Math.round((metrics.propagationRisk.get(node.id) || 0) * 100);
        const reason = connectivity <= 2
          ? "Low collaboration exposure"
          : node.sentiment < 45
            ? "Low sentiment trend"
            : "High influence + elevated risk";
        return { node, riskScore, reason, connectivity };
      })
      .sort((left, right) => right.riskScore - left.riskScore)
      .slice(0, 3);
  }, [filteredGraph.nodes, metrics.connectionCount, metrics.propagationRisk]);

  const executiveSummary = useMemo(() => {
    const highRisk = filteredGraph.nodes.filter((node) => (metrics.propagationRisk.get(node.id) || 0) >= 0.66).length;
    const avgConnections = filteredGraph.nodes.length
      ? (filteredGraph.links.length / filteredGraph.nodes.length).toFixed(1)
      : "0.0";
    return {
      highRisk,
      avgConnections,
      headline:
        highRisk >= 4
          ? "Collaboration risk is concentrated in a few influential employees."
          : "Collaboration network is stable with a manageable risk profile.",
      action:
        isolatedEmployees.length > 0
          ? "Prioritize check-ins for isolated employees and pair them into active projects this week."
          : "Protect key connectors and maintain cross-team collaboration routines.",
    };
  }, [filteredGraph.nodes, filteredGraph.links.length, isolatedEmployees.length, metrics.propagationRisk]);

  const handleExport = async () => {
    if (chartRef.current) {
      const canvas = await html2canvas(chartRef.current);
      const link = document.createElement("a");
      link.download = "peer-network.png";
      link.href = canvas.toDataURL();
      link.click();
    }
  };

  useEffect(() => {
    if (!svgRef.current) return;

    const width = 800;
    const height = 600;

    const filteredNodes = filteredGraph.nodes;
    const filteredLinks = filteredGraph.links;

    // Clear previous content
    d3.select(svgRef.current).selectAll("*").remove();

    const svg = d3.select(svgRef.current)
      .attr("width", width)
      .attr("height", height)
      .attr("viewBox", `0 0 ${width} ${height}`);

    svg.style("touch-action", "none");
    const zoomLayer = svg.append("g").attr("class", "zoom-layer");
    const contentLayer = zoomLayer.append("g").attr("class", "content-layer");

    svg.call(
      d3.zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.5, 3])
        .on("zoom", (event) => {
          zoomLayer.attr("transform", event.transform.toString());
        }),
    );

    // Create force simulation
    const simulation = d3.forceSimulation(filteredNodes as any)
      .force("link", d3.forceLink(filteredLinks)
        .id((d: any) => d.id)
        .distance(100))
      .force("charge", d3.forceManyBody().strength(-300))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide().radius(40));

    // Create gradient for sentiment colors
    const defs = svg.append("defs");
    
    // Add arrow marker for links
    defs.append("marker")
      .attr("id", "arrowhead")
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 25)
      .attr("refY", 0)
      .attr("orient", "auto")
      .attr("markerWidth", 6)
      .attr("markerHeight", 6)
      .append("path")
      .attr("d", "M0,-5L10,0L0,5")
      .attr("fill", "#94a3b8");

    // Create links
    const link = contentLayer.append("g")
      .attr("class", "links")
      .selectAll("line")
      .data(filteredLinks)
      .enter().append("line")
      .attr("stroke", "#94a3b8")
      .attr("stroke-opacity", (d: any) => d.strength)
      .attr("stroke-width", (d: any) => Math.sqrt(d.strength) * 3)
      .attr("marker-end", "url(#arrowhead)");

    // Create node groups
    const node = contentLayer.append("g")
      .attr("class", "nodes")
      .selectAll("g")
      .data(filteredNodes)
      .enter().append("g")
      .attr("class", "node")
      .style("cursor", "pointer")
      .call(d3.drag<any, any>()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended) as any);

    // Add circles for nodes
    node.append("circle")
      .attr("r", (d: any) => 10 + (d.influence / 100) * 20)
      .attr("fill", (d: any) => {
        const risk = metrics.propagationRisk.get(d.id) || 0;
        if (risk > 0.65) return "#ef4444";
        if (risk >= 0.4) return "#eab308";
        return "#22c55e";
      })
      .attr("stroke", "#fff")
      .attr("stroke-width", 2)
      .on("mouseenter", function(event, d: any) {
        setHoveredNode(d);
        d3.select(this).attr("stroke-width", 4);
      })
      .on("mouseleave", function() {
        setHoveredNode(null);
        d3.select(this).attr("stroke-width", 2);
      });

    // Add labels
    node.append("text")
      .text((d: any) => shortLabel(d.name))
      .attr("x", 0)
      .attr("y", (d: any) => -(15 + (d.influence / 100) * 20))
      .attr("text-anchor", "middle")
      .attr("font-size", "11px")
      .attr("font-weight", "500")
      .attr("fill", "#fb923c");

    // Add influence score badges
    node.append("text")
      .text((d: any) => d.influence.toFixed(0))
      .attr("x", 0)
      .attr("y", 4)
      .attr("text-anchor", "middle")
      .attr("font-size", "10px")
      .attr("font-weight", "bold")
      .attr("fill", "#fff");

    // Update positions on simulation tick
    simulation.on("tick", () => {
      link
        .attr("x1", (d: any) => d.source.x)
        .attr("y1", (d: any) => d.source.y)
        .attr("x2", (d: any) => d.target.x)
        .attr("y2", (d: any) => d.target.y);

      node.attr("transform", (d: any) => `translate(${d.x},${d.y})`);
    });

    // Drag functions
    function dragstarted(event: any, d: any) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }

    function dragged(event: any, d: any) {
      d.fx = event.x;
      d.fy = event.y;
    }

    function dragended(event: any, d: any) {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    }

    return () => {
      simulation.stop();
    };
  }, [filteredGraph, metrics]);

  return (
    <Card className={className ?? "col-span-4"}>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Peer Collaboration Network</CardTitle>
        <div className="flex items-center gap-2">
          <Select
            value={activeDepartment}
            onValueChange={(value) => {
              if (!isExternallyFiltered) {
                setSelectedDept(value);
              }
            }}
            disabled={isExternallyFiltered}
          >
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Select department" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Departments</SelectItem>
              {departmentOptions.map((department) => (
                <SelectItem key={department} value={department}>
                  {department}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-4 rounded-lg border p-3" style={{ backgroundColor: "var(--bg-secondary)", borderColor: "var(--border-color)" }}>
          <div className="flex items-start gap-2">
            <Lightbulb className="h-4 w-4 mt-0.5" style={{ color: "var(--accent-primary)" }} />
            <div className="space-y-1">
              <p className="text-sm font-semibold">What this chart means</p>
              <p className="text-sm text-muted-foreground">Each dot is an employee and each line is a collaboration link. Bigger dots influence more teammates. Red dots need faster manager attention.</p>
              <p className="text-sm text-muted-foreground"><strong>Recommended action:</strong> {executiveSummary.action}</p>
            </div>
          </div>
        </div>

        <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="rounded-lg border p-3" style={{ backgroundColor: "var(--bg-secondary)", borderColor: "var(--border-color)" }}>
            <p className="text-xs text-muted-foreground">Current Readout</p>
            <p className="text-sm font-semibold mt-1">{executiveSummary.headline}</p>
          </div>
          <div className="rounded-lg border p-3" style={{ backgroundColor: "var(--bg-secondary)", borderColor: "var(--border-color)" }}>
            <p className="text-xs text-muted-foreground">High Priority Employees</p>
            <p className="text-2xl font-bold" style={{ color: "var(--alert-critical)" }}>{executiveSummary.highRisk}</p>
          </div>
          <div className="rounded-lg border p-3" style={{ backgroundColor: "var(--bg-secondary)", borderColor: "var(--border-color)" }}>
            <p className="text-xs text-muted-foreground">Average Collaboration Links</p>
            <p className="text-2xl font-bold" style={{ color: "var(--accent-primary)" }}>{executiveSummary.avgConnections}</p>
          </div>
        </div>

        <div ref={chartRef} className="relative">
          {/* Legend */}
          <div className="absolute top-4 left-4 backdrop-blur p-3 rounded-lg border shadow-sm z-10" style={{ backgroundColor: "color-mix(in srgb, var(--bg-card) 90%, transparent)", borderColor: "var(--border-color)" }}>
            <p className="text-xs font-semibold mb-2">How to read quickly</p>
            <p className="text-[11px] mb-2 text-muted-foreground">Executive view: collaboration exposure and intervention urgency.</p>
            <p className="text-xs mb-2 text-muted-foreground">Bigger node = more influence</p>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-green-500"></div>
                <span className="text-xs">Stable</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                <span className="text-xs">Watch</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500"></div>
                <span className="text-xs">Action Needed</span>
              </div>
            </div>
          </div>

          {/* Hovered node info */}
          {hoveredNode && (
            <div className="absolute top-4 right-4 border p-3 rounded-lg shadow-lg z-10" style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border-color)" }}>
              <p className="font-semibold">{hoveredNode.name}</p>
              <p className="text-sm text-muted-foreground">{hoveredNode.department}</p>
              <div className="mt-2 space-y-1">
                <div className="flex justify-between gap-4 text-sm">
                  <span>Collaboration reach:</span>
                  <span className="font-medium">{hoveredNode.influence.toFixed(0)}</span>
                </div>
                <div className="flex justify-between gap-4 text-sm">
                  <span>Team mood:</span>
                  <span className="font-medium">{hoveredNode.sentiment.toFixed(0)}%</span>
                </div>
                <div className="flex justify-between gap-4 text-sm">
                  <span>Urgency:</span>
                  <span className="font-medium">
                    {Math.round((metrics.propagationRisk.get(hoveredNode.id) || 0) * 100)}%
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* D3 SVG */}
          <div className="rounded-lg p-4 border" style={{ backgroundColor: "var(--bg-secondary)", borderColor: "var(--border-color)" }}>
            <svg ref={svgRef}></svg>
          </div>
        </div>

        {priorityWatchlist.length > 0 && (
          <div className="mt-4 rounded-md border p-3" style={{ backgroundColor: "var(--bg-secondary)", borderColor: "var(--border-color)" }}>
            <div className="mb-2 flex items-center gap-2">
              <Users className="h-4 w-4" style={{ color: "var(--accent-primary)" }} />
              <p className="text-sm font-semibold">Top People to Review This Week</p>
            </div>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
              {priorityWatchlist.map((entry) => (
                <div key={entry.node.id} className="rounded border p-2" style={{ borderColor: "var(--border-color)", backgroundColor: "var(--bg-card)" }}>
                  <p className="text-sm font-semibold">{entry.node.name}</p>
                  <p className="text-xs text-muted-foreground">{entry.node.department}</p>
                  <p className="mt-1 text-xs"><strong>Why:</strong> {entry.reason}</p>
                  <p className="text-xs"><strong>Risk:</strong> {entry.riskScore}%</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Isolated Employees Alert */}
        {isolatedEmployees.length > 0 && (
          <div className="mt-4 p-3 border rounded-md" style={{ backgroundColor: "var(--alert-banner-bg)", borderColor: "var(--border-color)" }}>
            <p className="text-sm font-semibold mb-2 inline-flex items-center gap-1" style={{ color: "var(--text-primary)" }}>
              <AlertTriangle className="h-4 w-4" /> {isolatedEmployees.length} employees have low collaboration exposure
            </p>
            <div className="flex flex-wrap gap-2">
              {isolatedEmployees.slice(0, 5).map((emp, i) => (
                <Badge key={i} variant="outline" className="border" style={{ borderColor: "var(--border-color)" }}>
                  {emp.name}
                </Badge>
              ))}
              {isolatedEmployees.length > 5 && (
                <Badge variant="outline" className="border" style={{ borderColor: "var(--border-color)" }}>
                  +{isolatedEmployees.length - 5} more
                </Badge>
              )}
            </div>
            <p className="text-xs mt-2" style={{ color: "var(--text-secondary)" }}>
              Simple interpretation: people with very few collaboration links often disengage faster. Assign cross-team work buddies and manager check-ins.
            </p>
          </div>
        )}

        {/* Statistics */}
        <div className="mt-4 grid grid-cols-4 gap-4">
          <div className="text-center p-3 rounded-lg border" style={{ backgroundColor: "var(--bg-secondary)", borderColor: "var(--border-color)" }}>
            <p className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
              {filteredGraph.nodes.length}
            </p>
            <p className="text-xs text-muted-foreground">Total Employees</p>
          </div>
          <div className="text-center p-3 rounded-lg border" style={{ backgroundColor: "var(--bg-secondary)", borderColor: "var(--border-color)" }}>
            <p className="text-2xl font-bold" style={{ color: "var(--accent-primary)" }}>
              {filteredGraph.links.length}
            </p>
            <p className="text-xs text-muted-foreground">Connections</p>
          </div>
          <div className="text-center p-3 rounded-lg border" style={{ backgroundColor: "var(--bg-secondary)", borderColor: "var(--border-color)" }}>
            <p className="text-2xl font-bold" style={{ color: "var(--alert-critical)" }}>
              {isolatedEmployees.length}
            </p>
            <p className="text-xs text-muted-foreground">Low Exposure (≤2 links)</p>
          </div>
          <div className="text-center p-3 rounded-lg border" style={{ backgroundColor: "var(--bg-secondary)", borderColor: "var(--border-color)" }}>
            <p className="text-2xl font-bold text-green-600">
              {filteredGraph.nodes.length > 0 ? (filteredGraph.links.length / filteredGraph.nodes.length).toFixed(1) : "0.0"}
            </p>
            <p className="text-xs text-muted-foreground">Avg Connections/Person</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
