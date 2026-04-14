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

type TreeMode = "focused" | "full";

const DEPARTMENT_OPTIONS = ["All", "Engineering", "Sales", "HR", "Design", "Finance", "Operations"] as const;

const DEPARTMENT_BADGE_STYLES: Record<string, string> = {
  Engineering: "bg-sky-100 text-sky-900 border-sky-200",
  Sales: "bg-amber-100 text-amber-900 border-amber-200",
  HR: "bg-rose-100 text-rose-900 border-rose-200",
  Design: "bg-violet-100 text-violet-900 border-violet-200",
  Finance: "bg-emerald-100 text-emerald-900 border-emerald-200",
  Operations: "bg-slate-100 text-slate-900 border-slate-200",
};

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

function formatShortName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return fullName;
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

function levelStyles(level: number): { fill: string; border: string; text: string } {
  if (level === 1) return { fill: "#fffbe6", border: "#F5C518", text: "#111827" };
  if (level === 2) return { fill: "#111827", border: "#111827", text: "#ffffff" };
  if (level === 3) return { fill: "#374151", border: "#374151", text: "#ffffff" };
  return { fill: "#f9fafb", border: "#d1d5db", text: "#111827" };
}

function buildVisibleTree(node: OrgNode, pathIds: Set<string>, mode: TreeMode, rootId: string): OrgNode {
  if (mode === "full") {
    const visibleChildren = (node.children || [])
      .filter((child) => child.org_level <= 3)
      .map((child) => buildVisibleTree(child, pathIds, mode, rootId));
    return { ...node, children: visibleChildren };
  }

  const onPath = pathIds.has(node.employee_id);
  const shouldExpand = node.employee_id === rootId || (onPath && node.employee_id !== rootId && node.children && node.children.length > 0);
  const visibleChildren = shouldExpand
    ? (node.children || []).map((child) => buildVisibleTree(child, pathIds, mode, rootId))
    : [];
  return { ...node, children: visibleChildren };
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
  const [expandedPathIds, setExpandedPathIds] = useState<string[]>([hierarchy.employee_id]);
  const [selectedLeaf, setSelectedLeaf] = useState<{ node: OrgNode; x: number; y: number } | null>(null);

  const employeeMap = useMemo(() => new Map(employees.map((employee) => [employee.id, employee])), [employees]);

  const visibleTree = useMemo(() => {
    const pathIds = new Set(expandedPathIds);
    return buildVisibleTree(hierarchy, pathIds, mode, hierarchy.employee_id);
  }, [expandedPathIds, hierarchy, mode]);

  const hierarchyLayout = useMemo(() => {
    const root = d3.hierarchy(visibleTree, (node) => node.children || []);
    const tree = d3.tree<OrgNode>().nodeSize(mode === "full" ? [220, 150] : [240, 150]);
    tree(root);
    return root;
  }, [mode, visibleTree]);

  const nodes = hierarchyLayout.descendants();
  const links = hierarchyLayout.links();
  const maxVisibleNodes = visibleCount(visibleTree);

  useEffect(() => {
    if (!searchQuery.trim()) return;
    const path = findPathByName(hierarchy, searchQuery);
    if (path.length > 0) {
      setExpandedPathIds(path);
    }
  }, [hierarchy, searchQuery]);

  useEffect(() => {
    if (!svgRef.current || !zoomLayerRef.current) return;

    const svg = d3.select(svgRef.current);
    const zoomLayer = d3.select(zoomLayerRef.current);
    svg.selectAll(".zoom-listener").remove();

    const zoomBehavior = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.4, 2.5])
      .on("zoom", (event) => {
        zoomLayer.attr("transform", event.transform.toString());
      });

    svg.call(zoomBehavior as any);

    return () => {
      svg.on(".zoom", null);
    };
  }, [visibleTree, mode]);

  useEffect(() => {
    setExpandedPathIds([hierarchy.employee_id]);
    setSelectedLeaf(null);
  }, [hierarchy.employee_id, mode]);

  const handleNodeClick = (node: d3.HierarchyPointNode<OrgNode>) => {
    const children = node.data.children || [];
    if (children.length > 0) {
      if (expandedPathIds[expandedPathIds.length - 1] === node.data.employee_id) {
        const collapsed = expandedPathIds.slice(0, Math.max(1, expandedPathIds.length - 1));
        setExpandedPathIds(collapsed);
      } else {
        const path = findPath(hierarchy, node.data.employee_id);
        setExpandedPathIds(path.length > 0 ? path : [hierarchy.employee_id]);
      }
      setSelectedLeaf(null);
      return;
    }

    const employee = employeeMap.get(node.data.employee_id);
    if (employee) {
      setSelectedLeaf({ node: node.data, x: node.x, y: node.y });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">Organizational Hierarchy</h2>
          <p className="text-sm text-muted-foreground">Click any node to expand their team</p>
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
          />

          <Button variant="outline" onClick={onToggleRiskOverlay}>
            {riskOverlay ? "Hide Risk Overlay" : "Show Risk Overlay"}
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setExpandedPathIds([hierarchy.employee_id]);
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
          <span>👑 CEO ({counts[1] ?? 0})</span>
          <span>🔷 VPs ({counts[2] ?? 0})</span>
          <span>👔 Managers ({counts[3] ?? 0})</span>
          <span>👤 ICs ({counts[4] ?? 0})</span>
          <Badge variant="outline">Visible {maxVisibleNodes}</Badge>
        </div>
      </div>

      <div className="relative overflow-hidden rounded-xl border bg-background">
        <svg ref={svgRef} className="h-[500px] w-full" viewBox="0 0 1600 500" preserveAspectRatio="xMidYMid meet">
          <g ref={zoomLayerRef}>
            <g transform={`translate(800, 60)`}>
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
                const chipClass = DEPARTMENT_BADGE_STYLES[node.data.department] || "bg-muted text-foreground border-border";

                return (
                  <g
                    key={node.data.employee_id}
                    transform={`translate(${node.x - 90}, ${node.y - 40})`}
                    style={{ cursor: node.data.children && node.data.children.length > 0 ? "pointer" : "default", opacity }}
                    onClick={() => handleNodeClick(node)}
                  >
                    <rect
                      width="180"
                      height="80"
                      rx="8"
                      fill={styles.fill}
                      stroke={borderColor}
                      strokeWidth={2}
                    />

                    <text x="90" y="18" textAnchor="middle" fill={styles.text} fontSize="13" fontWeight="700">
                      {node.data.name}
                    </text>
                    <text x="90" y="35" textAnchor="middle" fill={styles.text} opacity={0.85} fontSize="11">
                      {node.data.title || node.data.role || node.data.department}
                    </text>

                    <rect x="18" y="46" width="96" height="20" rx="10" className={chipClass} fillOpacity={0.95} stroke="none" />
                    <text x="66" y="60" textAnchor="middle" fill={styles.text} fontSize="10" fontWeight="600">
                      {node.data.department}
                    </text>

                    <circle cx="152" cy="56" r="5" fill={riskLabel === "At risk" ? "#ef4444" : "#22c55e"} />
                    <text x="90" y="75" textAnchor="middle" fill={styles.text} opacity={0.8} fontSize="10">
                      {node.data.children && node.data.children.length > 0 ? `▼ ${node.data.children.length} reports` : riskLabel}
                    </text>
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

export default function FocusedOrgTree() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [hierarchy, setHierarchy] = useState<OrgNode | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({ 1: 0, 2: 0, 3: 0, 4: 0 });
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDepartment, setSelectedDepartment] = useState<string>("All");
  const [riskOverlay, setRiskOverlay] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fullTreeOpen, setFullTreeOpen] = useState(false);

  useEffect(() => {
    const loadHierarchy = async () => {
      if (!token) return;
      setLoading(true);
      try {
        const payload = await protectedGetApi<OrgHierarchyResponse>("/api/org/hierarchy", token);
        setHierarchy(payload.root);
        setCounts(payload.counts || { 1: 0, 2: 0, 3: 0, 4: 0 });
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
    return <div className="rounded-xl border p-6 text-sm text-muted-foreground">Loading organizational hierarchy...</div>;
  }

  if (!root) {
    return <div className="rounded-xl border p-6 text-sm text-muted-foreground">Organization hierarchy is unavailable.</div>;
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
            Loading full org tree... the default view keeps level 4 nodes collapsed for performance.
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