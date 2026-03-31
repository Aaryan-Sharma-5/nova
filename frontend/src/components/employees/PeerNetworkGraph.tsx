import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import { generateNetworkData, NetworkNode, NetworkLink } from "@/utils/mockAnalyticsData";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import html2canvas from "html2canvas";

export default function PeerNetworkGraph() {
  const svgRef = useRef<SVGSVGElement>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  const [selectedDept, setSelectedDept] = useState<string>("all");
  const [hoveredNode, setHoveredNode] = useState<NetworkNode | null>(null);
  const { nodes, links } = generateNetworkData();

  const metrics = (() => {
    const connectionCount = new Map<string, number>();
    const weightedConnections = new Map<string, number>();
    const neighborWeights = new Map<string, number[]>();

    nodes.forEach(n => {
      connectionCount.set(n.id, 0);
      weightedConnections.set(n.id, 0);
      neighborWeights.set(n.id, []);
    });

    links.forEach(l => {
      const sourceId = typeof l.source === 'string' ? l.source : (l.source as any).id;
      const targetId = typeof l.target === 'string' ? l.target : (l.target as any).id;
      const strength = typeof (l as any).strength === 'number' ? (l as any).strength : 1;

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

    nodes.forEach(node => {
      const degree = connectionCount.get(node.id) || 0;
      const centralityScore = degree / maxConnections;
      centrality.set(node.id, centralityScore);

      const weights = neighborWeights.get(node.id) || [];
      const totalWeight = weights.reduce((sum, value) => sum + value, 0) || 1;
      const distribution = weights.map(weight => weight / totalWeight);
      const entropyScore = distribution.length
        ? -distribution.reduce((sum, p) => sum + p * Math.log2(p), 0) / Math.log2(distribution.length)
        : 0;
      entropy.set(node.id, entropyScore);

      const sentimentRisk = 1 - node.sentiment / 100;
      const propagationScore = Math.min(1, centralityScore * (0.7 + sentimentRisk * 0.6));
      propagationRisk.set(node.id, propagationScore);
    });

    return { connectionCount, weightedConnections, centrality, entropy, propagationRisk };
  })();

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

    // Filter nodes and links based on selected department
    const filteredNodes = selectedDept === "all" 
      ? nodes 
      : nodes.filter(n => n.department === selectedDept);
    
    const filteredNodeIds = new Set(filteredNodes.map(n => n.id));
    const filteredLinks = links.filter(l => 
      filteredNodeIds.has(l.source as string) && filteredNodeIds.has(l.target as string)
    );

    // Clear previous content
    d3.select(svgRef.current).selectAll("*").remove();

    const svg = d3.select(svgRef.current)
      .attr("width", width)
      .attr("height", height)
      .attr("viewBox", `0 0 ${width} ${height}`);

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
    const link = svg.append("g")
      .attr("class", "links")
      .selectAll("line")
      .data(filteredLinks)
      .enter().append("line")
      .attr("stroke", "#94a3b8")
      .attr("stroke-opacity", (d: any) => d.strength)
      .attr("stroke-width", (d: any) => Math.sqrt(d.strength) * 3)
      .attr("marker-end", "url(#arrowhead)");

    // Create node groups
    const node = svg.append("g")
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
        if (risk >= 0.66) return "#ef4444";
        if (risk >= 0.33) return "#eab308";
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
      .text((d: any) => d.name)
      .attr("x", 0)
      .attr("y", (d: any) => -(15 + (d.influence / 100) * 20))
      .attr("text-anchor", "middle")
      .attr("font-size", "11px")
      .attr("font-weight", "500")
      .attr("fill", "#1f2937");

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
  }, [selectedDept, nodes, links]);

  // Calculate isolated employees (low connectivity)
  const calculateIsolatedEmployees = () => {
    return nodes.filter(n => (metrics.connectionCount.get(n.id) || 0) <= 2);
  };

  const isolatedEmployees = calculateIsolatedEmployees();

  return (
    <Card className="col-span-4">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Peer Collaboration Network</CardTitle>
        <div className="flex items-center gap-2">
          <Select value={selectedDept} onValueChange={setSelectedDept}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Select department" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Departments</SelectItem>
              <SelectItem value="Engineering">Engineering</SelectItem>
              <SelectItem value="Sales">Sales</SelectItem>
              <SelectItem value="Marketing">Marketing</SelectItem>
              <SelectItem value="Operations">Operations</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div ref={chartRef} className="relative">
          {/* Legend */}
          <div className="absolute top-4 left-4 bg-white/90 backdrop-blur p-3 rounded-lg border shadow-sm z-10">
            <p className="text-xs font-semibold mb-2">Node Size = Influence</p>
            <p className="text-xs font-semibold mb-2">Color = Propagation Risk</p>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-green-500"></div>
                <span className="text-xs">Low Risk</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                <span className="text-xs">Medium Risk</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500"></div>
                <span className="text-xs">High Risk</span>
              </div>
            </div>
          </div>

          {/* Hovered node info */}
          {hoveredNode && (
            <div className="absolute top-4 right-4 bg-white border p-3 rounded-lg shadow-lg z-10">
              <p className="font-semibold">{hoveredNode.name}</p>
              <p className="text-sm text-muted-foreground">{hoveredNode.department}</p>
              <div className="mt-2 space-y-1">
                <div className="flex justify-between gap-4 text-sm">
                  <span>Influence:</span>
                  <span className="font-medium">{hoveredNode.influence.toFixed(0)}</span>
                </div>
                <div className="flex justify-between gap-4 text-sm">
                  <span>Sentiment:</span>
                  <span className="font-medium">{hoveredNode.sentiment.toFixed(0)}%</span>
                </div>
                <div className="flex justify-between gap-4 text-sm">
                  <span>Centrality:</span>
                  <span className="font-medium">
                    {Math.round((metrics.centrality.get(hoveredNode.id) || 0) * 100)}%
                  </span>
                </div>
                <div className="flex justify-between gap-4 text-sm">
                  <span>Collab entropy:</span>
                  <span className="font-medium">
                    {Math.round((metrics.entropy.get(hoveredNode.id) || 0) * 100)}%
                  </span>
                </div>
                <div className="flex justify-between gap-4 text-sm">
                  <span>Propagation risk:</span>
                  <span className="font-medium">
                    {Math.round((metrics.propagationRisk.get(hoveredNode.id) || 0) * 100)}%
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* D3 SVG */}
          <div className="bg-gray-50 rounded-lg p-4 border">
            <svg ref={svgRef}></svg>
          </div>
        </div>

        {/* Isolated Employees Alert */}
        {isolatedEmployees.length > 0 && (
          <div className="mt-4 p-3 bg-orange-50 border border-orange-200 rounded-md">
            <p className="text-sm font-semibold text-orange-800 mb-2">
              ⚠️ {isolatedEmployees.length} Isolated Employees Detected (Flight Risk Signal)
            </p>
            <div className="flex flex-wrap gap-2">
              {isolatedEmployees.slice(0, 5).map((emp, i) => (
                <Badge key={i} variant="outline" className="text-orange-700 border-orange-300">
                  {emp.name}
                </Badge>
              ))}
              {isolatedEmployees.length > 5 && (
                <Badge variant="outline" className="text-orange-700 border-orange-300">
                  +{isolatedEmployees.length - 5} more
                </Badge>
              )}
            </div>
            <p className="text-xs text-orange-700 mt-2">
              Low connectivity correlates with increased attrition risk. Consider team-building initiatives.
            </p>
          </div>
        )}

        {/* Statistics */}
        <div className="mt-4 grid grid-cols-4 gap-4">
          <div className="text-center p-3 bg-gray-50 rounded-lg">
            <p className="text-2xl font-bold text-gray-900">
              {nodes.length}
            </p>
            <p className="text-xs text-muted-foreground">Total Employees</p>
          </div>
          <div className="text-center p-3 bg-gray-50 rounded-lg">
            <p className="text-2xl font-bold text-blue-600">
              {links.length}
            </p>
            <p className="text-xs text-muted-foreground">Connections</p>
          </div>
          <div className="text-center p-3 bg-gray-50 rounded-lg">
            <p className="text-2xl font-bold text-orange-600">
              {isolatedEmployees.length}
            </p>
            <p className="text-xs text-muted-foreground">Isolated (≤2 connections)</p>
          </div>
          <div className="text-center p-3 bg-gray-50 rounded-lg">
            <p className="text-2xl font-bold text-green-600">
              {(links.length / nodes.length).toFixed(1)}
            </p>
            <p className="text-xs text-muted-foreground">Avg Connections/Person</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
