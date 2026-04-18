/**
 * Looker Custom Visualization: D3 Hierarchy Tree
 * Fixes: null (∅) value handling, SVG sizing, D3 load race condition
 */

(function () {
  var D3_URL = "https://cdnjs.cloudflare.com/ajax/libs/d3/7.8.5/d3.min.js";
  var NULL_LABEL = "(none)";

  function loadD3(cb) {
    if (window.d3) { cb(); return; }
    var s = document.createElement("script");
    s.src = D3_URL;
    s.onload = cb;
    s.onerror = function () { console.error("Hierarchy Tree: failed to load D3"); };
    document.head.appendChild(s);
  }

  function getCellValue(cell) {
    if (cell === null || cell === undefined) return NULL_LABEL;
    var v = cell.value;
    if (v === null || v === undefined || v === "") return NULL_LABEL;
    return String(cell.rendered || v);
  }

  function buildTree(data, dims) {
    var root = { name: "All", children: {} };

    data.forEach(function (row) {
      var node = root;
      for (var i = 0; i < dims.length; i++) {
        var val = getCellValue(row[dims[i].name]);
        // Stop at null — don't create null branches deeper in the tree
        if (val === NULL_LABEL && i > 0) break;
        if (!node.children[val]) {
          node.children[val] = { name: val, children: {} };
        }
        node = node.children[val];
      }
    });

    function toArray(n) {
      var childArr = Object.values(n.children).map(toArray);
      return { name: n.name, children: childArr.length ? childArr : null };
    }
    return toArray(root);
  }

  looker.plugins.visualizations.add({
    id: "hierarchy_tree",
    label: "Hierarchy Tree",

    options: {
      color_root:      { type: "string",  label: "Root color",          display: "color",  default: "#1B3A6B", section: "Style",  order: 1 },
      color_branch:    { type: "string",  label: "Branch color",        display: "color",  default: "#0078D4", section: "Style",  order: 2 },
      color_leaf:      { type: "string",  label: "Leaf color",          display: "color",  default: "#00B4A0", section: "Style",  order: 3 },
      link_color:      { type: "string",  label: "Link color",          display: "color",  default: "#AAAAAA", section: "Style",  order: 4 },
      node_size:       { type: "number",  label: "Node radius",         display: "range",  default: 7,   min: 4,  max: 18, step: 1, section: "Style",  order: 5 },
      font_size:       { type: "number",  label: "Font size",           display: "range",  default: 12,  min: 9,  max: 16, step: 1, section: "Style",  order: 6 },
      layout: {
        type: "string", label: "Layout", display: "select",
        values: [{ "Left → Right": "LR" }, { "Top → Bottom": "TB" }],
        default: "LR", section: "Layout", order: 7
      },
      x_spacing:       { type: "number",  label: "Horizontal spacing",  display: "range",  default: 180, min: 80, max: 400, step: 10, section: "Layout", order: 8 },
      y_spacing:       { type: "number",  label: "Vertical spacing",    display: "range",  default: 24,  min: 14, max: 80,  step: 2,  section: "Layout", order: 9 },
      start_collapsed: { type: "boolean", label: "Start collapsed",     display: "toggle", default: false, section: "Layout", order: 10 },
    },

    create: function (element, config) {
      element.innerHTML = "";

      var style = document.createElement("style");
      style.textContent = [
        ".ht-wrap{width:100%;height:100%;overflow:hidden;position:relative;background:#fff;}",
        ".ht-wrap svg{display:block;width:100%;height:100%;}",
        ".ht-node{cursor:pointer;}",
        ".ht-node:hover circle{opacity:0.75;}",
        ".ht-link{fill:none;}",
        ".ht-tip{position:absolute;background:rgba(20,20,30,0.85);color:#fff;padding:5px 9px;",
        "border-radius:4px;font-size:12px;font-family:sans-serif;pointer-events:none;",
        "opacity:0;transition:opacity 0.12s;white-space:nowrap;z-index:9999;}"
      ].join("");
      document.head.appendChild(style);

      var wrap = document.createElement("div");
      wrap.className = "ht-wrap";
      element.appendChild(wrap);

      var svgEl = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      wrap.appendChild(svgEl);

      var tip = document.createElement("div");
      tip.className = "ht-tip";
      wrap.appendChild(tip);
    },

    updateAsync: function (data, element, config, queryResponse, details, done) {
      var self = this;
      loadD3(function () {
        try {
          self._render(data, element, config, queryResponse, done);
        } catch (e) {
          var wrap = element.querySelector(".ht-wrap");
          if (wrap) wrap.innerHTML = "<p style='padding:16px;color:red;font-family:sans-serif'>Error: " + e.message + "</p>";
          console.error("Hierarchy Tree:", e);
          done();
        }
      });
    },

    _render: function (data, element, config, queryResponse, done) {
      var dims = queryResponse.fields.dimension_like;
      var wrap  = element.querySelector(".ht-wrap");
      var svgEl = element.querySelector("svg");
      var tip   = element.querySelector(".ht-tip");

      if (!dims || dims.length === 0) {
        wrap.innerHTML = "<p style='padding:16px;font-family:sans-serif;color:#555'>Add EC1, EC2 … dimensions to build the hierarchy.</p>";
        return done();
      }

      d3.select(svgEl).selectAll("*").remove();

      var W = wrap.clientWidth  || 800;
      var H = wrap.clientHeight || 500;

      var LR    = (config.layout !== "TB");
      var xSp   = Number(config.x_spacing)  || 180;
      var ySp   = Number(config.y_spacing)   || 24;
      var nodeR = Number(config.node_size)   || 7;
      var fSize = Number(config.font_size)   || 12;
      var cRoot   = config.color_root   || "#1B3A6B";
      var cBranch = config.color_branch || "#0078D4";
      var cLeaf   = config.color_leaf   || "#00B4A0";
      var cLink   = config.link_color   || "#AAAAAA";

      var treeData = buildTree(data, dims);
      var root = d3.hierarchy(treeData);

      function collapse(d) {
        if (d.children) {
          d._children = d.children;
          d._children.forEach(collapse);
          d.children = null;
        }
      }
      if (config.start_collapsed) {
        root.children && root.children.forEach(collapse);
      }

      var treeLayout = d3.tree().nodeSize(LR ? [ySp, xSp] : [xSp, ySp]);
      var svg = d3.select(svgEl);
      var g   = svg.append("g");

      var zoom = d3.zoom()
        .scaleExtent([0.08, 5])
        .on("zoom", function (event) { g.attr("transform", event.transform); });

      svg.call(zoom);
      svg.call(zoom.transform,
        d3.zoomIdentity.translate(LR ? 80 : W / 2, LR ? H / 2 : 60));

      var uid = 0;

      function nodeColor(d) {
        if (d.depth === 0) return cRoot;
        if (!d.children && !d._children) return cLeaf;
        return cBranch;
      }

      function diagonal(d) {
        var sx = LR ? d.source.y : d.source.x;
        var sy = LR ? d.source.x : d.source.y;
        var tx = LR ? d.target.y : d.target.x;
        var ty = LR ? d.target.x : d.target.y;
        var mx = (sx + tx) / 2;
        return "M" + sx + "," + sy + "C" + mx + "," + sy + " " + mx + "," + ty + " " + tx + "," + ty;
      }

      function draw() {
        treeLayout(root);

        // Links
        g.selectAll(".ht-link")
          .data(root.links(), function (d) { return d.target.uid || (d.target.uid = ++uid); })
          .join(
            function (enter) {
              return enter.append("path").attr("class", "ht-link")
                .attr("stroke", cLink).attr("stroke-width", 1).attr("d", diagonal);
            },
            function (update) { return update.attr("d", diagonal); },
            function (exit)   { return exit.remove(); }
          );

        // Nodes
        var nodes = g.selectAll(".ht-node")
          .data(root.descendants(), function (d) { return d.uid || (d.uid = ++uid); });

        var enter = nodes.enter()
          .append("g").attr("class", "ht-node")
          .attr("transform", function (d) {
            return "translate(" + (LR ? d.y : d.x) + "," + (LR ? d.x : d.y) + ")";
          })
          .on("click", function (event, d) {
            if (d.children) { d._children = d.children; d.children = null; }
            else if (d._children) { d.children = d._children; d._children = null; }
            draw();
          })
          .on("mousemove", function (event, d) {
            var html = "<strong>" + d.data.name + "</strong>";
            if (d._children) html += "<br><em>Click to expand</em>";
            else if (d.children && d.depth > 0) html += "<br><em>Click to collapse</em>";
            tip.innerHTML = html;
            tip.style.left = (event.offsetX + 14) + "px";
            tip.style.top  = (event.offsetY - 10) + "px";
            tip.style.opacity = 1;
          })
          .on("mouseleave", function () { tip.style.opacity = 0; });

        enter.append("circle")
          .attr("r", nodeR).attr("fill", nodeColor)
          .attr("stroke", "#fff").attr("stroke-width", 1.5);

        enter.append("text")
          .attr("font-size", fSize).attr("font-family", "sans-serif")
          .attr("fill", "#222").attr("dominant-baseline", "central")
          .attr("text-anchor", function (d) {
            return LR ? (d.children || d._children ? "end" : "start") : "middle";
          })
          .attr("x", function (d) {
            return LR ? (d.children || d._children ? -1 : 1) * (nodeR + 5) : 0;
          })
          .attr("y", function (d) { return LR ? 0 : nodeR + fSize + 2; })
          .text(function (d) { return d.data.name; });

        // Merge + update positions
        var all = nodes.merge(enter);
        all.attr("transform", function (d) {
          return "translate(" + (LR ? d.y : d.x) + "," + (LR ? d.x : d.y) + ")";
        });
        all.select("circle")
          .attr("r", nodeR).attr("fill", nodeColor)
          .attr("stroke", function (d) { return d._children ? cBranch : "#fff"; })
          .attr("stroke-width", function (d) { return d._children ? 2.5 : 1.5; });
        all.select("text")
          .attr("font-size", fSize)
          .attr("text-anchor", function (d) {
            return LR ? (d.children || d._children ? "end" : "start") : "middle";
          })
          .attr("x", function (d) {
            return LR ? (d.children || d._children ? -1 : 1) * (nodeR + 5) : 0;
          })
          .attr("y", function (d) { return LR ? 0 : nodeR + fSize + 2; })
          .text(function (d) { return d.data.name; });

        nodes.exit().remove();
      }

      draw();
      done();
    }
  });
}());
