import { useEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { protectedGetApi } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useEmployees } from "@/contexts/EmployeeContext";
import { useNavigate } from "react-router-dom";
import type { ExpandOrgNodeDetail } from "@/lib/agentBus";

type OrgNode = {
  employee_id: string;
  name: string;
  department: string;
  title: string;
  role?: string;
  reports_to?: string | null;
  org_level: number;
  children?: OrgNode[];
};

type OrgHierarchyResponse = {
  root: OrgNode;
  counts: Record<string, number>;
  total_employees: number;
};

function normalizeHierarchyPayload(payload: unknown): OrgHierarchyResponse | null {
  if (!payload || typeof payload !== "object") return null;

  const maybeWrapped = payload as Partial<OrgHierarchyResponse>;
  if (maybeWrapped.root && typeof maybeWrapped.root === "object") {
    return {
      root: maybeWrapped.root as OrgNode,
      counts: maybeWrapped.counts || { 1: 0, 2: 0, 3: 0, 4: 0 },
      total_employees: Number(maybeWrapped.total_employees || 0),
    };
  }

  const maybeRaw = payload as Partial<OrgNode>;
  if (typeof maybeRaw.employee_id === "string" && maybeRaw.employee_id.trim()) {
    return {
      root: maybeRaw as OrgNode,
      counts: { 1: 0, 2: 0, 3: 0, 4: 0 },
      total_employees: 0,
    };
  }

  return null;
}

type TreeMode = "focused" | "full";

const DEPARTMENT_OPTIONS = ["All", "Engineering", "Sales", "HR", "Design", "Finance", "Operations"] as const;
const NODE_WIDTH = 200;
const NODE_HEIGHT = 85;
const TREE_WIDTH = 1600;
const TREE_HEIGHT = 560;


function isNodeVisibleByDepartment(node: OrgNode, department: string): boolean {
  return department === "All" || node.department === department;
}

function findPath(root: OrgNode, targetId: string): string[] {
  const path: string[] = [];

  const visit = (node: OrgNode, ancestors: string[]): boolean => {
    const next = [...ancestors, node.employee_id];
    if (node.employee_id === targetId) {
      path.splice(0, path.length, ...next);
      return true;
    }
    for (const child of node.children || []) {
      if (visit(child, next)) {
        return true;
      }
    }
    return false;
  };

  visit(root, []);
  return path;
}

function findPathByName(root: OrgNode, query: string): string[] {
  const lowered = query.trim().toLowerCase();
  if (!lowered) return [];

  let matchPath: string[] = [];
  const visit = (node: OrgNode, ancestors: string[]): boolean => {
    const next = [...ancestors, node.employee_id];
    if (node.name.toLowerCase().includes(lowered)) {
      matchPath = next;
      return true;
    }
    for (const child of node.children || []) {
      if (visit(child, next)) {
        return true;
      }
    }
    return false;
  };

  visit(root, []);
  return matchPath;
}

function getRiskBorder(employee?: { burnoutRisk?: number; attritionRisk?: number }): string {
  const risk = Math.max(employee?.burnoutRisk ?? 0, employee?.attritionRisk ?? 0);
  if (risk >= 75) return "#ef4444";
  if (risk >= 50) return "#f59e0b";
  return "#22c55e";
}

function getRiskLabel(employee?: { burnoutRisk?: number; attritionRisk?: number }): string {
  const risk = Math.max(employee?.burnoutRisk ?? 0, employee?.attritionRisk ?? 0);
  return risk >= 60 ? "At risk" : "Stable";
}

function levelStyles(level: number): { fill: string; border: string; text: string } {
  if (level === 1) return { fill: "#fffbe6", border: "#F5C518", text: "#111827" };
  if (level === 2) return { fill: "#1d4ed8", border: "#60a5fa", text: "#ffffff" };
  if (level === 3) return { fill: "#334155", border: "#64748b", text: "#ffffff" };
  return { fill: "#f9fafb", border: "#d1d5db", text: "#111827" };
}

function buildVisibleTree(node: OrgNode, collapsedNodeIds: Set<string>): OrgNode {
  const isCollapsed = collapsedNodeIds.has(node.employee_id);
  if (isCollapsed) {
    return { ...node, children: [] };
  }

  const visibleChildren = (node.children || []).map((child) => buildVisibleTree(child, collapsedNodeIds));
  return { ...node, children: visibleChildren };
}

function collectExpandableNodeIds(node: OrgNode): string[] {
  const ids: string[] = [];
  const walk = (current: OrgNode) => {
    if ((current.children || []).length > 0) {
      ids.push(current.employee_id);
      (current.children || []).forEach(walk);
    }
  };
  walk(node);
  return ids;
}

function buildChildCountMap(root: OrgNode): Map<string, number> {
  const map = new Map<string, number>();
  const walk = (node: OrgNode) => {
    const count = (node.children || []).length;
    map.set(node.employee_id, count);
    (node.children || []).forEach(walk);
  };
  walk(root);
  return map;
}



function visibleCount(node: OrgNode): number {
  return 1 + (node.children || []).reduce((sum, child) => sum + visibleCount(child), 0);
}

interface TreeCanvasProps {
  mode: TreeMode;
  hierarchy: OrgNode;
  counts: Record<string, number>;
  selectedDepartment: string;
  riskOverlay: boolean;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  onReset: () => void;
  onDepartmentChange: (value: string) => void;
  onToggleRiskOverlay: () => void;
  onOpenFullTree: () => void;
  onNavigateToProfile: (employeeId: string) => void;
}

function TreeCanvas({
  mode,
  hierarchy,
  counts,
  selectedDepartment,
  riskOverlay,
  searchQuery,
  onSearchQueryChange,
  onReset,
  onDepartmentChange,
  onToggleRiskOverlay,
  onOpenFullTree,
  onNavigateToProfile,
}: TreeCanvasProps) {
  const { employees } = useEmployees();
  const svgRef = useRef<SVGSVGElement>(null);
  const zoomLayerRef = useRef<SVGGElement>(null);
  const zoomBehaviorRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const [collapsedNodeIds, setCollapsedNodeIds] = useState<Set<string>>(new Set());
  const [selectedLeaf, setSelectedLeaf] = useState<{ node: OrgNode; x: number; y: number } | null>(null);
  const [pendingFocusNodeId, setPendingFocusNodeId] = useState<string | null>(null);

  const employeeMap = useMemo(() => new Map(employees.map((employee) => [employee.id, employee])), [employees]);
  const originalChildCountMap = useMemo(() => buildChildCountMap(hierarchy), [hierarchy]);

  const visibleTree = useMemo(() => {
    return buildVisibleTree(hierarchy, collapsedNodeIds);
  }, [collapsedNodeIds, hierarchy]);

  const hierarchyLayout = useMemo(() => {
    const root = d3.hierarchy(visibleTree, (node) => node.children || []);
    const tree = d3.tree<OrgNode>().nodeSize([240, 120]);
    tree(root);
    return root;
  }, [mode, visibleTree]);

  const nodes = hierarchyLayout.descendants();
  const links = hierarchyLayout.links();
  const nodeById = useMemo(
    () => new Map(nodes.map((node) => [node.data.employee_id, node])),
    [nodes],
  );
  const maxVisibleNodes = visibleCount(visibleTree);

  useEffect(() => {
    if (!svgRef.current || !zoomLayerRef.current) return;

    const svg = d3.select(svgRef.current);
    const zoomLayer = d3.select(zoomLayerRef.current);
    svg.selectAll(".zoom-listener").remove();

    const initialTransform = d3.zoomIdentity.translate(TREE_WIDTH / 2, 60).scale(0.9);
    const zoomBehavior = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.4, 2.5])
      .on("zoom", (event) => {
        zoomLayer.attr("transform", event.transform.toString());
      });

    zoomBehaviorRef.current = zoomBehavior;
    svg.call(zoomBehavior as any);
    svg.on("dblclick.zoom", null);
    svg.call(zoomBehavior.transform as any, initialTransform as any);

    return () => {
      svg.on(".zoom", null);
    };
  }, [visibleTree, mode]);

  useEffect(() => {
    if (!pendingFocusNodeId || !svgRef.current || !zoomBehaviorRef.current) return;
    const target = nodeById.get(pendingFocusNodeId);
    if (!target) return;

    const svg = d3.select(svgRef.current);
    const scale = 1;
    const targetTransform = d3.zoomIdentity
      .translate(TREE_WIDTH / 2 - target.x * scale, 120 - target.y * scale)
      .scale(scale);

    svg
      .transition()
      .duration(450)
      .call(zoomBehaviorRef.current.transform as any, targetTransform as any);

    setPendingFocusNodeId(null);
  }, [nodeById, pendingFocusNodeId]);

  useEffect(() => {
    const rootChildren = new Set((hierarchy.children || []).map((child) => child.employee_id));
    const allExpandable = collectExpandableNodeIds(hierarchy);
    const initiallyCollapsed = allExpandable.filter(
      (employeeId) => employeeId !== hierarchy.employee_id && !rootChildren.has(employeeId),
    );
    setCollapsedNodeIds(new Set(initiallyCollapsed));
    setSelectedLeaf(null);
  }, [hierarchy.employee_id, mode]);

  useEffect(() => {
    const onExpand = (event: Event) => {
      const detail = (event as CustomEvent<ExpandOrgNodeDetail>).detail;
      const employeeId = detail?.employeeId;
      if (!employeeId) return;
      const path = findPath(hierarchy, employeeId);
      if (path.length > 0) {
        setCollapsedNodeIds((previous) => {
          const next = new Set(previous);
          path.forEach((id) => next.delete(id));
          return next;
        });
        setSelectedLeaf(null);
      }
    };

    window.addEventListener("nova:expand-org-node", onExpand as EventListener);
    return () => window.removeEventListener("nova:expand-org-node", onExpand as EventListener);
  }, [hierarchy]);

  const handleFitToScreen = () => {
    if (!svgRef.current || !zoomBehaviorRef.current) return;
    const svg = d3.select(svgRef.current);
    const initialTransform = d3.zoomIdentity.translate(TREE_WIDTH / 2, 60).scale(0.9);
    svg.transition().duration(300).call(zoomBehaviorRef.current.transform as any, initialTransform as any);
  };

  const handleFindEmployee = () => {
    if (!searchQuery.trim()) return;
    const path = findPathByName(hierarchy, searchQuery);
    if (path.length > 0) {
      setCollapsedNodeIds((previous) => {
        const next = new Set(previous);
        path.forEach((id) => next.delete(id));
        return next;
      });
      setPendingFocusNodeId(path[path.length - 1]);
    }
  };

  const handleNodeClick = (node: d3.HierarchyPointNode<OrgNode>) => {
    const reportsCount = originalChildCountMap.get(node.data.employee_id) || 0;
    if (reportsCount > 0) {
      return;
    }

    const employee = employeeMap.get(node.data.employee_id);
    if (employee) {
      setSelectedLeaf({ node: node.data, x: node.x, y: node.y });
    }
  };

  const handleNodeDoubleClick = (node: d3.HierarchyPointNode<OrgNode>) => {
    const reportsCount = originalChildCountMap.get(node.data.employee_id) || 0;
    if (reportsCount <= 0) {
      return;
    }

    setCollapsedNodeIds((previous) => {
      const next = new Set(previous);
      if (next.has(node.data.employee_id)) {
        next.delete(node.data.employee_id);
      } else {
        next.add(node.data.employee_id);
      }
      return next;
    });
    setSelectedLeaf(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">Org Tree</h2>
          <p className="text-sm text-muted-foreground">Double-click a node to expand or collapse its team</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select value={selectedDepartment} onValueChange={onDepartmentChange}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Department filter" />
            </SelectTrigger>
            <SelectContent>
              {DEPARTMENT_OPTIONS.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Input
            value={searchQuery}
            onChange={(event) => onSearchQueryChange(event.target.value)}
            placeholder="Search employee name"
            className="w-[220px]"
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                handleFindEmployee();
              }
            }}
          />

          <Button variant="outline" onClick={handleFindEmployee}>Find</Button>
          <Button variant="outline" onClick={handleFitToScreen}>Fit to Screen</Button>

          <Button variant="outline" onClick={onToggleRiskOverlay}>
            {riskOverlay ? "Hide Risk Overlay" : "Show Risk Overlay"}
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              const rootChildren = new Set((hierarchy.children || []).map((child) => child.employee_id));
              const resetCollapsed = collectExpandableNodeIds(hierarchy).filter(
                (employeeId) => employeeId !== hierarchy.employee_id && !rootChildren.has(employeeId),
              );
              setCollapsedNodeIds(new Set(resetCollapsed));
              setSelectedLeaf(null);
              onReset();
            }}
          >
            Reset to Top Level
          </Button>
          <Button onClick={onOpenFullTree}>View Full Tree</Button>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 rounded-lg border bg-muted/30 px-4 py-2 text-sm">
        <div className="space-y-1">
          <div className="font-semibold tracking-wide text-muted-foreground">── Reporting Structure ──</div>
          <p className="text-xs text-muted-foreground">Showing direct reporting lines. Click nodes to explore teams.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-amber-500" />CEO ({counts[1] ?? 0})</span>
          <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-blue-500" />VPs ({counts[2] ?? 0})</span>
          <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-violet-500" />Managers ({counts[3] ?? 0})</span>
          <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-slate-400" />ICs ({counts[4] ?? 0})</span>
          <Badge variant="outline">Visible {maxVisibleNodes}</Badge>
        </div>
      </div>

      <div className="relative overflow-hidden rounded-xl border bg-background">
        <div className="px-4 py-3 text-xs text-amber-700 bg-amber-50 border-b md:hidden">
          Best viewed on desktop for full org hierarchy controls.
        </div>
        <svg ref={svgRef} className="h-[560px] w-full" viewBox={`0 0 ${TREE_WIDTH} ${TREE_HEIGHT}`} preserveAspectRatio="xMidYMid meet">
          <g ref={zoomLayerRef}>
            <g>
              {links.map((link) => {
                const sourceLevel = link.source.data.org_level;
                const targetLevel = link.target.data.org_level;
                const width = sourceLevel === 1 && targetLevel === 2 ? 2 : sourceLevel === 2 && targetLevel === 3 ? 1.5 : 1;
                return (
                  <path
                    key={`${link.source.data.employee_id}-${link.target.data.employee_id}`}
                    d={d3.linkVertical<d3.HierarchyPointLink<OrgNode>, d3.HierarchyPointNode<OrgNode>>()
                      .x((point) => point.x)
                      .y((point) => point.y)(link) || undefined}
                    fill="none"
                    stroke="#d1d5db"
                    strokeWidth={width}
                  />
                );
              })}

              {nodes.map((node) => {
                const styles = levelStyles(node.data.org_level);
                const employee = employeeMap.get(node.data.employee_id);
                const isHighlightedDepartment = isNodeVisibleByDepartment(node.data, selectedDepartment);
                const isSearchMatch = searchQuery.trim().length > 0 && node.data.name.toLowerCase().includes(searchQuery.trim().toLowerCase());
                const riskBorder = riskOverlay ? getRiskBorder(employee) : styles.border;
                const borderColor = isSearchMatch ? "#f5c518" : riskBorder;
                const opacity = selectedDepartment === "All" || isHighlightedDepartment ? 1 : 0.3;
                const riskLabel = getRiskLabel(employee);
                const chip = roleChip(node.data);
                const [titleLine1, titleLine2] = splitTitleLines(node.data.title || node.data.role || node.data.department);
                const reportsCount = originalChildCountMap.get(node.data.employee_id) || 0;
                const expanded = !collapsedNodeIds.has(node.data.employee_id);
                const nameFontSize = node.data.name.length > 18 ? 13 : 14;

                return (
                  <g
                    key={node.data.employee_id}
                    transform={`translate(${node.x - NODE_WIDTH / 2}, ${node.y - NODE_HEIGHT / 2})`}
                    style={{ cursor: reportsCount > 0 ? "pointer" : "default", opacity }}
                    onClick={() => handleNodeClick(node)}
                    onDoubleClick={() => handleNodeDoubleClick(node)}
                  >
                    <title>{node.data.name}</title>
                    <rect
                      width={NODE_WIDTH}
                      height={NODE_HEIGHT}
                      rx="8"
                      fill={styles.fill}
                      stroke={borderColor}
                      strokeWidth={2}
                    />

                    <text x={NODE_WIDTH / 2} y="18" textAnchor="middle" fill={styles.text} fontSize={nameFontSize} fontWeight="700">
                      {node.data.name}
                    </text>
                    <text x={NODE_WIDTH / 2} y="35" textAnchor="middle" fill={styles.text} opacity={0.85} fontSize="12">
                      <tspan x={NODE_WIDTH / 2} dy="0">{titleLine1}</tspan>
                      {titleLine2 ? <tspan x={NODE_WIDTH / 2} dy="14">{titleLine2}</tspan> : null}
                    </text>

                    <rect x="16" y="56" width="124" height="22" rx="11" fill={chip.fill} fillOpacity={0.95} stroke={chip.stroke} strokeWidth="0.8" />
                    <text x="78" y="70" textAnchor="middle" fill={chip.textColor} fontSize="11" fontWeight="700">
                      {chip.label}
                    </text>

                    {reportsCount > 0 ? (
                      <>
                        <text
                          x={NODE_WIDTH / 2}
                          y={NODE_HEIGHT + 12}
                          textAnchor="middle"
                          fill="#94a3b8"
                          fontSize="10"
                          fontWeight="600"
                        >
                          {expanded ? "▲ collapse" : `▼ ${reportsCount} reports`}
                        </text>
                      </>
                    ) : (
                      <>
                        <circle cx="172" cy="60" r="5" fill={riskLabel === "At risk" ? "#ef4444" : "#22c55e"} />
                        <text x="153" y="76" textAnchor="middle" fill={styles.text} opacity={0.8} fontSize="10">
                          {riskLabel}
                        </text>
                      </>
                    )}
                  </g>
                );
              })}
            </g>
          </g>
        </svg>

        {selectedLeaf && (
          <div
            className="absolute z-20 w-64 rounded-lg border bg-background p-3 shadow-xl"
            style={{ left: Math.min(1200, Math.max(12, 800 + selectedLeaf.x - 90)), top: Math.max(12, 60 + selectedLeaf.y - 10) }}
          >
            <p className="text-sm font-semibold">{selectedLeaf.node.name}</p>
            <p className="text-xs text-muted-foreground">{selectedLeaf.node.title || selectedLeaf.node.role}</p>
            <p className="mt-2 text-xs text-muted-foreground">Department</p>
            <p className="text-sm font-medium">{selectedLeaf.node.department}</p>
            <p className="mt-2 text-xs text-muted-foreground">Tenure</p>
            <p className="text-sm font-medium">{employeeMap.get(selectedLeaf.node.employee_id)?.tenure ?? 0} months</p>
            <p className="mt-2 text-xs text-muted-foreground">Burnout risk</p>
            <Badge className={employeeMap.get(selectedLeaf.node.employee_id)?.burnoutRisk && employeeMap.get(selectedLeaf.node.employee_id)!.burnoutRisk >= 60 ? "bg-red-100 text-red-800" : "bg-emerald-100 text-emerald-800"}>
              {employeeMap.get(selectedLeaf.node.employee_id)?.burnoutRisk?.toFixed(0) ?? 0}%
            </Badge>
            <div className="mt-3 flex items-center justify-between gap-2">
              <Button variant="outline" size="sm" onClick={() => setSelectedLeaf(null)}>
                Close
              </Button>
              <Button size="sm" onClick={() => onNavigateToProfile(selectedLeaf.node.employee_id)}>
                View Full Profile →
              </Button>
            </div>
          </div>
        )}
      </div>

      {mode === "focused" && selectedDepartment !== "All" && (
        <p className="text-xs text-muted-foreground">
          Department filter active: nodes outside {selectedDepartment} are dimmed.
        </p>
      )}
    </div>
  );
}

type FocusedOrgTreeProps = {
  searchQuery?: string;
  onSearchQueryChange?: (value: string) => void;
  selectedDepartment?: string;
  onSelectedDepartmentChange?: (value: string) => void;
};

export default function FocusedOrgTree({
  searchQuery: externalSearchQuery,
  onSearchQueryChange,
  selectedDepartment: externalSelectedDepartment,
  onSelectedDepartmentChange,
}: FocusedOrgTreeProps = {}) {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [hierarchy, setHierarchy] = useState<OrgNode | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({ 1: 0, 2: 0, 3: 0, 4: 0 });
  const [internalSearchQuery, setInternalSearchQuery] = useState("");
  const [internalSelectedDepartment, setInternalSelectedDepartment] = useState<string>("All");
  const [riskOverlay, setRiskOverlay] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fullTreeOpen, setFullTreeOpen] = useState(false);

  const searchQuery = externalSearchQuery ?? internalSearchQuery;
  const setSearchQuery = onSearchQueryChange ?? setInternalSearchQuery;
  const selectedDepartment = externalSelectedDepartment ?? internalSelectedDepartment;
  const setSelectedDepartment = onSelectedDepartmentChange ?? setInternalSelectedDepartment;

  useEffect(() => {
    const loadHierarchy = async () => {
      if (!token) return;
      setLoading(true);
      try {
        const payload = await protectedGetApi<unknown>("/api/org/hierarchy", token);
        const normalized = normalizeHierarchyPayload(payload);
        if (!normalized) {
          setHierarchy(null);
          setCounts({ 1: 0, 2: 0, 3: 0, 4: 0 });
          return;
        }
        setHierarchy(normalized.root);
        setCounts(normalized.counts || { 1: 0, 2: 0, 3: 0, 4: 0 });
      } catch {
        setHierarchy(null);
      } finally {
        setLoading(false);
      }
    };

    void loadHierarchy();
  }, [token]);

  const root = hierarchy;

  if (loading) {
    return <div className="rounded-xl border p-6 text-sm text-muted-foreground">Loading org tree...</div>;
  }

  if (!root) {
    return <div className="rounded-xl border p-6 text-sm text-muted-foreground">Org tree is unavailable.</div>;
  }

  return (
    <>
      <TreeCanvas
        mode="focused"
        hierarchy={root}
        counts={counts}
        selectedDepartment={selectedDepartment}
        riskOverlay={riskOverlay}
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        onReset={() => setSearchQuery("")}
        onDepartmentChange={setSelectedDepartment}
        onToggleRiskOverlay={() => setRiskOverlay((value) => !value)}
        onOpenFullTree={() => setFullTreeOpen(true)}
        onNavigateToProfile={(employeeId) => navigate(`/employees/${employeeId}/profile`)}
      />

      <Dialog open={fullTreeOpen} onOpenChange={setFullTreeOpen}>
        <DialogContent className="max-w-[96vw] w-[96vw] p-4">
          <DialogHeader>
            <DialogTitle>Full Org Tree</DialogTitle>
          </DialogHeader>
          <div className="rounded-lg border bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Full-screen org tree view. Click any node to collapse or expand that team.
          </div>
          <div className="mt-4">
            <TreeCanvas
              mode="full"
              hierarchy={root}
              counts={counts}
              selectedDepartment={selectedDepartment}
              riskOverlay={riskOverlay}
              searchQuery={searchQuery}
              onSearchQueryChange={setSearchQuery}
              onReset={() => setSearchQuery("")}
              onDepartmentChange={setSelectedDepartment}
              onToggleRiskOverlay={() => setRiskOverlay((value) => !value)}
              onOpenFullTree={() => setFullTreeOpen(true)}
              onNavigateToProfile={(employeeId) => navigate(`/employees/${employeeId}/profile`)}
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function splitTitleLines(value: string): [string, string] {
  const text = (value || "").trim();
  if (!text) return ["", ""];
  if (text.length <= 28) return [text, ""];
  const words = text.split(/\s+/);
  if (words.length < 2) return [text.slice(0, 28), text.slice(28)];
  const mid = Math.ceil(words.length / 2);
  return [words.slice(0, mid).join(" "), words.slice(mid).join(" ")];
}

function roleChip(node: OrgNode): { label: string; fill: string; stroke: string; textColor: string } {
  if (node.org_level === 1) {
    return { label: "C-SUITE", fill: "#F5C518", stroke: "#111827", textColor: "#111827" };
  }
  if (node.org_level === 2) {
    return { label: `VP · ${node.department.toUpperCase()}`, fill: "#111827", stroke: "#111827", textColor: "#ffffff" };
  }
  const palette: Record<string, { fill: string; stroke: string; textColor: string }> = {
    Engineering: { fill: "#3b82f6", stroke: "#3b82f6", textColor: "#ffffff" },
    Sales: { fill: "#f59e0b", stroke: "#f59e0b", textColor: "#111827" },
    HR: { fill: "#8b5cf6", stroke: "#8b5cf6", textColor: "#ffffff" },
    Design: { fill: "#ec4899", stroke: "#ec4899", textColor: "#ffffff" },
    Finance: { fill: "#10b981", stroke: "#10b981", textColor: "#052e16" },
    Operations: { fill: "#06b6d4", stroke: "#06b6d4", textColor: "#083344" },
  };
  const style = palette[node.department] || { fill: "#f3f4f6", stroke: "#d1d5db", textColor: "#111827" };
  return {
    label: node.department,
    fill: style.fill,
    stroke: style.stroke,
    textColor: style.textColor,
  };
}