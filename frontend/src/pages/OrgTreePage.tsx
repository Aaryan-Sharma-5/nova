import { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { Search, Loader2, AlertTriangle, Home } from 'lucide-react';
import { useOrgHierarchy, type OrgNode } from '@/hooks/useOrgHierarchy';
import NodeDetailPopover from '@/components/org/NodeDetailPopover';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

const DEPT_COLORS: Record<string, string> = {
  Engineering: '#3b82f6',
  Sales: '#f97316',
  HR: '#ec4899',
  Design: '#8b5cf6',
  Finance: '#14b8a6',
};

const NODE_WIDTH = 160;
const NODE_HEIGHT = 72;
const H_SPACING = 40;
const V_SPACING = 60;

type D3Node = d3.HierarchyPointNode<OrgNode>;

type PopoverState = {
  node: OrgNode;
  x: number;
  y: number;
} | null;

function allNodeIds(root: OrgNode, predicate?: (n: OrgNode) => boolean): Set<string> {
  const ids = new Set<string>();
  const walk = (n: OrgNode) => {
    if (!predicate || predicate(n)) ids.add(n.id);
    n.children.forEach(walk);
  };
  walk(root);
  return ids;
}

function findNodeByName(root: OrgNode, query: string): OrgNode | null {
  const lower = query.toLowerCase();
  let found: OrgNode | null = null;
  const walk = (n: OrgNode) => {
    if (found) return;
    if (n.name.toLowerCase().includes(lower)) {
      found = n;
      return;
    }
    n.children.forEach(walk);
  };
  walk(root);
  return found;
}

function ancestorIds(root: OrgNode, targetId: string): Set<string> {
  const ids = new Set<string>();
  const walk = (n: OrgNode, path: string[]): boolean => {
    if (n.id === targetId) {
      path.forEach((id) => ids.add(id));
      return true;
    }
    for (const child of n.children) {
      if (walk(child, [...path, n.id])) return true;
    }
    return false;
  };
  walk(root, []);
  return ids;
}

function nodeBorderColor(node: OrgNode, riskOverlay: boolean): string {
  if (!riskOverlay) return '#94a3b8';
  if (node.is_at_risk) return '#ef4444';
  if (node.engagement_score < 0.5) return '#f59e0b';
  return '#22c55e';
}

function nodeFillColor(node: OrgNode, riskOverlay: boolean, highlighted: boolean): string {
  if (highlighted) return '#FFF9D6';
  if (!riskOverlay) return '#f8fafc';
  if (node.is_at_risk) return '#fef2f2';
  return '#ffffff';
}

export default function OrgTreePage() {
  useDocumentTitle('NOVA — Org Tree');
  const [rootId, setRootId] = useState<string | null>(null);
  const { data, stats, loading, error } = useOrgHierarchy(rootId);
  const svgRef = useRef<SVGSVGElement>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [riskOverlay, setRiskOverlay] = useState(true);
  const [deptFilter, setDeptFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [popover, setPopover] = useState<PopoverState>(null);

  // Default collapse state: expand levels 1-2, collapse level 3+.
  useEffect(() => {
    if (!data) return;
    const toCollapse = allNodeIds(data, (n) => n.org_level >= 3 && n.children.length > 0);
    setCollapsed(toCollapse);
  }, [data]);

  const visibleTree = useMemo<OrgNode | null>(() => {
    if (!data) return null;
    const prune = (node: OrgNode): OrgNode => {
      const children =
        collapsed.has(node.id) || !node.children ? [] : node.children.map(prune);
      return { ...node, children };
    };
    const pruned = prune(data);
    if (deptFilter !== 'all') {
      const keepIds = new Set<string>();
      const walk = (n: OrgNode): boolean => {
        let keep = n.department === deptFilter;
        const filteredChildren: OrgNode[] = [];
        for (const child of n.children) {
          if (walk(child)) {
            filteredChildren.push(child);
            keep = true;
          }
        }
        n.children = filteredChildren;
        if (keep) keepIds.add(n.id);
        return keep;
      };
      walk(pruned);
    }
    return pruned;
  }, [data, collapsed, deptFilter]);

  const toggleNode = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleExpandAll = () => setCollapsed(new Set());
  const handleCollapseAll = () => {
    if (!data) return;
    const all = allNodeIds(data, (n) => n.children.length > 0 && n.org_level >= 2);
    setCollapsed(all);
  };

  const handleSearch = () => {
    if (!data || !searchQuery.trim()) {
      setHighlightedId(null);
      return;
    }
    const found = findNodeByName(data, searchQuery.trim());
    if (!found) {
      setHighlightedId(null);
      return;
    }
    setHighlightedId(found.id);
    // Expand ancestors so the match is visible.
    const ancestors = ancestorIds(data, found.id);
    setCollapsed((prev) => {
      const next = new Set(prev);
      ancestors.forEach((id) => next.delete(id));
      return next;
    });
  };

  useEffect(() => {
    if (!svgRef.current || !visibleTree) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const width = 1100;
    const height = 700;
    svg.attr('viewBox', `0 0 ${width} ${height}`).style('touch-action', 'none');

    const zoomLayer = svg.append('g').attr('class', 'zoom-layer');
    const contentLayer = zoomLayer.append('g').attr('class', 'content-layer');

    svg.call(
      d3
        .zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.3, 2])
        .on('zoom', (event) => {
          zoomLayer.attr('transform', event.transform.toString());
        }),
    );

    const root = d3.hierarchy<OrgNode>(visibleTree);
    const treeLayout = d3
      .tree<OrgNode>()
      .nodeSize([NODE_WIDTH + H_SPACING, NODE_HEIGHT + V_SPACING]);
    treeLayout(root);

    const nodes = root.descendants() as D3Node[];
    const links = root.links();

    const minX = d3.min(nodes, (n) => n.x) ?? 0;
    const offsetX = width / 2 - (minX + (d3.max(nodes, (n) => n.x) ?? 0) - minX) / 2;

    contentLayer.attr('transform', `translate(${offsetX}, 40)`);

    // Draw elbow connectors.
    const linkGen = d3
      .linkVertical<d3.HierarchyPointLink<OrgNode>, D3Node>()
      .x((d) => d.x)
      .y((d) => d.y + NODE_HEIGHT / 2);

    contentLayer
      .append('g')
      .attr('class', 'links')
      .selectAll('path')
      .data(links)
      .enter()
      .append('path')
      .attr('d', (d) => linkGen(d as unknown as d3.HierarchyPointLink<OrgNode>))
      .attr('fill', 'none')
      .attr('stroke', '#d1d5db')
      .attr('stroke-width', 1.5);

    const nodeGroup = contentLayer
      .append('g')
      .attr('class', 'nodes')
      .selectAll('g')
      .data(nodes)
      .enter()
      .append('g')
      .attr('transform', (d) => `translate(${d.x - NODE_WIDTH / 2}, ${d.y})`)
      .style('cursor', 'pointer');

    nodeGroup
      .append('rect')
      .attr('width', NODE_WIDTH)
      .attr('height', NODE_HEIGHT)
      .attr('rx', 8)
      .attr('fill', (d) =>
        nodeFillColor(d.data, riskOverlay, d.data.id === highlightedId),
      )
      .attr('stroke', (d) =>
        d.data.id === highlightedId ? '#FFE500' : nodeBorderColor(d.data, riskOverlay),
      )
      .attr('stroke-width', (d) => (d.data.id === highlightedId ? 3 : 2))
      .on('click', (event, d) => {
        event.stopPropagation();
        const bbox = svgRef.current!.getBoundingClientRect();
        const pt = svgRef.current!.createSVGPoint();
        pt.x = event.clientX;
        pt.y = event.clientY;
        const localX = pt.x - bbox.left + 12;
        const localY = pt.y - bbox.top + 12;
        setPopover({ node: d.data, x: localX, y: localY });
      });

    nodeGroup
      .append('text')
      .attr('x', 10)
      .attr('y', 22)
      .attr('font-size', '14px')
      .attr('font-weight', '700')
      .attr('fill', '#0f172a')
      .text((d) =>
        d.data.name.length > 18 ? `${d.data.name.slice(0, 17)}…` : d.data.name,
      );

    nodeGroup
      .append('text')
      .attr('x', 10)
      .attr('y', 40)
      .attr('font-size', '12px')
      .attr('fill', '#64748b')
      .text((d) => (d.data.role.length > 20 ? `${d.data.role.slice(0, 19)}…` : d.data.role));

    nodeGroup
      .append('rect')
      .attr('x', 10)
      .attr('y', 50)
      .attr('width', (d) => d.data.department.length * 6 + 12)
      .attr('height', 14)
      .attr('rx', 3)
      .attr('fill', (d) => DEPT_COLORS[d.data.department] ?? '#64748b');

    nodeGroup
      .append('text')
      .attr('x', 16)
      .attr('y', 60)
      .attr('font-size', '9px')
      .attr('font-weight', '700')
      .attr('fill', '#fff')
      .text((d) => d.data.department.toUpperCase());

    // Collapse/expand toggle at the bottom center of the card for nodes with
    // children in the underlying tree (check against original data).
    const hasChildrenInOriginal = (id: string) => {
      let result = false;
      const walk = (n: OrgNode) => {
        if (n.id === id) {
          result = n.children.length > 0;
          return;
        }
        n.children.forEach(walk);
      };
      if (data) walk(data);
      return result;
    };

    nodeGroup
      .filter((d) => hasChildrenInOriginal(d.data.id))
      .append('g')
      .attr('class', 'toggle')
      .attr('transform', `translate(${NODE_WIDTH / 2}, ${NODE_HEIGHT})`)
      .style('cursor', 'pointer')
      .on('click', (event, d) => {
        event.stopPropagation();
        toggleNode(d.data.id);
      })
      .call((g) => {
        g.append('circle')
          .attr('r', 10)
          .attr('fill', '#fff')
          .attr('stroke', '#1A1A1A')
          .attr('stroke-width', 2);
        g.append('text')
          .attr('text-anchor', 'middle')
          .attr('dominant-baseline', 'middle')
          .attr('font-size', '10px')
          .attr('font-weight', '700')
          .text((d: any) => (collapsed.has(d.data.id) ? '▶' : '▼'));
      });
  }, [visibleTree, riskOverlay, highlightedId, data, collapsed]);

  const departments = useMemo(() => {
    if (!data) return [] as string[];
    const s = new Set<string>();
    const walk = (n: OrgNode) => {
      s.add(n.department);
      n.children.forEach(walk);
    };
    walk(data);
    return Array.from(s).sort();
  }, [data]);

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-2 text-center">
        <AlertTriangle className="h-8 w-8 text-[#FF1744]" />
        <p className="text-sm font-bold">Unable to load hierarchy</p>
        <p className="text-xs text-muted-foreground">{error ?? 'Unknown error'}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="border-2 border-foreground shadow-[4px_4px_0px_#000] bg-card">
        <div className="flex flex-wrap items-center gap-3 border-b-2 border-foreground p-3">
          <div className="flex-1 min-w-[200px]">
            <h2 className="text-base font-bold font-heading uppercase tracking-wider">
              Organizational Hierarchy
            </h2>
            {stats && (
              <p className="text-[10px] text-muted-foreground">
                Total levels: {stats.total_levels} | Avg span:{' '}
                {stats.avg_span_of_control} | Managers: {stats.managers_count}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSearch();
              }}
              placeholder="Find employee..."
              className="h-8 w-48 border-2 border-foreground"
            />
            <Button
              type="button"
              size="sm"
              className="h-8 border-2 border-foreground bg-[#FFE500] text-foreground font-bold shadow-[2px_2px_0px_#000]"
              onClick={handleSearch}
            >
              Find
            </Button>
          </div>

          <Select value={deptFilter} onValueChange={setDeptFilter}>
            <SelectTrigger className="h-8 w-44 border-2 border-foreground">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Departments</SelectItem>
              {departments.map((dept) => (
                <SelectItem key={dept} value={dept}>
                  {dept}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider">Risk</span>
            <Switch checked={riskOverlay} onCheckedChange={setRiskOverlay} />
          </div>

          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 border-2 border-foreground font-bold"
            onClick={handleExpandAll}
          >
            Expand All
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 border-2 border-foreground font-bold"
            onClick={handleCollapseAll}
          >
            Collapse All
          </Button>
          {rootId && (
            <Button
              type="button"
              size="sm"
              className="h-8 border-2 border-foreground bg-[#FFE500] font-bold shadow-[2px_2px_0px_#000]"
              onClick={() => setRootId(null)}
            >
              <Home className="mr-1 h-3 w-3" /> Root
            </Button>
          )}
        </div>

        <div className="relative bg-[#f8fafc]">
          <svg ref={svgRef} className="h-[700px] w-full" />
          {popover && (
            <NodeDetailPopover
              node={popover.node}
              x={popover.x}
              y={popover.y}
              onClose={() => setPopover(null)}
              onViewSubtree={(id) => {
                setRootId(id);
                setPopover(null);
              }}
              onScheduleOneOnOne={() => {
                setPopover(null);
                // Wire into the 1:1 scheduler when the modal exists; for now,
                // a lightweight acknowledgement keeps the action non-silent.
                window.alert('1:1 scheduler will open here.');
              }}
            />
          )}
        </div>
      </Card>
    </div>
  );
}
