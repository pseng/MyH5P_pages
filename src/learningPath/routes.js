const express = require('express');
const storage = require('./storage');
const { NODE_TYPES, validatePath } = require('./nodeTypes');
const xapi = require('./xapi');

/**
 * Creates Express routes for the learning path creator.
 * @param {import('@lumieducation/h5p-server').H5PEditor} h5pEditor
 * @returns {express.Router}
 */
function createLearningPathRoutes(h5pEditor) {
  const router = express.Router();

  // --- API: Get all node type definitions (for the editor UI) ---
  router.get('/api/node-types', (_req, res) => {
    res.json(NODE_TYPES);
  });

  // --- API: List available H5P content (for H5P picker in nodes) ---
  router.get('/api/h5p-content', async (req, res) => {
    try {
      const contentIds = await h5pEditor.contentManager.listContent(req.user);
      const items = [];
      for (const id of contentIds) {
        try {
          const meta = await h5pEditor.contentManager.getContentMetadata(id, req.user);
          items.push({ id, title: meta.title || `Content ${id}` });
        } catch {
          items.push({ id, title: `Content ${id}` });
        }
      }
      res.json(items);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- API: CRUD for learning paths ---
  router.get('/api/paths', async (_req, res) => {
    try {
      const paths = await storage.list();
      res.json(paths);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/api/paths/:id', async (req, res) => {
    try {
      const data = await storage.get(req.params.id);
      res.json(data);
    } catch (err) {
      if (err.code === 'ENOENT') return res.status(404).json({ error: 'Not found' });
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/api/paths', async (req, res) => {
    try {
      const data = await storage.create(req.body);
      res.status(201).json(data);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.put('/api/paths/:id', async (req, res) => {
    try {
      const data = await storage.update(req.params.id, req.body);
      res.json(data);
    } catch (err) {
      if (err.code === 'ENOENT') return res.status(404).json({ error: 'Not found' });
      res.status(500).json({ error: err.message });
    }
  });

  router.delete('/api/paths/:id', async (req, res) => {
    try {
      await storage.delete(req.params.id);
      res.json({ success: true });
    } catch (err) {
      if (err.code === 'ENOENT') return res.status(404).json({ error: 'Not found' });
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/api/paths/:id/duplicate', async (req, res) => {
    try {
      const data = await storage.duplicate(req.params.id);
      res.status(201).json(data);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/api/paths/:id/validate', async (req, res) => {
    try {
      const data = await storage.get(req.params.id);
      const result = validatePath(data);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- API: xAPI statement proxy ---
  router.post('/api/paths/:id/xapi', async (req, res) => {
    try {
      const pathData = await storage.get(req.params.id);
      if (!pathData.lrsConfig || !pathData.lrsConfig.endpoint) {
        return res.status(400).json({ error: 'No LRS configured for this learning path' });
      }

      const { verb, nodeId, result: xapiResult, extensions } = req.body;
      const node = (pathData.nodes || []).find((n) => n.id === nodeId);
      if (!node) {
        return res.status(404).json({ error: 'Node not found in learning path' });
      }

      const baseUrl = `${req.protocol}://${req.get('host')}/learning-paths`;
      const statement = xapi.buildStatement({
        user: { name: req.user?.name, email: req.user?.email },
        verb,
        pathId: pathData.id,
        pathTitle: pathData.title,
        node,
        baseUrl,
        result: xapiResult,
        extensions,
      });

      const lrsResult = await xapi.sendStatement(pathData.lrsConfig, statement);
      res.json({ statement, lrsResult });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- HTML Pages ---

  // Learning paths list page
  router.get('/', async (_req, res) => {
    try {
      const paths = await storage.list();
      res.send(renderPathsListPage(paths));
    } catch (err) {
      res.status(500).send(renderErrorPage('Error loading learning paths', err.message));
    }
  });

  // Node editor page
  router.get('/editor', (_req, res) => {
    // New learning path editor
    res.send(renderEditorPage(null));
  });

  router.get('/editor/:id', async (req, res) => {
    try {
      const data = await storage.get(req.params.id);
      res.send(renderEditorPage(data));
    } catch (err) {
      if (err.code === 'ENOENT') return res.status(404).send(renderErrorPage('Not Found', 'Learning path not found'));
      res.status(500).send(renderErrorPage('Error', err.message));
    }
  });

  // Learning path player
  router.get('/play/:id', async (req, res) => {
    try {
      const data = await storage.get(req.params.id);
      res.send(renderPlayerPage(data));
    } catch (err) {
      if (err.code === 'ENOENT') return res.status(404).send(renderErrorPage('Not Found', 'Learning path not found'));
      res.status(500).send(renderErrorPage('Error', err.message));
    }
  });

  return router;
}

// --- HTML Rendering ---

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const NAV = `
  <nav class="navbar navbar-dark bg-dark mb-4">
    <div class="container-fluid">
      <a class="navbar-brand" href="/">MyH5P Player</a>
      <div class="d-flex gap-2">
        <a href="/" class="btn btn-outline-light btn-sm">H5P Content</a>
        <a href="/learning-paths" class="btn btn-outline-info btn-sm">Learning Paths</a>
      </div>
    </div>
  </nav>`;

function renderErrorPage(title, message) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
</head>
<body>
  ${NAV}
  <div class="container">
    <div class="alert alert-danger">
      <h4>${escapeHtml(title)}</h4>
      <pre>${escapeHtml(message)}</pre>
    </div>
    <a href="/learning-paths" class="btn btn-outline-secondary">&larr; Back to learning paths</a>
  </div>
</body>
</html>`;
}

function renderPathsListPage(paths) {
  const rows = paths.length > 0
    ? paths.map((p) => `
        <tr>
          <td><strong>${escapeHtml(p.title)}</strong></td>
          <td><span class="badge bg-${p.status === 'published' ? 'success' : 'secondary'}">${escapeHtml(p.status)}</span></td>
          <td>${p.nodeCount} nodes</td>
          <td>${p.updatedAt ? new Date(p.updatedAt).toLocaleDateString() : ''}</td>
          <td class="text-end">
            <a href="/learning-paths/editor/${p.id}" class="btn btn-secondary btn-sm">Edit</a>
            <a href="/learning-paths/play/${p.id}" class="btn btn-primary btn-sm">Play</a>
            <button class="btn btn-outline-secondary btn-sm" onclick="duplicatePath('${p.id}')">Duplicate</button>
            <button class="btn btn-danger btn-sm" onclick="deletePath('${p.id}')">Delete</button>
          </td>
        </tr>`).join('\n')
    : '<tr><td colspan="5" class="text-center text-muted">No learning paths yet. Click "+ New Learning Path" to create one!</td></tr>';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Learning Paths - MyH5P Player</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
</head>
<body>
  ${NAV}
  <div class="container">
    <div class="d-flex justify-content-between align-items-center mb-3">
      <h1>Learning Paths</h1>
      <a href="/learning-paths/editor" class="btn btn-success">+ New Learning Path</a>
    </div>
    <table class="table table-striped">
      <thead>
        <tr>
          <th>Title</th>
          <th>Status</th>
          <th>Nodes</th>
          <th>Updated</th>
          <th class="text-end">Actions</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
  <script>
    async function deletePath(id) {
      if (!confirm('Delete this learning path?')) return;
      await fetch('/learning-paths/api/paths/' + id, { method: 'DELETE' });
      location.reload();
    }
    async function duplicatePath(id) {
      await fetch('/learning-paths/api/paths/' + id + '/duplicate', { method: 'POST' });
      location.reload();
    }
  </script>
</body>
</html>`;
}

function renderEditorPage(pathData) {
  const dataAttr = pathData ? escapeHtml(JSON.stringify(pathData)) : '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${pathData ? 'Edit' : 'New'} Learning Path - MyH5P Player</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
  <link href="/learning-paths/static/editor.css" rel="stylesheet">
</head>
<body>
  <div id="app" data-path="${dataAttr}"></div>
  <script src="/learning-paths/static/editor.js"></script>
</body>
</html>`;
}

function renderPlayerPage(pathData) {
  const dataAttr = escapeHtml(JSON.stringify(pathData));
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(pathData.title)} - Learning Path Player</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
  <link href="/learning-paths/static/player.css" rel="stylesheet">
</head>
<body>
  <div id="app" data-path="${dataAttr}"></div>
  <script src="/learning-paths/static/player.js"></script>
</body>
</html>`;
}

module.exports = createLearningPathRoutes;
