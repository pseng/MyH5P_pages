/**
 * Learning Path Node Editor
 * An SVG-based visual node editor inspired by Node-RED.
 */
(function () {
  'use strict';

  // ─── State ────────────────────────────────────────────────────────
  let pathId = null;
  let pathData = {
    title: 'Untitled Learning Path',
    description: '',
    status: 'draft',
    nodes: [],
    connections: [],
    lrsConfig: null,
  };
  let nodeTypes = {};
  let h5pContent = [];
  let selectedNodeId = null;
  let dragState = null;     // { nodeId, offsetX, offsetY }
  let connectState = null;  // { fromNodeId, fromPort, tempLine }
  let panState = null;      // { startX, startY, startPanX, startPanY }
  let viewBox = { x: -200, y: -100, w: 1600, h: 900 };
  let zoom = 1;
  let dirty = false;

  const NODE_W = 180;
  const NODE_H = 54;
  const PORT_R = 5;

  // ─── Init ─────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', async () => {
    // Load path data from the embedded attribute
    const appEl = document.getElementById('app');
    const rawData = appEl.getAttribute('data-path');
    if (rawData) {
      try {
        pathData = JSON.parse(rawData);
        pathId = pathData.id;
      } catch { /* start fresh */ }
    }

    // Fetch node type definitions
    try {
      const res = await fetch('/learning-paths/api/node-types');
      nodeTypes = await res.json();
    } catch { /* use empty */ }

    // Fetch H5P content for picker
    try {
      const res = await fetch('/learning-paths/api/h5p-content');
      h5pContent = await res.json();
    } catch { /* use empty */ }

    buildUI();
    renderCanvas();
    renderMinimap();
  });

  // ─── Build DOM ────────────────────────────────────────────────────
  function buildUI() {
    const app = document.getElementById('app');
    app.innerHTML = '';

    // Toolbar
    const toolbar = el('div', { id: 'toolbar' });
    toolbar.innerHTML = `
      <a href="/learning-paths" class="brand">MyH5P</a>
      <span class="sep"></span>
      <input type="text" id="path-title" value="${escAttr(pathData.title)}" placeholder="Learning path title...">
      <span class="spacer"></span>
      <span class="status" id="save-status"></span>
      <button onclick="LPEditor.showLrsModal()">LRS Config</button>
      <button onclick="LPEditor.validate()">Validate</button>
      <button class="primary" onclick="LPEditor.save()">Save</button>
      <span class="sep"></span>
      <a href="/learning-paths" class="btn">Back</a>
    `;
    app.appendChild(toolbar);

    // Main layout
    const layout = el('div', { id: 'editor-layout' });

    // Palette
    const palette = el('div', { id: 'palette' });
    const categories = {};
    for (const [key, nt] of Object.entries(nodeTypes)) {
      if (!categories[nt.category]) categories[nt.category] = [];
      categories[nt.category].push({ key, ...nt });
    }
    for (const [cat, items] of Object.entries(categories)) {
      const catLabel = { control: 'Flow Control', content: 'Content Nodes', package: 'Package Nodes' }[cat] || cat;
      palette.innerHTML += `<h3>${catLabel}</h3>`;
      for (const item of items) {
        const pn = el('div', { class: 'palette-node', draggable: 'true', 'data-type': item.key });
        pn.innerHTML = `<div class="node-icon" style="background:${item.color}">${item.icon}</div><span>${item.label}</span>`;
        pn.addEventListener('dragstart', onPaletteDragStart);
        palette.appendChild(pn);
      }
    }
    layout.appendChild(palette);

    // Canvas container
    const canvasCont = el('div', { id: 'canvas-container' });
    canvasCont.addEventListener('dragover', (e) => e.preventDefault());
    canvasCont.addEventListener('drop', onCanvasDrop);

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('id', 'main-svg');
    svg.setAttribute('viewBox', `${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`);

    // Grid pattern
    const defs = svgEl('defs');
    const pattern = svgEl('pattern', { id: 'grid-pattern', width: 20, height: 20, patternUnits: 'userSpaceOnUse' });
    pattern.appendChild(svgEl('circle', { cx: 10, cy: 10, r: 1, class: 'grid-dot' }));
    defs.appendChild(pattern);
    svg.appendChild(defs);
    svg.appendChild(svgEl('rect', { x: -5000, y: -5000, width: 10000, height: 10000, fill: 'url(#grid-pattern)' }));

    // Layers
    const connLayer = svgEl('g', { id: 'connections-layer' });
    const nodeLayer = svgEl('g', { id: 'nodes-layer' });
    svg.appendChild(connLayer);
    svg.appendChild(nodeLayer);

    svg.addEventListener('mousedown', onSvgMouseDown);
    svg.addEventListener('mousemove', onSvgMouseMove);
    svg.addEventListener('mouseup', onSvgMouseUp);
    svg.addEventListener('wheel', onSvgWheel, { passive: false });
    svg.addEventListener('click', onSvgClick);
    canvasCont.appendChild(svg);

    // Zoom controls
    const zoomCtrl = el('div', { id: 'zoom-controls' });
    zoomCtrl.innerHTML = `
      <button onclick="LPEditor.zoomIn()">+</button>
      <span class="zoom-level" id="zoom-label">100%</span>
      <button onclick="LPEditor.zoomOut()">&minus;</button>
      <button onclick="LPEditor.zoomFit()">Fit</button>
    `;
    canvasCont.appendChild(zoomCtrl);

    // Minimap
    const minimap = el('div', { id: 'minimap' });
    const mmSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    mmSvg.setAttribute('id', 'minimap-svg');
    minimap.appendChild(mmSvg);
    canvasCont.appendChild(minimap);

    layout.appendChild(canvasCont);

    // Properties panel
    const props = el('div', { id: 'properties-panel' });
    layout.appendChild(props);

    app.appendChild(layout);

    // Toast container
    const toasts = el('div', { id: 'toast-container' });
    app.appendChild(toasts);

    // LRS modal
    const lrsModal = el('div', { class: 'modal-overlay hidden', id: 'lrs-modal' });
    const lrs = pathData.lrsConfig || {};
    lrsModal.innerHTML = `
      <div class="modal-box">
        <h2>LRS Configuration</h2>
        <label>LRS Endpoint URL</label>
        <input type="url" id="lrs-endpoint" value="${escAttr(lrs.endpoint || '')}" placeholder="https://lrs.example.com/xapi/">
        <label>Key / Username</label>
        <input type="text" id="lrs-key" value="${escAttr(lrs.key || '')}" placeholder="API Key or username">
        <label>Secret / Password</label>
        <input type="password" id="lrs-secret" value="${escAttr(lrs.secret || '')}" placeholder="API Secret or password">
        <div class="modal-actions">
          <button class="btn-cancel" onclick="LPEditor.hideLrsModal()">Cancel</button>
          <button class="btn-save" onclick="LPEditor.saveLrs()">Save LRS Config</button>
        </div>
      </div>
    `;
    app.appendChild(lrsModal);

    // H5P picker modal
    const h5pModal = el('div', { class: 'modal-overlay hidden', id: 'h5p-modal' });
    h5pModal.innerHTML = `
      <div class="modal-box">
        <h2>Select H5P Content</h2>
        <div class="h5p-picker-list" id="h5p-picker-list"></div>
        <div class="modal-actions">
          <button class="btn-cancel" onclick="LPEditor.hideH5pModal()">Cancel</button>
          <button class="btn-save" onclick="LPEditor.selectH5p()">Select</button>
        </div>
      </div>
    `;
    app.appendChild(h5pModal);

    // Title change listener
    document.getElementById('path-title').addEventListener('input', (e) => {
      pathData.title = e.target.value;
      dirty = true;
    });
  }

  // ─── Canvas Rendering ─────────────────────────────────────────────
  function renderCanvas() {
    renderConnections();
    renderNodes();
    renderMinimap();
  }

  function renderNodes() {
    const layer = document.getElementById('nodes-layer');
    if (!layer) return;
    layer.innerHTML = '';
    for (const node of pathData.nodes) {
      layer.appendChild(createNodeSvg(node));
    }
  }

  function renderConnections() {
    const layer = document.getElementById('connections-layer');
    if (!layer) return;
    layer.innerHTML = '';
    for (const conn of pathData.connections) {
      const fromNode = pathData.nodes.find((n) => n.id === conn.from);
      const toNode = pathData.nodes.find((n) => n.id === conn.to);
      if (!fromNode || !toNode) continue;

      const fromPos = getOutputPortPos(fromNode, conn.fromPort);
      const toPos = getInputPortPos(toNode, conn.toPort);
      const path = svgEl('path', {
        class: 'connection-path',
        d: curvePath(fromPos.x, fromPos.y, toPos.x, toPos.y),
        'data-from': conn.from,
        'data-to': conn.to,
      });
      path.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        removeConnection(conn.from, conn.fromPort, conn.to, conn.toPort);
      });
      layer.appendChild(path);
    }
  }

  function createNodeSvg(node) {
    const nt = nodeTypes[node.type] || {};
    const g = svgEl('g', {
      class: 'node-group' + (node.id === selectedNodeId ? ' selected' : ''),
      transform: `translate(${node.x}, ${node.y})`,
      'data-id': node.id,
    });

    // Body
    g.appendChild(svgEl('rect', {
      class: 'node-body',
      x: 0, y: 0,
      width: NODE_W, height: NODE_H,
      fill: nt.color || '#555',
      'fill-opacity': 0.85,
    }));

    // Icon
    const iconText = svgEl('text', { class: 'node-icon-text', x: 12, y: 33 });
    iconText.textContent = nt.icon || '?';
    g.appendChild(iconText);

    // Title
    const title = svgEl('text', { class: 'node-title', x: 36, y: 23 });
    title.textContent = truncate(node.data?.title || nt.label || node.type, 16);
    g.appendChild(title);

    // Subtitle (type)
    const sub = svgEl('text', { class: 'node-subtitle', x: 36, y: 38 });
    sub.textContent = nt.label || node.type;
    g.appendChild(sub);

    // Input ports
    const inputs = nt.inputs || [];
    inputs.forEach((portName, i) => {
      const py = NODE_H / (inputs.length + 1) * (i + 1);
      const port = svgEl('circle', {
        class: 'port port-input',
        cx: 0, cy: py, r: PORT_R,
        fill: '#aaa',
        'data-node': node.id,
        'data-port': portName,
        'data-dir': 'input',
      });
      g.appendChild(port);
    });

    // Output ports
    const outputs = nt.outputs || [];
    outputs.forEach((portName, i) => {
      const py = NODE_H / (outputs.length + 1) * (i + 1);
      const port = svgEl('circle', {
        class: 'port port-output',
        cx: NODE_W, cy: py, r: PORT_R,
        fill: '#80cbc4',
        'data-node': node.id,
        'data-port': portName,
        'data-dir': 'output',
      });
      g.appendChild(port);
      if (outputs.length > 1) {
        const label = svgEl('text', { class: 'port-label', x: NODE_W - 6, y: py - 8, 'text-anchor': 'end' });
        label.textContent = portName;
        g.appendChild(label);
      }
    });

    // Mouse events for dragging and selecting
    g.addEventListener('mousedown', onNodeMouseDown);

    return g;
  }

  function getOutputPortPos(node, portName) {
    const nt = nodeTypes[node.type] || {};
    const outputs = nt.outputs || [];
    const idx = outputs.indexOf(portName);
    const i = idx >= 0 ? idx : 0;
    const py = NODE_H / (outputs.length + 1) * (i + 1);
    return { x: node.x + NODE_W, y: node.y + py };
  }

  function getInputPortPos(node, portName) {
    const nt = nodeTypes[node.type] || {};
    const inputs = nt.inputs || [];
    const idx = inputs.indexOf(portName);
    const i = idx >= 0 ? idx : 0;
    const py = NODE_H / (inputs.length + 1) * (i + 1);
    return { x: node.x, y: node.y + py };
  }

  function curvePath(x1, y1, x2, y2) {
    const dx = Math.abs(x2 - x1) * 0.5;
    return `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`;
  }

  // ─── Events: Palette drag & drop ──────────────────────────────────
  function onPaletteDragStart(e) {
    e.dataTransfer.setData('text/plain', e.currentTarget.getAttribute('data-type'));
    e.dataTransfer.effectAllowed = 'copy';
  }

  function onCanvasDrop(e) {
    e.preventDefault();
    const type = e.dataTransfer.getData('text/plain');
    if (!type || !nodeTypes[type]) return;

    const svg = document.getElementById('main-svg');
    const pt = svgPoint(svg, e.clientX, e.clientY);

    addNode(type, pt.x - NODE_W / 2, pt.y - NODE_H / 2);
  }

  // ─── Events: SVG interactions ─────────────────────────────────────
  function onNodeMouseDown(e) {
    const group = e.currentTarget;
    const nodeId = group.getAttribute('data-id');

    // Check if clicking on a port
    if (e.target.classList.contains('port')) {
      e.stopPropagation();
      const dir = e.target.getAttribute('data-dir');
      const portName = e.target.getAttribute('data-port');
      const portNodeId = e.target.getAttribute('data-node');

      if (dir === 'output') {
        const svg = document.getElementById('main-svg');
        const pt = svgPoint(svg, e.clientX, e.clientY);
        const fromNode = pathData.nodes.find((n) => n.id === portNodeId);
        const fromPos = getOutputPortPos(fromNode, portName);

        const tempLine = svgEl('path', {
          class: 'connection-temp',
          d: curvePath(fromPos.x, fromPos.y, pt.x, pt.y),
        });
        document.getElementById('connections-layer').appendChild(tempLine);

        connectState = { fromNodeId: portNodeId, fromPort: portName, tempLine, fromPos };
      }
      return;
    }

    e.stopPropagation();
    selectNode(nodeId);

    const svg = document.getElementById('main-svg');
    const pt = svgPoint(svg, e.clientX, e.clientY);
    const node = pathData.nodes.find((n) => n.id === nodeId);
    if (!node) return;

    dragState = {
      nodeId,
      offsetX: pt.x - node.x,
      offsetY: pt.y - node.y,
    };
  }

  function onSvgMouseDown(e) {
    if (e.target.classList.contains('port')) return;
    if (e.target.closest('.node-group')) return;

    // Pan
    panState = {
      startX: e.clientX,
      startY: e.clientY,
      startPanX: viewBox.x,
      startPanY: viewBox.y,
    };
    document.getElementById('main-svg').style.cursor = 'grabbing';
  }

  function onSvgMouseMove(e) {
    const svg = document.getElementById('main-svg');

    // Dragging a node
    if (dragState) {
      const pt = svgPoint(svg, e.clientX, e.clientY);
      const node = pathData.nodes.find((n) => n.id === dragState.nodeId);
      if (node) {
        node.x = Math.round((pt.x - dragState.offsetX) / 10) * 10;
        node.y = Math.round((pt.y - dragState.offsetY) / 10) * 10;
        dirty = true;
        renderCanvas();
      }
      return;
    }

    // Drawing a connection
    if (connectState) {
      const pt = svgPoint(svg, e.clientX, e.clientY);
      connectState.tempLine.setAttribute('d',
        curvePath(connectState.fromPos.x, connectState.fromPos.y, pt.x, pt.y)
      );
      return;
    }

    // Panning
    if (panState) {
      const dx = (e.clientX - panState.startX) / zoom;
      const dy = (e.clientY - panState.startY) / zoom;
      viewBox.x = panState.startPanX - dx;
      viewBox.y = panState.startPanY - dy;
      svg.setAttribute('viewBox', `${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`);
      renderMinimap();
    }
  }

  function onSvgMouseUp(e) {
    const svg = document.getElementById('main-svg');
    svg.style.cursor = '';

    if (dragState) {
      dragState = null;
      return;
    }

    if (connectState) {
      // Check if dropped on an input port
      const target = e.target;
      if (target.classList.contains('port') && target.getAttribute('data-dir') === 'input') {
        const toNodeId = target.getAttribute('data-node');
        const toPort = target.getAttribute('data-port');
        if (toNodeId !== connectState.fromNodeId) {
          addConnection(connectState.fromNodeId, connectState.fromPort, toNodeId, toPort);
        }
      }
      if (connectState.tempLine.parentNode) {
        connectState.tempLine.parentNode.removeChild(connectState.tempLine);
      }
      connectState = null;
      return;
    }

    panState = null;
  }

  function onSvgClick(e) {
    if (!e.target.closest('.node-group') && !e.target.classList.contains('port')) {
      selectNode(null);
    }
  }

  function onSvgWheel(e) {
    e.preventDefault();
    const svg = document.getElementById('main-svg');
    const pt = svgPoint(svg, e.clientX, e.clientY);
    const delta = e.deltaY > 0 ? 1.1 : 0.9;
    const newZoom = Math.max(0.2, Math.min(5, zoom * (1 / delta)));

    const scale = zoom / newZoom;
    viewBox.x = pt.x - (pt.x - viewBox.x) * scale;
    viewBox.y = pt.y - (pt.y - viewBox.y) * scale;
    viewBox.w *= scale;
    viewBox.h *= scale;
    zoom = newZoom;

    svg.setAttribute('viewBox', `${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`);
    document.getElementById('zoom-label').textContent = Math.round(zoom * 100) + '%';
    renderMinimap();
  }

  // ─── Node operations ──────────────────────────────────────────────
  function addNode(type, x, y) {
    const nt = nodeTypes[type];
    if (!nt) return;

    // Check max instances
    if (nt.maxInstances) {
      const count = pathData.nodes.filter((n) => n.type === type).length;
      if (count >= nt.maxInstances) {
        toast(`Only ${nt.maxInstances} ${nt.label} node(s) allowed`, 'error');
        return;
      }
    }

    const node = {
      id: 'node_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      type,
      x: Math.round(x / 10) * 10,
      y: Math.round(y / 10) * 10,
      data: {},
    };

    // Set defaults from field definitions
    for (const field of nt.fields || []) {
      if (field.default !== undefined) {
        node.data[field.name] = field.default;
      }
    }

    pathData.nodes.push(node);
    dirty = true;
    selectNode(node.id);
    renderCanvas();
  }

  function deleteNode(nodeId) {
    pathData.nodes = pathData.nodes.filter((n) => n.id !== nodeId);
    pathData.connections = pathData.connections.filter(
      (c) => c.from !== nodeId && c.to !== nodeId
    );
    if (selectedNodeId === nodeId) selectNode(null);
    dirty = true;
    renderCanvas();
  }

  function selectNode(nodeId) {
    selectedNodeId = nodeId;
    renderNodes(); // update selection visual
    renderProperties();
  }

  // ─── Connection operations ────────────────────────────────────────
  function addConnection(fromId, fromPort, toId, toPort) {
    // Prevent duplicate connections
    const exists = pathData.connections.some(
      (c) => c.from === fromId && c.fromPort === fromPort && c.to === toId && c.toPort === toPort
    );
    if (exists) return;

    // Prevent multiple connections to the same input port
    const inputTaken = pathData.connections.some(
      (c) => c.to === toId && c.toPort === toPort
    );
    if (inputTaken) {
      toast('Input port already connected', 'error');
      return;
    }

    pathData.connections.push({ from: fromId, fromPort, to: toId, toPort });
    dirty = true;
    renderCanvas();
  }

  function removeConnection(fromId, fromPort, toId, toPort) {
    pathData.connections = pathData.connections.filter(
      (c) => !(c.from === fromId && c.fromPort === fromPort && c.to === toId && c.toPort === toPort)
    );
    dirty = true;
    renderCanvas();
  }

  // ─── Properties panel ─────────────────────────────────────────────
  function renderProperties() {
    const panel = document.getElementById('properties-panel');
    if (!panel) return;

    if (!selectedNodeId) {
      panel.classList.remove('open');
      return;
    }

    const node = pathData.nodes.find((n) => n.id === selectedNodeId);
    if (!node) {
      panel.classList.remove('open');
      return;
    }

    const nt = nodeTypes[node.type] || {};
    panel.classList.add('open');

    let html = `<h3><span>${nt.icon || ''} ${nt.label || node.type}</span><button onclick="LPEditor.selectNode(null)">&times;</button></h3>`;

    // Fields
    for (const field of nt.fields || []) {
      const val = node.data?.[field.name] ?? field.default ?? '';
      html += `<div class="prop-section"><label>${escHtml(field.label)}</label>`;

      switch (field.type) {
        case 'text':
          html += `<input type="text" value="${escAttr(val)}" data-field="${field.name}" onchange="LPEditor.updateField('${field.name}', this.value)">`;
          break;
        case 'textarea':
        case 'richtext':
          html += `<textarea data-field="${field.name}" onchange="LPEditor.updateField('${field.name}', this.value)">${escHtml(val)}</textarea>`;
          break;
        case 'url':
          html += `<input type="url" value="${escAttr(val)}" data-field="${field.name}" onchange="LPEditor.updateField('${field.name}', this.value)">`;
          break;
        case 'number':
          html += `<input type="number" value="${escAttr(val)}" data-field="${field.name}" onchange="LPEditor.updateField('${field.name}', parseFloat(this.value))">`;
          break;
        case 'checkbox':
          html += `<div class="checkbox-wrap"><input type="checkbox" ${val ? 'checked' : ''} onchange="LPEditor.updateField('${field.name}', this.checked)"><label>${escHtml(field.label)}</label></div>`;
          break;
        case 'select':
          html += `<select data-field="${field.name}" onchange="LPEditor.updateField('${field.name}', this.value)">`;
          for (const opt of field.options || []) {
            html += `<option value="${escAttr(opt)}" ${val === opt ? 'selected' : ''}>${escHtml(opt)}</option>`;
          }
          html += `</select>`;
          break;
        case 'h5p-picker':
          html += val
            ? `<div class="h5p-selected">Selected: ${escHtml(h5pContent.find(c => String(c.id) === String(val))?.title || val)}</div>`
            : '';
          html += `<button class="h5p-picker-btn" onclick="LPEditor.showH5pModal('${field.name}')">Choose H5P Content</button>`;
          break;
      }
      html += `</div>`;
    }

    // Delete button
    if (node.type !== 'start' || pathData.nodes.filter((n) => n.type === 'start').length > 1) {
      html += `<div class="prop-section"><button class="prop-delete-btn" onclick="LPEditor.deleteNode('${node.id}')">Delete Node</button></div>`;
    }

    panel.innerHTML = html;
  }

  function updateField(fieldName, value) {
    const node = pathData.nodes.find((n) => n.id === selectedNodeId);
    if (!node) return;
    if (!node.data) node.data = {};
    node.data[fieldName] = value;
    dirty = true;
    renderCanvas();
  }

  // ─── Minimap ──────────────────────────────────────────────────────
  function renderMinimap() {
    const mmSvg = document.getElementById('minimap-svg');
    if (!mmSvg) return;

    // Compute bounds of all nodes
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const node of pathData.nodes) {
      minX = Math.min(minX, node.x);
      minY = Math.min(minY, node.y);
      maxX = Math.max(maxX, node.x + NODE_W);
      maxY = Math.max(maxY, node.y + NODE_H);
    }
    if (!isFinite(minX)) { minX = 0; minY = 0; maxX = 800; maxY = 600; }

    const pad = 100;
    const mmW = maxX - minX + pad * 2;
    const mmH = maxY - minY + pad * 2;
    mmSvg.setAttribute('viewBox', `${minX - pad} ${minY - pad} ${mmW} ${mmH}`);

    let html = '';
    // Node dots
    for (const node of pathData.nodes) {
      const nt = nodeTypes[node.type] || {};
      html += `<rect x="${node.x}" y="${node.y}" width="${NODE_W}" height="${NODE_H}" rx="3" fill="${nt.color || '#555'}" opacity="0.8"/>`;
    }
    // Connection lines
    for (const conn of pathData.connections) {
      const from = pathData.nodes.find((n) => n.id === conn.from);
      const to = pathData.nodes.find((n) => n.id === conn.to);
      if (from && to) {
        html += `<line x1="${from.x + NODE_W}" y1="${from.y + NODE_H / 2}" x2="${to.x}" y2="${to.y + NODE_H / 2}" stroke="#555" stroke-width="2"/>`;
      }
    }
    // Viewport rectangle
    html += `<rect class="viewport-rect" x="${viewBox.x}" y="${viewBox.y}" width="${viewBox.w}" height="${viewBox.h}"/>`;

    mmSvg.innerHTML = html;
  }

  // ─── Save / Load ──────────────────────────────────────────────────
  async function save() {
    const titleInput = document.getElementById('path-title');
    pathData.title = titleInput ? titleInput.value : pathData.title;

    const statusEl = document.getElementById('save-status');
    try {
      let res;
      if (pathId) {
        res = await fetch(`/learning-paths/api/paths/${pathId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(pathData),
        });
      } else {
        res = await fetch('/learning-paths/api/paths', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(pathData),
        });
      }
      const data = await res.json();
      if (!pathId && data.id) {
        pathId = data.id;
        pathData.id = data.id;
        history.replaceState(null, '', `/learning-paths/editor/${pathId}`);
      }
      dirty = false;
      if (statusEl) statusEl.textContent = 'Saved';
      setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 2000);
      toast('Learning path saved', 'success');
    } catch (err) {
      toast('Failed to save: ' + err.message, 'error');
    }
  }

  async function validate() {
    if (!pathId) {
      toast('Save the learning path first', 'error');
      return;
    }
    try {
      const res = await fetch(`/learning-paths/api/paths/${pathId}/validate`, { method: 'POST' });
      const result = await res.json();
      if (result.valid) {
        toast('Learning path is valid!', 'success');
      } else {
        toast('Validation errors:\n' + result.errors.join('\n'), 'error');
      }
    } catch (err) {
      toast('Validation failed: ' + err.message, 'error');
    }
  }

  // ─── LRS Modal ────────────────────────────────────────────────────
  function showLrsModal() {
    document.getElementById('lrs-modal').classList.remove('hidden');
  }

  function hideLrsModal() {
    document.getElementById('lrs-modal').classList.add('hidden');
  }

  function saveLrs() {
    pathData.lrsConfig = {
      endpoint: document.getElementById('lrs-endpoint').value.trim(),
      key: document.getElementById('lrs-key').value.trim(),
      secret: document.getElementById('lrs-secret').value.trim(),
    };
    dirty = true;
    hideLrsModal();
    toast('LRS configuration updated', 'success');
  }

  // ─── H5P Picker Modal ────────────────────────────────────────────
  let h5pPickerField = null;
  let h5pPickerSelected = null;

  function showH5pModal(fieldName) {
    h5pPickerField = fieldName;
    h5pPickerSelected = null;
    const list = document.getElementById('h5p-picker-list');
    if (h5pContent.length === 0) {
      list.innerHTML = '<div style="padding:14px;color:#888">No H5P content found. Create some first!</div>';
    } else {
      list.innerHTML = h5pContent.map((c) =>
        `<div class="h5p-picker-item" data-id="${c.id}" onclick="LPEditor.pickH5p(this, '${c.id}')">${escHtml(c.title)}</div>`
      ).join('');
    }
    document.getElementById('h5p-modal').classList.remove('hidden');
  }

  function hideH5pModal() {
    document.getElementById('h5p-modal').classList.add('hidden');
  }

  function pickH5p(el, id) {
    document.querySelectorAll('.h5p-picker-item').forEach((e) => e.classList.remove('selected'));
    el.classList.add('selected');
    h5pPickerSelected = id;
  }

  function selectH5p() {
    if (h5pPickerSelected && h5pPickerField) {
      updateField(h5pPickerField, h5pPickerSelected);
      renderProperties();
    }
    hideH5pModal();
  }

  // ─── Zoom controls ────────────────────────────────────────────────
  function zoomIn() {
    setZoom(zoom * 1.25);
  }

  function zoomOut() {
    setZoom(zoom / 1.25);
  }

  function zoomFit() {
    if (pathData.nodes.length === 0) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const node of pathData.nodes) {
      minX = Math.min(minX, node.x);
      minY = Math.min(minY, node.y);
      maxX = Math.max(maxX, node.x + NODE_W);
      maxY = Math.max(maxY, node.y + NODE_H);
    }
    const pad = 80;
    viewBox.x = minX - pad;
    viewBox.y = minY - pad;
    viewBox.w = maxX - minX + pad * 2;
    viewBox.h = maxY - minY + pad * 2;

    const svg = document.getElementById('main-svg');
    const rect = svg.getBoundingClientRect();
    zoom = Math.min(rect.width / viewBox.w, rect.height / viewBox.h);

    svg.setAttribute('viewBox', `${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`);
    document.getElementById('zoom-label').textContent = Math.round(zoom * 100) + '%';
    renderMinimap();
  }

  function setZoom(newZoom) {
    newZoom = Math.max(0.2, Math.min(5, newZoom));
    const cx = viewBox.x + viewBox.w / 2;
    const cy = viewBox.y + viewBox.h / 2;
    const scale = zoom / newZoom;
    viewBox.w *= scale;
    viewBox.h *= scale;
    viewBox.x = cx - viewBox.w / 2;
    viewBox.y = cy - viewBox.h / 2;
    zoom = newZoom;

    const svg = document.getElementById('main-svg');
    svg.setAttribute('viewBox', `${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`);
    document.getElementById('zoom-label').textContent = Math.round(zoom * 100) + '%';
    renderMinimap();
  }

  // ─── Helpers ──────────────────────────────────────────────────────
  function el(tag, attrs) {
    const elem = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) elem.setAttribute(k, v);
    return elem;
  }

  function svgEl(tag, attrs) {
    const elem = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [k, v] of Object.entries(attrs || {})) elem.setAttribute(k, v);
    return elem;
  }

  function svgPoint(svg, clientX, clientY) {
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  }

  function escHtml(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function escAttr(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function truncate(str, len) {
    return str.length > len ? str.substring(0, len - 1) + '\u2026' : str;
  }

  function toast(msg, type) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const t = document.createElement('div');
    t.className = 'toast ' + (type || 'info');
    t.textContent = msg;
    container.appendChild(t);
    setTimeout(() => { t.remove(); }, 4000);
  }

  // ─── Keyboard shortcuts ───────────────────────────────────────────
  document.addEventListener('keydown', (e) => {
    // Delete selected node
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedNodeId && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
      e.preventDefault();
      deleteNode(selectedNodeId);
    }
    // Ctrl+S to save
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      save();
    }
  });

  // ─── Public API (for inline onclick handlers) ─────────────────────
  window.LPEditor = {
    save,
    validate,
    showLrsModal,
    hideLrsModal,
    saveLrs,
    showH5pModal,
    hideH5pModal,
    pickH5p,
    selectH5p,
    selectNode: selectNode,
    deleteNode,
    updateField,
    zoomIn,
    zoomOut,
    zoomFit,
  };

})();
