/**
 * Learning Path Player
 * Walks learners through a node-based learning path, tracking progress via xAPI.
 */
(function () {
  'use strict';

  let pathData = null;
  let orderedNodes = [];        // Nodes in traversal order (flattened)
  let currentIndex = 0;
  let nodeStates = {};          // nodeId -> { status: 'pending'|'active'|'completed', score, startTime }
  let hasLrs = false;

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

    hasLrs = !!(pathData.lrsConfig && pathData.lrsConfig.endpoint);
    orderedNodes = buildNodeOrder(pathData);

    // Init node states
    for (const node of orderedNodes) {
      nodeStates[node.id] = { status: 'pending', score: null, startTime: null };
    }

    buildUI();
    navigateTo(0);
  });

  /**
   * Build a linear traversal order from the graph, starting at the Start node.
   * Follows 'next' connections; stops at End or dead ends.
   */
  function buildNodeOrder(data) {
    const { nodes, connections } = data;
    const startNode = nodes.find((n) => n.type === 'start');
    if (!startNode) return nodes.filter((n) => n.type !== 'start' && n.type !== 'end');

    const ordered = [];
    const visited = new Set();
    let current = startNode;

    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      // Don't include start/end in the playable nodes list unless they have content
      if (current.type !== 'start') {
        ordered.push(current);
      }

      // Follow the first output connection (next, pass, pathA, etc.)
      const outConns = connections.filter((c) => c.from === current.id);
      if (outConns.length === 0) break;

      // For branch/gate nodes with multiple outputs, we'll handle it in the player
      const nextConn = outConns[0]; // default: first connection
      current = nodes.find((n) => n.id === nextConn.to);
    }

    // If no traversal possible, fallback to all content nodes
    if (ordered.length === 0) {
      return nodes.filter((n) => n.type !== 'start');
    }

    return ordered;
  }

  function buildUI() {
    const app = document.getElementById('app');
    app.innerHTML = '';

    // Top bar
    const topbar = document.createElement('div');
    topbar.id = 'player-topbar';
    topbar.innerHTML = `
      <a href="/learning-paths" class="brand">MyH5P</a>
      <span class="title">${esc(pathData.title)}</span>
      ${hasLrs ? '<span class="lrs-indicator"><span class="dot"></span>xAPI Active</span>' : '<span class="lrs-indicator"><span class="dot inactive"></span>xAPI Inactive</span>'}
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

    // Content
    const content = document.createElement('div');
    content.id = 'player-content';
    content.innerHTML = '<div id="content-display"></div><div id="nav-buttons"></div>';
    layout.appendChild(content);

    app.appendChild(layout);

    renderSidebar();
  }

  function renderSidebar() {
    const sidebar = document.getElementById('player-sidebar');
    if (!sidebar) return;
    sidebar.innerHTML = '';

    orderedNodes.forEach((node, idx) => {
      const state = nodeStates[node.id] || {};
      const nt = getNodeType(node.type);
      const div = document.createElement('div');
      div.className = 'sidebar-node' + (idx === currentIndex ? ' active' : '') + (state.status === 'completed' ? ' completed' : '');
      div.innerHTML = `
        <div class="node-icon-sm" style="background:${nt.color || '#555'}">${nt.icon || '?'}</div>
        <div class="node-info">
          <div class="node-name">${esc(node.data?.title || nt.label || node.type)}</div>
          <div class="node-type">${esc(nt.label || node.type)}</div>
        </div>
        <span class="node-status">${state.status === 'completed' ? '\u2705' : state.status === 'active' ? '\u25B6' : '\u2B55'}</span>
      `;
      div.addEventListener('click', () => navigateTo(idx));
      sidebar.appendChild(div);
    });
  }

  function navigateTo(index) {
    if (index < 0 || index >= orderedNodes.length) return;

    // Mark previous node as completed if it was active
    if (currentIndex !== index && nodeStates[orderedNodes[currentIndex]?.id]?.status === 'active') {
      markCompleted(orderedNodes[currentIndex]);
    }

    currentIndex = index;
    const node = orderedNodes[currentIndex];

    // Mark as active
    nodeStates[node.id].status = 'active';
    nodeStates[node.id].startTime = new Date().toISOString();

    // Send xAPI launched statement
    sendXapi('launched', node);

    renderSidebar();
    renderContent(node);
    updateProgress();
  }

  function renderContent(node) {
    const display = document.getElementById('content-display');
    const navBtns = document.getElementById('nav-buttons');
    if (!display || !navBtns) return;

    const nt = getNodeType(node.type);

    // Check if this is the End node
    if (node.type === 'end') {
      display.innerHTML = `
        <div class="completion-screen">
          <div class="check-icon">\u2705</div>
          <h1>Learning Path Complete!</h1>
          <p>${esc(node.data?.completionMessage || 'Congratulations! You have completed this learning path.')}</p>
          <a href="/learning-paths">Back to Learning Paths</a>
        </div>
      `;
      navBtns.innerHTML = '';
      markCompleted(node);
      sendXapi('completed', node, { completion: true });
      return;
    }

    // Build content based on node type
    let bodyHtml = '';

    switch (node.type) {
      case 'theory':
      case 'wiki':
        bodyHtml = `<div class="content-body">${node.data?.content || '<p>No content provided.</p>'}</div>`;
        break;

      case 'guidedLab':
        bodyHtml = `<div class="content-body">`;
        if (node.data?.instructions) {
          bodyHtml += node.data.instructions;
        }
        if (node.data?.labUrl) {
          bodyHtml += `<div style="margin-top:16px"><iframe src="${escAttr(node.data.labUrl)}" style="width:100%;min-height:500px;border:1px solid #ddd;border-radius:4px;"></iframe></div>`;
        }
        bodyHtml += `</div>`;
        break;

      case 'url':
        bodyHtml = `<div class="content-body url-embed">`;
        if (node.data?.url) {
          if (node.data?.openInNewTab) {
            bodyHtml += `<a class="external-link" href="${escAttr(node.data.url)}" target="_blank" rel="noopener noreferrer">\u2197 Open: ${esc(node.data.url)}</a>`;
          } else {
            bodyHtml += `<iframe src="${escAttr(node.data.url)}" style="width:100%;min-height:500px;border:none;"></iframe>`;
            bodyHtml += `<a class="external-link" href="${escAttr(node.data.url)}" target="_blank" rel="noopener noreferrer">\u2197 Open in new tab</a>`;
          }
        } else {
          bodyHtml += '<p>No URL configured.</p>';
        }
        bodyHtml += `</div>`;
        break;

      case 'h5p':
        bodyHtml = `<div class="content-body">`;
        if (node.data?.h5pContentId) {
          bodyHtml += `<iframe src="/play/${escAttr(node.data.h5pContentId)}" style="width:100%;min-height:600px;border:none;"></iframe>`;
        } else {
          bodyHtml += '<p>No H5P content selected.</p>';
        }
        bodyHtml += `</div>`;
        break;

      case 'cmi5':
      case 'scorm':
        bodyHtml = `<div class="content-body">`;
        if (node.data?.packageUrl) {
          bodyHtml += `<iframe src="${escAttr(node.data.packageUrl)}" style="width:100%;min-height:600px;border:none;" allow="fullscreen"></iframe>`;
        } else {
          bodyHtml += `<p>No package URL configured.</p>`;
        }
        bodyHtml += `</div>`;
        break;

      case 'gate':
        bodyHtml = `<div class="content-body" style="text-align:center;padding:40px">
          <h2>\uD83D\uDEA7 ${esc(node.data?.title || 'Progress Check')}</h2>
          <p style="color:#666;margin:12px 0">You need a score of ${node.data?.requiredScore || 70}% or higher to proceed.</p>
          <button onclick="LPPlayer.passGate()" style="padding:10px 28px;background:#00897b;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:14px;margin-top:16px">Continue</button>
        </div>`;
        break;

      case 'branch':
        bodyHtml = `<div class="content-body">
          <h2 style="text-align:center;margin-bottom:20px">${esc(node.data?.title || 'Choose your path')}</h2>
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
        bodyHtml = `<div class="content-body"><p>Unsupported node type: ${esc(node.type)}</p></div>`;
    }

    const duration = node.data?.estimatedMinutes ? `<span style="color:#888;font-size:13px">\u23F1 ~${node.data.estimatedMinutes} min</span>` : '';

    display.innerHTML = `
      <h1>${esc(node.data?.title || nt.label || node.type)}</h1>
      ${node.data?.description ? `<p class="content-description">${esc(node.data.description)}</p>` : ''}
      ${duration}
      ${bodyHtml}
    `;

    // Nav buttons
    const isFirst = currentIndex === 0;
    const isLast = currentIndex === orderedNodes.length - 1;
    const completedCount = Object.values(nodeStates).filter((s) => s.status === 'completed').length;

    navBtns.innerHTML = `
      <button ${isFirst ? 'disabled' : ''} onclick="LPPlayer.prev()">\u2190 Previous</button>
      <span class="completion-info">${completedCount} / ${orderedNodes.length} completed</span>
      <button class="primary" ${isLast ? 'disabled' : ''} onclick="LPPlayer.next()">
        ${isLast ? 'Finish' : 'Mark Complete & Continue \u2192'}
      </button>
    `;
  }

  function markCompleted(node) {
    if (!node) return;
    nodeStates[node.id].status = 'completed';

    // Calculate duration
    const startTime = nodeStates[node.id].startTime;
    const duration = startTime ? formatDuration(new Date(startTime), new Date()) : undefined;

    sendXapi('completed', node, {
      completion: true,
      duration,
    });
  }

  function updateProgress() {
    const completed = Object.values(nodeStates).filter((s) => s.status === 'completed').length;
    const pct = orderedNodes.length > 0 ? (completed / orderedNodes.length) * 100 : 0;
    const bar = document.getElementById('progress-bar');
    if (bar) bar.style.width = pct + '%';
  }

  function next() {
    const current = orderedNodes[currentIndex];
    if (current) markCompleted(current);
    if (currentIndex < orderedNodes.length - 1) {
      navigateTo(currentIndex + 1);
    }
  }

  function prev() {
    if (currentIndex > 0) {
      navigateTo(currentIndex - 1);
    }
  }

  function passGate() {
    // For simplicity, gates auto-pass. In a real implementation,
    // you'd check the score from the previous node.
    next();
  }

  function chooseBranch(portName) {
    // Find the connection for the chosen branch
    const node = orderedNodes[currentIndex];
    if (!node) return;
    const conn = pathData.connections.find(
      (c) => c.from === node.id && c.fromPort === portName
    );
    if (conn) {
      const targetIdx = orderedNodes.findIndex((n) => n.id === conn.to);
      if (targetIdx >= 0) {
        markCompleted(node);
        navigateTo(targetIdx);
        return;
      }
    }
    // Fallback: just go next
    next();
  }

  // ─── xAPI helpers ─────────────────────────────────────────────────
  async function sendXapi(verb, node, result) {
    if (!hasLrs || !pathData.id) return;
    try {
      await fetch(`/learning-paths/api/paths/${pathData.id}/xapi`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verb, nodeId: node.id, result }),
      });
    } catch {
      // Silently fail - don't block learner progress
    }
  }

  // ─── Utilities ────────────────────────────────────────────────────
  function getNodeType(type) {
    // Basic type info for rendering (we don't load full nodeTypes in player)
    const types = {
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
    return types[type] || { label: type, color: '#555', icon: '?' };
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

  // ─── Public API ───────────────────────────────────────────────────
  window.LPPlayer = {
    next,
    prev,
    passGate,
    chooseBranch,
  };

})();
