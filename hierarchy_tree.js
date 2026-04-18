/**
 * Looker Custom Visualization: D3 Hierarchy Tree
 *
 * How it works:
 * - Add any number of dimensions (EC1, EC2, EC3 ...) to your Look/Explore
 * - The vis reads them in order and builds a collapsible tree
 * - One optional measure drives node sizing / color intensity
 *
 * Drop this file in your Looker Custom Vis manifest or paste it into
 * the Looker Visualization IDE (Admin > Custom Vis).
 */

looker.plugins.visualizations.add({
  /* ─────────────────────────────────────────
     Vis metadata
  ───────────────────────────────────────── */
  id: "hierarchy_tree",
  label: "Hierarchy Tree (D3)",
  options: {
    color_root: {
      type: "string",
      label: "Root node color",
      display: "color",
      default: "#1B3A6B",
      section: "Style",
      order: 1,
    },
    color_branch: {
      type: "string",
      label: "Branch node color",
      display: "color",
      default: "#0078D4",
      section: "Style",
      order: 2,
    },
    color_leaf: {
      type: "string",
      label: "Leaf node color",
      display: "color",
      default: "#00B4A0",
      section: "Style",
      order: 3,
    },
    node_size: {
      type: "number",
      label: "Node radius (px)",
      display: "range",
      min: 4,
      max: 20,
      step: 1,
      default: 8,
      section: "Style",
      order: 4,
    },
    link_color: {
      type: "string",
      label: "Link color",
      display: "color",
      default: "#CCCCCC",
      section: "Style",
      order: 5,
    },
    font_size: {
      type: "number",
      label: "Label font size",
      display: "range",
      min: 9,
      max: 18,
      step: 1,
      default: 12,
      section: "Style",
      order: 6,
    },
    layout: {
      type: "string",
      label: "Layout direction",
      display: "select",
      values: [
        { "Left → Right": "LR" },
        { "Top → Bottom": "TB" },
      ],
      default: "LR",
      section: "Layout",
      order: 7,
    },
    node_spacing_x: {
      type: "number",
      label: "Node spacing X (px)",
      display: "range",
      min: 60,
      max: 400,
      step: 10,
      default: 200,
      section: "Layout",
      order: 8,
    },
    node_spacing_y: {
      type: "number",
      label: "Node spacing Y (px)",
      display: "range",
      min: 20,
      max: 120,
      step: 5,
      default: 28,
      section: "Layout",
      order: 9,
    },
    collapsed_by_default: {
      type: "boolean",
      label: "Collapse all by default",
      display: "toggle",
      default: false,
      section: "Layout",
      order: 10,
    },
    show_measure_label: {
      type: "boolean",
      label: "Show measure value on labels",
      display: "toggle",
      default: true,
      section: "Data",
      order: 11,
    },
  },

  /* ─────────────────────────────────────────
     Bootstrap: inject D3 once then call create
  ───────────────────────────────────────── */
  create(element, config) {
    element.innerHTML = "";

    const loadD3 = (cb) => {
      if (window.d3) return cb();
      const s = document.createElement("script");
      s.src =
        "https://cdnjs.cloudflare.com/ajax/libs/d3/7.8.5/d3.min.js";
      s.onload = cb;
      document.head.appendChild(s);
    };

    loadD3(() => {
      // One-time container + tooltip
      const container = d3
        .select(element)
        .append("div")
        .attr("class", "hierarchy-container")
        .style("width", "100%")
        .style("height", "100%")
        .style("overflow", "hidden")
        .style("position", "relative");

      container
        .append("svg")
        .attr("class", "hierarchy-svg")
        .style("width", "100%")
        .style("height", "100%");

      container
        .append("div")
        .attr("class", "hierarchy-tooltip")
        .style("position", "absolute")
        .style("background", "rgba(0,0,0,0.75)")
        .style("color", "#fff")
        .style("padding", "6px 10px")
        .style("border-radius", "4px")
        .style("font-size", "12px")
        .style("pointer-events", "none")
        .style("opacity", 0)
        .style("transition", "opacity 0.15s")
        .style("white-space", "nowrap")
        .style("z-index", 9999);

      // Inject tiny CSS for transitions
      const style = document.createElement("style");
      style.textContent = `
        .hierarchy-container .node circle {
          transition: r 0.25s, fill 0.25s, stroke 0.25s;
          cursor: pointer;
        }
        .hierarchy-container .node circle:hover {
          stroke-width: 2.5px !important;
        }
        .hierarchy-container .link {
          fill: none;
          transition: d 0.4s;
        }
        .hierarchy-container .node text {
          pointer-events: none;
          dominant-baseline: central;
        }
      `;
      document.head.appendChild(style);
    });
  },

  /* ─────────────────────────────────────────
     Update: called on every data/config change
  ───────────────────────────────────────── */
  updateAsync(data, element, config, queryResponse, details, done) {
    if (!window.d3) return setTimeout(() => this.updateAsync(...arguments), 50);

    const dims = queryResponse.fields.dimension_like;
    const meas = queryResponse.fields.measure_like;

    if (!dims || dims.length === 0) {
      element.innerHTML =
        "<p style='padding:16px;color:#666'>Add at least one dimension (EC1, EC2 …) to build the hierarchy.</p>";
      return done();
    }

    /* ── 1. Build nested data structure ────── */
    const ROOT_LABEL = "All";

    function buildTree(rows, dimFields, measField) {
      const root = { name: ROOT_LABEL, children: {}, _measure: 0 };

      rows.forEach((row) => {
        let node = root;
        dimFields.forEach((dim, i) => {
          const val = row[dim.name]
            ? row[dim.name].value ?? row[dim.name].rendered ?? "(null)"
            : "(null)";

          if (!node.children[val]) {
            node.children[val] = { name: val, children: {}, _measure: 0 };
          }

          // Accumulate measure all the way up
          if (measField) {
            const mv = row[measField.name]
              ? Number(row[measField.name].value) || 0
              : 0;
            node._measure += mv;
            node.children[val]._measure += mv;
          }

          if (i === dimFields.length - 1) {
            // Last dim = leaf; store raw looker row for drill
            node.children[val]._row = row;
          }

          node = node.children[val];
        });
      });

      // Recursively convert children map → array
      function toArray(n) {
        const childArr = Object.values(n.children).map(toArray);
        return {
          name: n.name,
          children: childArr.length ? childArr : undefined,
          _measure: n._measure,
          _row: n._row,
        };
      }
      return toArray(root);
    }

    const measField = meas && meas.length > 0 ? meas[0] : null;
    const treeData = buildTree(data, dims, measField);

    /* ── 2. Sizes ──────────────────────────── */
    const w = element.clientWidth || 800;
    const h = element.clientHeight || 600;
    const opts = config;
    const MARGIN = { top: 30, right: 160, bottom: 30, left: 80 };
    const LR = opts.layout !== "TB";

    /* ── 3. D3 hierarchy + tree layout ─────── */
    const hierarchyRoot = d3.hierarchy(treeData);

    // Collapse all except root if option set
    if (opts.collapsed_by_default) {
      hierarchyRoot.children &&
        hierarchyRoot.children.forEach((child) => collapse(child));
    }

    function collapse(d) {
      if (d.children) {
        d._children = d.children;
        d._children.forEach(collapse);
        d.children = null;
      }
    }

    const nodeSpacingX = Number(opts.node_spacing_x) || 200;
    const nodeSpacingY = Number(opts.node_spacing_y) || 28;

    const treeLayout = d3
      .tree()
      .nodeSize(LR ? [nodeSpacingY, nodeSpacingX] : [nodeSpacingX, nodeSpacingY]);

    /* ── 4. Clear & recreate SVG contents ──── */
    const svg = d3
      .select(element)
      .select(".hierarchy-svg")
      .attr("viewBox", null);

    svg.selectAll("*").remove();

    // Zoomable group
    const g = svg.append("g").attr("class", "zoom-group");

    const zoom = d3
      .zoom()
      .scaleExtent([0.1, 4])
      .on("zoom", (event) => g.attr("transform", event.transform));

    svg.call(zoom);

    // Center initial view
    const initialTranslate = LR
      ? [MARGIN.left, h / 2]
      : [w / 2, MARGIN.top];
    svg.call(
      zoom.transform,
      d3.zoomIdentity.translate(initialTranslate[0], initialTranslate[1])
    );

    const tooltip = d3.select(element).select(".hierarchy-tooltip");

    /* ── 5. Draw function (re-runs on click) ── */
    let i = 0; // node id counter

    const draw = (source) => {
      treeLayout(hierarchyRoot);

      // ── Links ──
      const linkData = hierarchyRoot.links();

      const linkSel = g
        .selectAll(".link")
        .data(linkData, (d) => d.target.id || (d.target.id = ++i));

      linkSel.join(
        (enter) =>
          enter
            .append("path")
            .attr("class", "link")
            .attr("stroke", opts.link_color || "#CCC")
            .attr("stroke-width", 1)
            .attr("d", (d) => diagonal(d, LR)),
        (update) => update.attr("d", (d) => diagonal(d, LR)),
        (exit) => exit.remove()
      );

      // ── Nodes ──
      const nodeSel = g
        .selectAll(".node")
        .data(hierarchyRoot.descendants(), (d) => d.id || (d.id = ++i));

      const depth = hierarchyRoot.height;
      const nodeR = Number(opts.node_size) || 8;
      const fontSize = Number(opts.font_size) || 12;

      const nodeEnter = nodeSel
        .enter()
        .append("g")
        .attr("class", "node")
        .attr("transform", (d) =>
          LR
            ? `translate(${d.y},${d.x})`
            : `translate(${d.x},${d.y})`
        )
        .on("click", (event, d) => {
          // Toggle expand/collapse
          if (d.children) {
            d._children = d.children;
            d.children = null;
          } else if (d._children) {
            d.children = d._children;
            d._children = null;
          }
          draw(d);
        })
        .on("mouseover", (event, d) => {
          const lines = [`<strong>${d.data.name}</strong>`];
          if (measField && d.data._measure != null) {
            lines.push(
              `${measField.label_short || measField.label}: ${d.data._measure.toLocaleString()}`
            );
          }
          if (d._children) lines.push("Click to expand");
          if (d.children && d.depth > 0) lines.push("Click to collapse");
          tooltip
            .html(lines.join("<br>"))
            .style("left", event.offsetX + 14 + "px")
            .style("top", event.offsetY - 14 + "px")
            .style("opacity", 1);
        })
        .on("mouseout", () => tooltip.style("opacity", 0));

      nodeEnter
        .append("circle")
        .attr("r", nodeR)
        .attr("fill", (d) => nodeColor(d, depth, opts))
        .attr("stroke", "#fff")
        .attr("stroke-width", 1.5);

      nodeEnter
        .append("text")
        .attr("font-size", fontSize)
        .attr("fill", "#333")
        .attr("text-anchor", (d) =>
          LR ? (d.children || d._children ? "end" : "start") : "middle"
        )
        .attr("x", (d) => {
          if (!LR) return 0;
          return (d.children || d._children ? -1 : 1) * (nodeR + 5);
        })
        .attr("y", (d) => (!LR ? nodeR + fontSize + 2 : 0))
        .text((d) => {
          let label = d.data.name;
          if (
            opts.show_measure_label &&
            measField &&
            d.data._measure != null &&
            d.data._measure > 0
          ) {
            label += ` (${Number(d.data._measure).toLocaleString()})`;
          }
          return label;
        });

      // Update existing nodes position
      nodeSel
        .attr("transform", (d) =>
          LR
            ? `translate(${d.y},${d.x})`
            : `translate(${d.x},${d.y})`
        )
        .select("circle")
        .attr("fill", (d) => nodeColor(d, depth, opts))
        // Visual indicator: collapsed nodes get a darker stroke
        .attr("stroke", (d) => (d._children ? opts.color_branch || "#0078D4" : "#fff"))
        .attr("stroke-width", (d) => (d._children ? 2 : 1.5));

      nodeSel.select("text").text((d) => {
        let label = d.data.name;
        if (
          opts.show_measure_label &&
          measField &&
          d.data._measure != null &&
          d.data._measure > 0
        ) {
          label += ` (${Number(d.data._measure).toLocaleString()})`;
        }
        return label;
      });

      nodeSel.exit().remove();
    };

    draw(hierarchyRoot);
    done();
  },
});

/* ─────────────────────────────────────────
   Helpers
───────────────────────────────────────── */

function diagonal(link, LR) {
  const s = link.source;
  const t = link.target;
  if (LR) {
    return `M${s.y},${s.x}
            C${(s.y + t.y) / 2},${s.x}
             ${(s.y + t.y) / 2},${t.x}
             ${t.y},${t.x}`;
  } else {
    return `M${s.x},${s.y}
            C${s.x},${(s.y + t.y) / 2}
             ${t.x},${(s.y + t.y) / 2}
             ${t.x},${t.y}`;
  }
}

function nodeColor(d, maxDepth, opts) {
  if (d.depth === 0) return opts.color_root || "#1B3A6B";
  if (!d.children && !d._children) return opts.color_leaf || "#00B4A0";
  return opts.color_branch || "#0078D4";
}
