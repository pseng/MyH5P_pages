/**
 * Learning Path Player
 * Graph-based learner navigation through a node-based learning path.
 * Sends xAPI statements to the configured LRS.
 */
(function () {
  'use strict';

  let pathData = null;
  let nodeMap = {};               // nodeId -> node
  let outConns = {};              // fromNodeId -> [connections]
  let orderedNodes = [];          // All reachable nodes (DFS order) for sidebar/progress
  let currentNodeId = null;
  let history = [];               // Stack of visited nodeIds for "back" navigation
  let nodeStates = {};            // nodeId -> { status: 'pending'|'active'|'completed', score, startTime }
  let hasLrs = false;

  // ─── Init ──────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', () => {
    const appEl = document.getElementById('app');
    const raw = appEl.getAttribute('data-path');
    if (!raw) return;
    try {
      pathData = JSON.parse(raw);
    } catch {
      appEl.innerHTML = '<div style="padding:40px;color:red;">Failed to load learning path data.</div>';
      return;
    }

    if (!pathData.nodes || pathData.nodes.length === 0) {
      appEl.innerHTML = '<div style="padding:40px;color:#888;">This learning path has no nodes.</div>';
      return;
    }

    hasLrs = !!(pathData.lrsConfig && pathData.lrsConfig.endpoint);

    // Build lookup structures
    for (const node of pathData.nodes) {
      nodeMap[node.id] = node;
    }
    for (const conn of (pathData.connections || [])) {
      if (!outConns[conn.from]) outConns[conn.from] = [];
      outConns[conn.from].push(conn);
    }

    // Build full traversal for sidebar / progress
    orderedNodes = buildFullTraversal();

    // Init node states
    for (const node of orderedNodes) {
      nodeStates[node.id] = { status: 'pending', score: null, startTime: null };
    }

    buildUI();

    // Navigate to the first playable node
    if (orderedNodes.length > 0) {
      goToNode(orderedNodes[0].id);
    }
  });

  // ─── Graph Traversal ───────────────────────────────────────────────

  /** Port priority when walking the graph. */
  const PORT_PRIORITY = ['next', 'pass', 'pathA', 'pathB', 'fail'];

  function sortConnsByPriority(conns) {
    return [...conns].sort((a, b) => {
      const ai = PORT_PRIORITY.indexOf(a.fromPort);
      const bi = PORT_PRIORITY.indexOf(b.fromPort);
      return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi);
    });
  }

  /**
   * Build a complete list of all reachable nodes via DFS from Start.
   * Used for sidebar display and progress tracking.
   */
  function buildFullTraversal() {
    const startNode = pathData.nodes.find((n) => n.type === 'start');
    if (!startNode) {
      return pathData.nodes.filter((n) => n.type !== 'start' && n.type !== 'end');
    }

    const ordered = [];
    const visited = new Set();

    function dfs(nodeId) {
      if (!nodeId || visited.has(nodeId)) return;
      visited.add(nodeId);

      const node = nodeMap[nodeId];
      if (!node) return;

      // Exclude start from the playable list
      if (node.type !== 'start') {
        ordered.push(node);
      }

      // Follow connections in priority order
      const conns = outConns[nodeId] || [];
      for (const conn of sortConnsByPriority(conns)) {
        dfs(conn.to);
      }
    }

    dfs(startNode.id);

    if (ordered.length === 0) {
      return pathData.nodes.filter((n) => n.type !== 'start');
    }
    return ordered;
  }

  /**
   * Find the next node from a given node, optionally preferring a specific port.
   */
  function getNextNodeId(fromId, preferPort) {
    const conns = outConns[fromId] || [];
    if (conns.length === 0) return null;

    // If a specific port is requested, try it first
    if (preferPort) {
      const match = conns.find((c) => c.fromPort === preferPort);
      if (match) return match.to;
    }

    // Otherwise follow priority order
    const sorted = sortConnsByPriority(conns);
    return sorted[0].to;
  }

  // ─── Build DOM ─────────────────────────────────────────────────────
  function buildUI() {
    const app = document.getElementById('app');
    app.innerHTML = '';

    // Top bar
    const topbar = document.createElement('div');
    topbar.id = 'player-topbar';
    topbar.innerHTML = `
      <a href="/learning-paths" class="brand">MyH5P</a>
      <span class="title">${esc(pathData.title)}
        <span class="lrs-indicator">
          <span class="dot ${hasLrs ? '' : 'inactive'}"></span>
          ${hasLrs ? 'LRS Connected' : 'No LRS'}
        </span>
      </span>
      <a href="/learning-paths" class="back-btn">Exit</a>
    `;
    app.appendChild(topbar);

    // Progress bar
    const progWrap = document.createElement('div');
    progWrap.id = 'progress-bar-wrap';
    progWrap.innerHTML = '<div id="progress-bar"></div>';
    app.appendChild(progWrap);

    // Layout
    const layout = document.createElement('div');
    layout.id = 'player-layout';

    // Sidebar
    const sidebar = document.createElement('div');
    sidebar.id = 'player-sidebar';
    layout.appendChild(sidebar);

    // Content area
    const content = document.createElement('div');
    content.id = 'player-content';
    content.innerHTML = '<div id="content-display"></div><div id="nav-buttons"></div>';
    layout.appendChild(content);

    app.appendChild(layout);

    renderSidebar();
  }

  // ─── Sidebar ───────────────────────────────────────────────────────
  function renderSidebar() {
    const sidebar = document.getElementById('player-sidebar');
    if (!sidebar) return;
    sidebar.innerHTML = '';

    orderedNodes.forEach((node) => {
      if (node.type === 'start') return;

      const state = nodeStates[node.id] || {};
      const nt = getNodeTypeInfo(node.type);
      const isActive = node.id === currentNodeId;
      const isCompleted = state.status === 'completed';

      const item = document.createElement('div');
      item.className = 'sidebar-node' + (isActive ? ' active' : '') + (isCompleted ? ' completed' : '');
      item.onclick = () => goToNode(node.id);
      item.innerHTML = `
        <div class="node-icon-sm" style="background:${nt.color}">${nt.icon}</div>
        <div class="node-info">
          <div class="node-name">${esc(node.data?.title || nt.label)}</div>
          <div class="node-type">${esc(nt.label)}${node.data?.estimatedMinutes ? ' &middot; ~' + node.data.estimatedMinutes + ' min' : ''}</div>
        </div>
        <div class="node-status">${isCompleted ? '\u2705' : isActive ? '\u25B6\uFE0F' : '\u25CB'}</div>
      `;
      sidebar.appendChild(item);
    });
  }

  // ─── Navigation ────────────────────────────────────────────────────
  function goToNode(nodeId) {
    const node = nodeMap[nodeId];
    if (!node) return;

    // If navigating away from the current node, auto-complete it
    if (currentNodeId && currentNodeId !== nodeId) {
      const prevState = nodeStates[currentNodeId];
      if (prevState && prevState.status === 'active') {
        markNodeCompleted(currentNodeId);
      }
      history.push(currentNodeId);
    }

    currentNodeId = nodeId;

    // Mark as active
    if (nodeStates[nodeId]) {
      if (nodeStates[nodeId].status !== 'completed') {
        nodeStates[nodeId].status = 'active';
      }
      nodeStates[nodeId].startTime = new Date().toISOString();
    }

    sendXapi('launched', node);
    renderContent(node);
    renderSidebar();
    updateProgress();
  }

  function next() {
    if (!currentNodeId) return;
    markNodeCompleted(currentNodeId);

    const nextId = getNextNodeId(currentNodeId);
    if (nextId) {
      goToNode(nextId);
    }
  }

  function prev() {
    if (history.length === 0) return;
    // Pop last node from history and navigate back
    // Don't push to history (to avoid back/forward loops)
    const prevId = history.pop();
    currentNodeId = prevId;

    if (nodeStates[prevId] && nodeStates[prevId].status !== 'completed') {
      nodeStates[prevId].status = 'active';
    }

    renderContent(nodeMap[prevId]);
    renderSidebar();
    updateProgress();
  }

  function passGate() {
    if (!currentNodeId) return;
    markNodeCompleted(currentNodeId);
    const nextId = getNextNodeId(currentNodeId, 'pass');
    if (nextId) {
      goToNode(nextId);
    }
  }

  function chooseBranch(portName) {
    if (!currentNodeId) return;
    markNodeCompleted(currentNodeId);
    const nextId = getNextNodeId(currentNodeId, portName);
    if (nextId) {
      goToNode(nextId);
    } else {
      // Fallback: follow default priority
      const fallbackId = getNextNodeId(currentNodeId);
      if (fallbackId) goToNode(fallbackId);
    }
  }

  // ─── Content Rendering ─────────────────────────────────────────────
  function renderContent(node) {
    const display = document.getElementById('content-display');
    const navArea = document.getElementById('nav-buttons');
    if (!display || !navArea) return;

    const nt = getNodeTypeInfo(node.type);

    // ── End node → completion screen ──
    if (node.type === 'end') {
      display.innerHTML = `
        <div class="completion-screen">
          <div class="check-icon">\u2705</div>
          <h1>Learning Path Complete!</h1>
          <p>${esc(node.data?.completionMessage || 'Congratulations! You have completed this learning path.')}</p>
          <a href="/learning-paths">Back to Learning Paths</a>
        </div>
      `;
      navArea.innerHTML = history.length > 0
        ? `<button onclick="LPPlayer.prev()">&larr; Previous</button><span></span><span></span>`
        : '';
      markNodeCompleted(node.id);
      sendXapiPathCompleted();
      return;
    }

    // ── Build content body based on node type ──
    let bodyHtml = '';

    switch (node.type) {
      case 'theory':
      case 'wiki':
        bodyHtml = node.data?.content || '<p style="color:#888">No content provided.</p>';
        break;

      case 'guidedLab':
        bodyHtml = node.data?.instructions || '<p style="color:#888">No instructions provided.</p>';
        if (node.data?.labUrl) {
          bodyHtml += `<div style="margin-top:16px"><a href="${escAttr(node.data.labUrl)}" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;gap:6px;padding:10px 20px;background:#FF9800;color:#fff;border-radius:6px;text-decoration:none;font-weight:500">Launch Lab Environment &rarr;</a></div>`;
        }
        break;

      case 'url':
        if (node.data?.url) {
          if (node.data.openInNewTab) {
            bodyHtml = `<div class="url-embed">
              <a class="external-link" href="${escAttr(node.data.url)}" target="_blank" rel="noopener noreferrer">Open: ${esc(node.data.url)} &rarr;</a>
            </div>`;
          } else {
            bodyHtml = `<div class="url-embed">
              <iframe src="${escAttr(node.data.url)}" sandbox="allow-scripts allow-same-origin allow-forms allow-popups"></iframe>
              <a class="external-link" href="${escAttr(node.data.url)}" target="_blank" rel="noopener noreferrer">Open in new tab &rarr;</a>
            </div>`;
          }
        } else {
          bodyHtml = '<p style="color:#888">No URL configured.</p>';
        }
        break;

      case 'h5p':
        if (node.data?.h5pContentId) {
          bodyHtml = `<iframe src="/learning-paths/h5p-embed/${escAttr(node.data.h5pContentId)}" style="min-height:600px" allow="fullscreen"></iframe>`;
        } else {
          bodyHtml = '<p style="color:#888">No H5P content selected.</p>';
        }
        break;

      case 'cmi5':
      case 'scorm':
        if (node.data?.packageUrl) {
          bodyHtml = `<iframe src="${escAttr(node.data.packageUrl)}" style="min-height:600px" allow="fullscreen"></iframe>
            <p style="margin-top:8px;font-size:12px;color:#888">Package type: ${esc(node.type.toUpperCase())}${node.data?.scormVersion ? ' ' + esc(node.data.scormVersion) : ''}</p>`;
        } else {
          bodyHtml = '<p style="color:#888">No package URL configured.</p>';
        }
        break;

      case 'gate':
        bodyHtml = `<div style="text-align:center;padding:40px">
          <div style="font-size:48px;margin-bottom:16px">\uD83D\uDEA7</div>
          <h2>Progress Check</h2>
          <p style="color:#666;margin:12px 0">Required score: ${node.data?.requiredScore || 70}%</p>
          <button onclick="LPPlayer.passGate()" style="margin-top:16px;padding:10px 28px;background:#00897b;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:14px">Continue &rarr;</button>
        </div>`;
        break;

      case 'branch':
        bodyHtml = `<div style="text-align:center;padding:24px">
          <h2>${esc(node.data?.title || 'Choose your path')}</h2>
          <div class="branch-choices">
            <div class="branch-choice" onclick="LPPlayer.chooseBranch('pathA')">
              <h3>${esc(node.data?.pathALabel || 'Path A')}</h3>
              <p>Continue with this learning track</p>
            </div>
            <div class="branch-choice" onclick="LPPlayer.chooseBranch('pathB')">
              <h3>${esc(node.data?.pathBLabel || 'Path B')}</h3>
              <p>Continue with this learning track</p>
            </div>
          </div>
        </div>`;
        break;

      default:
        bodyHtml = '<p style="color:#888">Unsupported node type.</p>';
    }

    display.innerHTML = `
      <h1>${esc(node.data?.title || nt.label)}</h1>
      ${node.data?.description ? `<div class="content-description">${esc(node.data.description)}</div>` : ''}
      ${node.data?.estimatedMinutes ? `<div style="color:#888;font-size:13px;margin-bottom:16px">\u23F1 ~${node.data.estimatedMinutes} min</div>` : ''}
      <div class="content-body">${bodyHtml}</div>
    `;

    // ── Nav buttons ──
    const hasNext = !!(getNextNodeId(currentNodeId));
    const hasPrev = history.length > 0;
    const total = orderedNodes.filter((n) => n.type !== 'end').length;
    const completed = Object.values(nodeStates).filter((s) => s.status === 'completed').length;

    // Don't show default nav for gate/branch (they have their own controls)
    if (node.type === 'gate' || node.type === 'branch') {
      navArea.innerHTML = `
        <button onclick="LPPlayer.prev()" ${hasPrev ? '' : 'disabled'}>&larr; Previous</button>
        <span class="completion-info">${completed} of ${total} completed</span>
        <span></span>
      `;
    } else {
      navArea.innerHTML = `
        <button onclick="LPPlayer.prev()" ${hasPrev ? '' : 'disabled'}>&larr; Previous</button>
        <span class="completion-info">${completed} of ${total} completed</span>
        <button class="primary" onclick="LPPlayer.next()" ${hasNext ? '' : 'disabled'}>Mark Complete &amp; Next &rarr;</button>
      `;
    }
  }

  // ─── Completion Tracking ───────────────────────────────────────────
  function markNodeCompleted(nodeId) {
    const state = nodeStates[nodeId];
    if (!state) return;
    if (state.status === 'completed') return; // already done

    state.status = 'completed';

    const node = nodeMap[nodeId];
    if (node) {
      const duration = state.startTime
        ? formatDuration(new Date(state.startTime), new Date())
        : undefined;
      sendXapi('completed', node, { completion: true, duration });
    }
  }

  function updateProgress() {
    const total = orderedNodes.filter((n) => n.type !== 'end').length;
    const completed = Object.values(nodeStates).filter(
      (s) => s.status === 'completed'
    ).length;
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
    const bar = document.getElementById('progress-bar');
    if (bar) bar.style.width = pct + '%';
  }

  // ─── xAPI ──────────────────────────────────────────────────────────
  async function sendXapi(verb, node, result) {
    if (!hasLrs || !pathData.id) return;
    try {
      await fetch(`/learning-paths/api/paths/${pathData.id}/xapi`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verb, nodeId: node.id, result }),
      });
    } catch {
      // silently fail for xAPI - don't block the learner
    }
  }

  async function sendXapiPathCompleted() {
    if (!hasLrs || !pathData.id) return;
    const endNode = pathData.nodes.find((n) => n.type === 'end');
    if (endNode) {
      sendXapi('completed', endNode, { completion: true });
    }
  }

  // ─── Helpers ───────────────────────────────────────────────────────
  function getNodeTypeInfo(type) {
    const defaults = {
      start: { label: 'Start', color: '#4CAF50', icon: '\u25B6' },
      end: { label: 'End', color: '#f44336', icon: '\u23F9' },
      theory: { label: 'Theory Unit', color: '#2196F3', icon: '\uD83D\uDCD6' },
      guidedLab: { label: 'Guided Lab', color: '#FF9800', icon: '\uD83D\uDD2C' },
      wiki: { label: 'Wiki Page', color: '#9C27B0', icon: '\uD83D\uDCDD' },
      url: { label: 'Website URL', color: '#00BCD4', icon: '\uD83C\uDF10' },
      h5p: { label: 'H5P Package', color: '#1a73e8', icon: '\uD83C\uDF93' },
      cmi5: { label: 'cmi5 Package', color: '#E91E63', icon: '\uD83D\uDCE6' },
      scorm: { label: 'SCORM Package', color: '#795548', icon: '\uD83D\uDCDA' },
      gate: { label: 'Gate', color: '#FF5722', icon: '\uD83D\uDEA7' },
      branch: { label: 'Branch', color: '#607D8B', icon: '\uD83D\uDD00' },
    };
    return defaults[type] || { label: type, color: '#555', icon: '?' };
  }

  function esc(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function escAttr(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function formatDuration(start, end) {
    const ms = end.getTime() - start.getTime();
    const secs = Math.floor(ms / 1000);
    const mins = Math.floor(secs / 60);
    const hours = Math.floor(mins / 60);
    return `PT${hours ? hours + 'H' : ''}${mins % 60}M${secs % 60}S`;
  }

  // ─── Public API ────────────────────────────────────────────────────
  window.LPPlayer = {
    next,
    prev,
    passGate,
    chooseBranch,
  };

})();
