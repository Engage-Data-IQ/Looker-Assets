
;(function () {
  'use strict'

  // ─── Helpers ─────────────────────────────────────────────────────────────

  const NULL_VALUES = new Set(['ø', 'null', 'NULL', '', '0', null, undefined])

  const LEVEL_COLORS = [
    '#1B3A6B',
    '#0078D4',
    '#00B4A0',
    '#6264A7',
    '#CA5010',
    '#107C41',
    '#8B1A1A',
    '#5C4033',
  ]

  function isNull(v) {
    return NULL_VALUES.has(v) || v === null || v === undefined || String(v).trim() === ''
  }

  function getLevelColor(level) {
    return LEVEL_COLORS[Math.min(level, LEVEL_COLORS.length - 1)]
  }

  // ─── Build tree from Looker data rows ────────────────────────────────────

  function buildTree(data, fields) {
    const nodeMap = new Map()

    function getOrCreate(id, name, level) {
      if (!nodeMap.has(id)) {
        nodeMap.set(id, { id, name, level, children: [], headcount: 0, childIds: new Set() })
      }
      return nodeMap.get(id)
    }

    data.forEach(function (row) {
      // Extract values in field order
      const names = fields.map(function (f) {
        const cell = row[f.name]
        const v = cell ? (cell.value !== undefined ? cell.value : cell) : null
        return isNull(v) ? null : String(v)
      })

      // Trim nulls from the end
      let depth = names.findIndex(function (n) { return n === null })
      const validNames = depth === -1 ? names : names.slice(0, depth)
      if (!validNames.length) return

      for (let i = 0; i < validNames.length; i++) {
        const name = validNames[i]
        const id   = 'L' + i + '::' + name
        const node = getOrCreate(id, name, i)
        node.headcount++

        if (i > 0) {
          const parentId = 'L' + (i - 1) + '::' + validNames[i - 1]
          const parent   = nodeMap.get(parentId)
          if (parent && !parent.childIds.has(id)) {
            parent.childIds.add(id)
            parent.children.push(node)
          }
        }
      }
    })

    const roots = Array.from(nodeMap.values()).filter(function (n) { return n.level === 0 })
    if (!roots.length) return null
    if (roots.length === 1) return roots[0]

    // Multiple roots → virtual root
    const totalHeadcount = roots.reduce(function (s, r) { return s + r.headcount }, 0)
    return {
      id: '__root__',
      name: 'Organization',
      level: -1,
      children: roots,
      headcount: totalHeadcount,
      isVirtual: true,
    }
  }

  // ─── Render helpers ───────────────────────────────────────────────────────

  function el(tag, attrs, children) {
    const e = document.createElement(tag)
    if (attrs) {
      Object.entries(attrs).forEach(function ([k, v]) {
        if (k === 'style' && typeof v === 'object') {
          Object.assign(e.style, v)
        } else if (k === 'onClick') {
          e.addEventListener('click', v)
        } else if (k === 'onMouseEnter') {
          e.addEventListener('mouseenter', v)
        } else if (k === 'onMouseLeave') {
          e.addEventListener('mouseleave', v)
        } else {
          e.setAttribute(k, v)
        }
      })
    }
    if (children) {
      ;(Array.isArray(children) ? children : [children]).forEach(function (c) {
        if (c == null) return
        if (typeof c === 'string') e.appendChild(document.createTextNode(c))
        else e.appendChild(c)
      })
    }
    return e
  }

  function renderNode(node, fieldLabels, collapsedState, onToggle) {
    const levelIdx = Math.max(node.level, 0)
    const color    = node.isVirtual ? '#888' : getLevelColor(levelIdx)
    const label    = node.isVirtual
      ? 'ORG'
      : fieldLabels[Math.min(levelIdx, fieldLabels.length - 1)] || ('L' + (levelIdx + 1))

    const isCollapsed = collapsedState.has(node.id)
    const hasChildren = node.children && node.children.length > 0

    const card = el('div', {
      style: {
        position: 'relative',
        background: '#ffffff',
        border: '2px solid ' + color,
        borderRadius: '10px',
        padding: '8px 14px',
        minWidth: '140px',
        maxWidth: '190px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        cursor: hasChildren ? 'pointer' : 'default',
        transition: 'box-shadow 0.2s, transform 0.15s',
        userSelect: 'none',
        boxSizing: 'border-box',
      },
      onClick: hasChildren ? function (e) { e.stopPropagation(); onToggle(node.id) } : null,
      onMouseEnter: hasChildren ? function (e) {
        e.currentTarget.style.boxShadow = '0 4px 16px ' + color + '40'
        e.currentTarget.style.transform = 'translateY(-2px)'
      } : null,
      onMouseLeave: hasChildren ? function (e) {
        e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)'
        e.currentTarget.style.transform = 'translateY(0)'
      } : null,
    })

    // Level badge
    card.appendChild(el('div', {
      style: {
        position: 'absolute',
        top: '-10px', left: '10px',
        background: color, color: '#fff',
        fontSize: '9px', fontWeight: '700',
        padding: '1px 6px', borderRadius: '4px',
        letterSpacing: '0.08em',
      }
    }, label))

    // Name
    card.appendChild(el('div', {
      style: {
        fontSize: '12px', fontWeight: '700',
        color: '#1a1a2e', marginTop: '4px',
        lineHeight: '1.3', wordBreak: 'break-word',
      }
    }, node.name))

    // Footer row
    const footer = el('div', {
      style: {
        display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', marginTop: '5px',
      }
    })

    footer.appendChild(el('span', {
      style: {
        fontSize: '10px', color: '#6b7280',
        background: '#f3f4f6', borderRadius: '4px',
        padding: '1px 5px',
      }
    }, node.headcount + ' report' + (node.headcount !== 1 ? 's' : '')))

    if (hasChildren) {
      footer.appendChild(el('span', {
        style: { fontSize: '14px', color: color, fontWeight: '700' }
      }, isCollapsed ? '+' : '−'))
    }

    card.appendChild(footer)
    return card
  }

  function renderBranch(node, fieldLabels, collapsedState, onToggle) {
    const wrapper = el('div', {
      style: { display: 'flex', flexDirection: 'column', alignItems: 'center' }
    })

    wrapper.appendChild(renderNode(node, fieldLabels, collapsedState, onToggle))

    const isCollapsed = collapsedState.has(node.id)
    const hasChildren = node.children && node.children.length > 0

    if (hasChildren && !isCollapsed) {
      // Vertical connector down from node
      wrapper.appendChild(el('div', { style: { width: '2px', height: '20px', background: '#d1d5db' } }))

      const childRow = el('div', {
        style: {
          display: 'flex', alignItems: 'flex-start',
          position: 'relative', gap: '0',
        }
      })

      // Horizontal bar
      if (node.children.length > 1) {
        const bar = el('div', {
          style: {
            position: 'absolute',
            top: '0', left: '50%',
            transform: 'translateX(-50%)',
            width: 'calc(100% - 20px)',
            height: '2px',
            background: '#d1d5db',
            pointerEvents: 'none',
          }
        })
        childRow.appendChild(bar)
      }

      node.children.forEach(function (child) {
        const childWrapper = el('div', {
          style: {
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', padding: '0 8px',
          }
        })
        // Vertical connector into child
        childWrapper.appendChild(el('div', { style: { width: '2px', height: '20px', background: '#d1d5db' } }))
        childWrapper.appendChild(renderBranch(child, fieldLabels, collapsedState, onToggle))
        childRow.appendChild(childWrapper)
      })

      wrapper.appendChild(childRow)
    }

    return wrapper
  }

  // ─── Main render function ─────────────────────────────────────────────────

  function renderTree(container, data, fields, collapsedState, onToggle) {
    container.innerHTML = ''

    if (!data || !data.length || !fields || !fields.length) {
      container.innerHTML = '<div style="text-align:center;padding:60px;color:#9ca3af;font-size:14px;">Add dimension fields to the Explore to render the hierarchy.<br><small style="color:#d1d5db">Fields are used in order: first field = root (top level)</small></div>'
      return
    }

    const tree = buildTree(data, fields)
    if (!tree) {
      container.innerHTML = '<div style="text-align:center;padding:60px;color:#9ca3af;font-size:14px;">No hierarchy data found in the result set.</div>'
      return
    }

    // Field labels for level badges (short names)
    const fieldLabels = fields.map(function (f) {
      return f.label_short || f.label || f.name
    })

    const inner = el('div', {
      style: { display: 'inline-block', minWidth: '100%', paddingBottom: '20px' }
    })
    inner.appendChild(renderBranch(tree, fieldLabels, collapsedState, onToggle))
    container.appendChild(inner)
  }

  // ─── Looker Visualization API ─────────────────────────────────────────────

  const viz = {
    id: 'hierarchy_chart',
    label: 'Hierarchy Chart',
    supportedActionTypes: ['none'],

    options: {
      // Optional config panel options
      default_expand_depth: {
        type: 'number',
        label: 'Default expand depth (0 = all collapsed except root)',
        default: 2,
        order: 1,
      }
    },

    // Called once on init
    create: function (element, config) {
      element.innerHTML = ''
      element.style.fontFamily = 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
      element.style.background = '#f5f7fa'
      element.style.overflow   = 'auto'
      element.style.height     = '100%'
      element.style.boxSizing  = 'border-box'
      element.style.padding    = '16px'

      // Header
      const header = el('div', {
        style: {
          display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px',
        }
      })

      const title = el('div', { style: { fontSize: '15px', fontWeight: '700', color: '#1B3A6B' } }, 'Hierarchy Chart')
      const hint  = el('div', { style: { fontSize: '11px', color: '#9ca3af' } }, 'Click nodes to expand / collapse')

      header.appendChild(title)
      header.appendChild(hint)
      element.appendChild(header)

      // Legend container
      const legend = el('div', {
        class: 'hz-legend',
        style: { display: 'flex', gap: '10px', marginBottom: '14px', flexWrap: 'wrap' }
      })
      element.appendChild(legend)

      // Tree container
      const treeContainer = el('div', {
        class: 'hz-tree',
        style: {
          background: '#fff', borderRadius: '12px',
          border: '1px solid #e5e7eb',
          padding: '28px 20px', overflowX: 'auto',
        }
      })
      element.appendChild(treeContainer)

      // Store state on element
      element._hzCollapsed  = new Set()
      element._hzInitialized = false
    },

    // Called on every data update
    updateAsync: function (data, element, config, queryResponse, details, done) {
      const fields = [
        ...(queryResponse.fields.dimensions || []),
        ...(queryResponse.fields.measures   || []),
      ]

      const treeContainer = element.querySelector('.hz-tree')
      const legendEl      = element.querySelector('.hz-legend')
      const expandDepth   = config.default_expand_depth !== undefined ? config.default_expand_depth : 2

      // Initialize collapsed state on first load or field change
      const fieldKey = fields.map(function (f) { return f.name }).join('|')
      if (!element._hzFieldKey || element._hzFieldKey !== fieldKey) {
        element._hzFieldKey  = fieldKey
        element._hzCollapsed = new Set()

        // Pre-collapse nodes deeper than expandDepth
        // We'll handle this during tree build by default-collapsing in renderBranch
        element._hzExpandDepth = expandDepth
        element._hzInitialized = false
      }

      // Toggle callback — re-render on expand/collapse
      const onToggle = function (nodeId) {
        if (element._hzCollapsed.has(nodeId)) {
          element._hzCollapsed.delete(nodeId)
        } else {
          element._hzCollapsed.add(nodeId)
        }
        renderTree(treeContainer, data, fields, element._hzCollapsed, onToggle)
      }

      // Build collapsed state for initial render based on depth
      if (!element._hzInitialized) {
        // Build tree once to find nodes beyond expandDepth and pre-collapse them
        const tree = buildTree(data, fields)
        if (tree) {
          const preCollapse = function (node, depth) {
            if (depth >= expandDepth && node.children && node.children.length > 0) {
              element._hzCollapsed.add(node.id)
            }
            if (node.children) {
              node.children.forEach(function (c) { preCollapse(c, depth + 1) })
            }
          }
          preCollapse(tree, 0)
        }
        element._hzInitialized = true
      }

      // Update legend
      if (legendEl) {
        legendEl.innerHTML = ''
        fields.forEach(function (f, i) {
          const color = getLevelColor(i)
          const dot   = el('div', { style: { display: 'flex', alignItems: 'center', gap: '5px' } })
          dot.appendChild(el('div', { style: { width: '10px', height: '10px', borderRadius: '3px', background: color } }))
          dot.appendChild(el('span', { style: { fontSize: '11px', color: '#374151', fontWeight: '600' } },
            f.label_short || f.label || f.name))
          legendEl.appendChild(dot)
        })
      }

      // Render tree
      renderTree(treeContainer, data, fields, element._hzCollapsed, onToggle)

      done()
    }
  }

  looker.plugins.visualizations.add(viz)
})()
