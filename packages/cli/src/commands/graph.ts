/**
 * `lore graph` - write a self-contained HTML graph of the wiki.
 *
 * Nodes are ADRs; edges are `supersedes` links and shared tags. No dependencies,
 * no server: one file you can open in a browser (or screenshot for a slide).
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { LORE_PATHS, createStore } from "@lore/core";

interface Node {
  id: string;
  title: string;
  status: string;
  tags: string[];
}
interface Edge {
  from: string;
  to: string;
  kind: "supersedes" | "tag";
}

const STYLE = [
  "body{background:#0f1115;color:#e6e6e6;font:14px/1.5 ui-sans-serif,system-ui,sans-serif;margin:0}",
  "header{padding:16px 20px;border-bottom:1px solid #262b36}",
  "h1{font-size:16px;margin:0 0 4px}",
  "small{color:#8b93a7}",
  "svg{width:100vw;height:calc(100vh - 76px)}",
  ".node circle{stroke:#0f1115;stroke-width:2;cursor:pointer}",
  ".node text{fill:#cfd6e4;font-size:11px;pointer-events:none}",
  ".edge{stroke:#39415a;stroke-width:1}",
  ".edge.supersedes{stroke:#e0a458;stroke-width:2;stroke-dasharray:5 4}",
  ".accepted circle{fill:#3d7d5a}",
  ".draft circle{fill:#6b6f3a}",
  ".superseded circle{fill:#5a3d3d}",
];

function buildHtml(nodes: Node[], edges: Edge[]): string {
  const data = JSON.stringify({ nodes, edges });
  const script = [
    "const data = " + data + ";",
    "const svg = document.getElementById('g');",
    "const W = () => svg.clientWidth || 1200;",
    "const H = () => svg.clientHeight || 700;",
    "const byTag = {};",
    "data.nodes.forEach(n => { const t = (n.tags && n.tags[0]) || 'misc'; (byTag[t] = byTag[t] || []).push(n); });",
    "const groups = Object.keys(byTag);",
    "data.nodes.forEach(n => {",
    "  const t = (n.tags && n.tags[0]) || 'misc';",
    "  const gi = groups.indexOf(t);",
    "  const ga = (gi / Math.max(1, groups.length)) * Math.PI * 2;",
    "  const inner = byTag[t].indexOf(n);",
    "  const r = 120 + (inner % 4) * 60;",
    "  n.x = W()/2 + Math.cos(ga) * r;",
    "  n.y = H()/2 + Math.sin(ga) * r;",
    "});",
    "for (let i=0;i<200;i++){",
    "  data.edges.forEach(e => {",
    "    const a = data.nodes.find(n => n.id === e.from), b = data.nodes.find(n => n.id === e.to);",
    "    if (!a || !b) return;",
    "    const dx = b.x-a.x, dy = b.y-a.y, d = Math.max(1, Math.hypot(dx,dy));",
    "    const f = (d - 150) * 0.002;",
    "    a.x += dx*f; a.y += dy*f; b.x -= dx*f; b.y -= dy*f;",
    "  });",
    "  for (let i=0;i<data.nodes.length;i++) for (let j=i+1;j<data.nodes.length;j++){",
    "    const a=data.nodes[i], b=data.nodes[j];",
    "    const dx=b.x-a.x, dy=b.y-a.y, d=Math.max(1,Math.hypot(dx,dy));",
    "    if (d > 320) continue;",
    "    const f = (320-d)/d * 0.02;",
    "    a.x -= dx*f; a.y -= dy*f; b.x += dx*f; b.y += dy*f;",
    "  }",
    "}",
    "const NS='http://www.w3.org/2000/svg';",
    "function el(t,a){const e=document.createElementNS(NS,t);for(const k in a)e.setAttribute(k,a[k]);return e;}",
    "data.edges.forEach(e=>{",
    "  const a=data.nodes.find(n=>n.id===e.from), b=data.nodes.find(n=>n.id===e.to);",
    "  if(!a||!b) return;",
    "  const line=el('line',{x1:a.x,y1:a.y,x2:b.x,y2:b.y,class:'edge '+e.kind});",
    "  line.appendChild(el('title',{})).textContent=e.from+' '+e.kind+' '+e.to;",
    "  svg.appendChild(line);",
    "});",
    "data.nodes.forEach(n=>{",
    "  const g=el('g',{class:'node '+n.status});",
    "  const c=el('circle',{cx:n.x,cy:n.y,r:14});",
    "  c.appendChild(el('title',{})).textContent=n.id+': '+n.title;",
    "  g.appendChild(c);",
    "  const t=el('text',{x:n.x+20,y:n.y+4});",
    "  t.textContent=n.id+' '+n.title.slice(0,42);",
    "  g.appendChild(t);",
    "  svg.appendChild(g);",
    "});",
  ].join("\n");

  return [
    "<!doctype html>",
    '<html><head><meta charset="utf-8"><title>Lore wiki graph</title>',
    "<style>" + STYLE.join("\n") + "</style></head>",
    "<body>",
    "<header><h1>Lore — decision graph</h1>",
    "<small>" +
      nodes.length +
      " ADRs · solid lines = shared tags · dashed lines = supersedes · hover a node for its title</small></header>",
    '<svg id="g"></svg>',
    "<script>" + script + "</script>",
    "</body></html>",
  ].join("\n");
}

export async function run(_args: string[]): Promise<void> {
  const store = createStore(process.cwd());
  const adrs = [...store.listAdrs("wiki"), ...store.listAdrs("drafts")];

  if (adrs.length === 0) {
    process.stdout.write("lore: the wiki is empty - nothing to graph yet\n");
    return;
  }

  const nodes: Node[] = adrs.map((a) => ({
    id: a.id,
    title: a.title,
    status: a.status,
    tags: a.tags,
  }));

  const edges: Edge[] = [];
  for (const a of adrs) {
    const body = store.readAdr(a.id)?.body ?? "";
    const supersededBy = /superseded by (ADR-\d+)/i.exec(body);
    if (supersededBy?.[1]) edges.push({ from: a.id, to: supersededBy[1], kind: "supersedes" });
  }
  for (let i = 0; i < adrs.length; i += 1) {
    for (let j = i + 1; j < adrs.length; j += 1) {
      const left = adrs[i];
      const right = adrs[j];
      if (!left || !right) continue;
      if (left.tags.some((tag) => right.tags.includes(tag))) {
        edges.push({ from: left.id, to: right.id, kind: "tag" });
      }
    }
  }

  const out = join(process.cwd(), LORE_PATHS.wiki, "graph.html");
  writeFileSync(out, buildHtml(nodes, edges), "utf8");
  process.stdout.write(
    `lore: wrote ${out} (${nodes.length} node(s), ${edges.length} link(s)) — open it in a browser\n`,
  );
}
