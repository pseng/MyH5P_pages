/**
 * Learning Path Player
 * Walks the learner through a node-based learning path,
 * sending xAPI statements to the configured LRS.
 */
(function () {
  'use strict';

  let pathData = null;
  let orderedNodes = [];  // nodes in traversal order (linear path from Start)
  let currentIndex = 0;
  let nodeStatus = {};    // nodeId -> { status: 'pending'|'in_progress'|'completed'|'passed'|'failed', score: null }

  document.addEventListener('DOMContentLoaded', () => {
    const appEl = document.getElementById('app');
    const raw = appEl.getAttribute('data-path');
    try {
      pathData = JSON.parse(raw);
    } catch {
      document.body.innerHTML = '<div style="padding:40px;color:red">Failed to load learning path data.</div>';
      return;
    }

    // Build the traversal order by following connections from Start
    buildTraversalOrder();

    // Init node statuses
    for (const node of orderedNodes) {
      nodeStatus[node.id] = { status: 'pending', score: null };
    }

    buildUI();
    navigateTo(0);
  });

  function buildTraversalOrder() {
    const nodeMap = {};
    for (const n of pathData.nodes) nodeMap[n.id] = n;

    // Build adjacency from connections
    const nextMap = {};  // fromId -> { portName: toId }
    for (const conn of pathData.connections) {
      if (!nextMap[conn.from]) nextMap[conn.from] = {};
      nextMap[conn.from][conn.fromPort] = conn.to;
    }

    // Find start node
    const start = pathData.nodes.find((n) => n.type === 'start');
    if (!start) {
      // If no start node, just use nodes in order
      orderedNodes = pathData.nodes.filter((n) => n.type !== 'start' && n.type !== 'end');
      return;
    }

    // Walk the graph following 'next' / 'pass' / 'pathA' ports (linear traversal)
    const visited = new Set();
    let current = start.id;
    while (current && !visited.has(current)) {
      visited.add(current);
      const node = nodeMap[current];
      if (node) orderedNodes.push(node);

      // Follow the first available output
      const outs = nextMap[current];
      if (!outs) break;
      current = outs.next || outs.pass || outs.pathA || Object.values(outs)[0] || null;
    }
  }

  function buildUI() {
    const app = document.getElementById('app');
    app.innerHTML = '';

    // Top bar
    const topbar = document.createElement('div');
    topbar.id = 'player-topbar';
    const hasLrs = pathData.lrsConfig && pathData.lrsConfig.endpoint;
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

  function renderSidebar() {
    const sidebar = document.getElementById('player-sidebar');
    if (!sidebar) return;
    sidebar.innerHTML = '';

    orderedNodes.forEach((node, index) => {
      if (node.type === 'start') return; // skip start node in sidebar

      const status = nodeStatus[node.id] || {};
      const nt = getNodeTypeInfo(node.type);
      const isActive = index === currentIndex;
      const isCompleted = status.status === 'completed' || status.status === 'passed';

      const item = document.createElement('div');
      item.className = 'sidebar-node' + (isActive ? ' active' : '') + (isCompleted ? ' completed' : '');
      item.onclick = () => navigateTo(index);
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

  function navigateTo(index) {
    if (index < 0 || index >= orderedNodes.length) return;

    // Mark previous node as completed if it was in_progress (simple auto-complete)
    if (currentIndex !== index && nodeStatus[orderedNodes[currentIndex]?.id]?.status === 'in_progress') {
      markNodeCompleted(orderedNodes[currentIndex].id);
    }

    currentIndex = index;
    const node = orderedNodes[currentIndex];

    // Mark as in_progress
    if (nodeStatus[node.id]?.status === 'pending') {
      nodeStatus[node.id].status = 'in_progress';
      sendXapi('launched', node);
    }

    renderContent(node);
    renderSidebar();
    updateProgress();
  }

  function renderContent(node) {
    const display = document.getElementById('content-display');
    const nav = document.getElementById('nav-buttons');
    if (!display || !nav) return;

    // End node / completion screen
    if (node.type === 'end') {
      display.innerHTML = `
        <div class="completion-screen">
          <div class="check-icon">\u2705</div>
          <h1>Learning Path Complete!</h1>
          <p>${esc(node.data?.completionMessage || 'Congratulations! You have completed this learning path.')}</p>
          <a href="/learning-paths">Back to Learning Paths</a>
        </div>
      `;
      nav.innerHTML = `<button onclick="LPPlayer.prev()" ${currentIndex === 0 ? 'disabled' : ''}>&larr; Previous</button><span></span>`;
      sendXapi('completed', node);
      // Also send completed for the overall path
      sendXapiPathCompleted();
      return;
    }

    // Start node - skip to next
    if (node.type === 'start') {
      navigateTo(currentIndex + 1);
      return;
    }

    const nt = getNodeTypeInfo(node.type);
    let bodyHtml = '';

    switch (node.type) {
      case 'theory':
      case 'wiki':
        bodyHtml = node.data?.content || '<p style="color:#888">No content provided.</p>';
        break;

      case 'guidedLab':
        bodyHtml = (node.data?.instructions || '<p style="color:#888">No instructions provided.</p>');
        if (node.data?.labUrl) {
          bodyHtml += `<div style="margin-top:16px"><a href="${escAttr(node.data.labUrl)}" target="_blank" style="display:inline-flex;align-items:center;gap:6px;padding:10px 20px;background:#FF9800;color:#fff;border-radius:6px;text-decoration:none;font-weight:500">Launch Lab Environment &rarr;</a></div>`;
        }
        break;

      case 'url':
        if (node.data?.url) {
          bodyHtml = `<div class="url-embed">
            <iframe src="${escAttr(node.data.url)}" sandbox="allow-scripts allow-same-origin allow-forms allow-popups"></iframe>
            <a class="external-link" href="${escAttr(node.data.url)}" target="_blank">Open in new tab &rarr;</a>
          </div>`;
        } else {
          bodyHtml = '<p style="color:#888">No URL configured.</p>';
        }
        break;

      case 'h5p':
        if (node.data?.h5pContentId) {
          bodyHtml = `<iframe src="/play/${escAttr(node.data.h5pContentId)}" style="min-height:600px"></iframe>`;
        } else {
          bodyHtml = '<p style="color:#888">No H5P content selected.</p>';
        }
        break;

      case 'cmi5':
      case 'scorm':
        if (node.data?.packageUrl) {
          bodyHtml = `<iframe src="${escAttr(node.data.packageUrl)}" style="min-height:600px"></iframe>
            <p style="margin-top:8px;font-size:12px;color:#888">Package type: ${esc(node.type.toUpperCase())}${node.data?.scormVersion ? ' ' + esc(node.data.scormVersion) : ''}</p>`;
        } else {
          bodyHtml = '<p style="color:#888">No package URL configured.</p>';
        }
        break;

      case 'gate':
        bodyHtml = `<div style="text-align:center;padding:40px">
          <div style="font-size:48px;margin-bottom:16px">\uD83D\uDEA7</div>
          <h2>Progress Check</h2>
          <p>Required score: ${node.data?.requiredScore || 70}%</p>
          <button onclick="LPPlayer.passGate()" style="margin-top:16px;padding:10px 28px;background:#00897b;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:14px">Continue</button>
        </div>`;
        break;

      case 'branch':
        bodyHtml = `<div style="text-align:center;padding:24px">
          <h2>${esc(node.data?.title || 'Choose your path')}</h2>
          <div class="branch-choices">
            <div class="branch-choice" onclick="LPPlayer.chooseBranch('pathA')">
              <h3>${esc(node.data?.pathALabel || 'Path A')}</h3>
            </div>
            <div class="branch-choice" onclick="LPPlayer.chooseBranch('pathB')">
              <h3>${esc(node.data?.pathBLabel || 'Path B')}</h3>
            </div>
          </div>
        </div>`;
        break;

      default:
        bodyHtml = '<p style="color:#888">Unknown node type.</p>';
    }

    display.innerHTML = `
      <h1>${esc(node.data?.title || nt.label)}</h1>
      <div class="content-description">${esc(node.data?.description || '')}</div>
      <div class="content-body">${bodyHtml}</div>
    `;

    // Nav buttons
    const isFirst = currentIndex === 0 || (currentIndex === 1 && orderedNodes[0]?.type === 'start');
    const isLast = currentIndex === orderedNodes.length - 1;
    nav.innerHTML = `
      <button onclick="LPPlayer.prev()" ${isFirst ? 'disabled' : ''}>&larr; Previous</button>
      <span class="completion-info">${currentIndex + 1} of ${orderedNodes.length}</span>
      <button class="primary" onclick="LPPlayer.markCompleteAndNext()" ${isLast ? 'disabled' : ''}>Mark Complete &amp; Next &rarr;</button>
    `;
  }

  function markCompleteAndNext() {
    const node = orderedNodes[currentIndex];
    markNodeCompleted(node.id);
    navigateTo(currentIndex + 1);
  }

  function prev() {
    navigateTo(currentIndex - 1);
  }

  function markNodeCompleted(nodeId) {
    const status = nodeStatus[nodeId];
    if (!status) return;
    status.status = 'completed';
    const node = orderedNodes.find((n) => n.id === nodeId);
    if (node) {
      sendXapi('completed', node);
    }
  }

  function passGate() {
    markCompleteAndNext();
  }

  function chooseBranch(_branch) {
    // For now, just continue to next; full branch traversal would need the graph walker
    markCompleteAndNext();
  }

  function updateProgress() {
    const total = orderedNodes.filter((n) => n.type !== 'start').length;
    const completed = Object.values(nodeStatus).filter(
      (s) => s.status === 'completed' || s.status === 'passed'
    ).length;
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
    const bar = document.getElementById('progress-bar');
    if (bar) bar.style.width = pct + '%';
  }

  // ─── xAPI ────────────────────────────────────────────────────────
  async function sendXapi(verb, node) {
    if (!pathData.lrsConfig || !pathData.lrsConfig.endpoint) return;
    try {
      await fetch(`/learning-paths/api/paths/${pathData.id}/xapi`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verb, nodeId: node.id }),
      });
    } catch {
      // silently fail for xAPI - don't block the learner
    }
  }

  async function sendXapiPathCompleted() {
    if (!pathData.lrsConfig || !pathData.lrsConfig.endpoint) return;
    // Send a completion for the overall path using the end node
    const endNode = orderedNodes.find((n) => n.type === 'end');
    if (endNode) {
      sendXapi('completed', endNode);
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────
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

  // ─── Public API ───────────────────────────────────────────────────
  window.LPPlayer = {
    prev,
    markCompleteAndNext,
    passGate,
    chooseBranch,
  };

})();
