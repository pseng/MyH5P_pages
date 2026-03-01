const express = require('express');

/**
 * Creates Express routes for H5P content management (list, play, edit, new, delete).
 * @param {import('@lumieducation/h5p-server').H5PEditor} h5pEditor
 * @param {import('@lumieducation/h5p-server').H5PPlayer} h5pPlayer
 * @param {string} languageOverride
 * @returns {express.Router}
 */
function createRoutes(h5pEditor, h5pPlayer, languageOverride) {
  const router = express.Router();

  function getLang(req) {
    return languageOverride === 'auto' ? (req.language || 'en') : languageOverride;
  }

  // --- Homepage: list all content ---
  router.get('/', async (req, res) => {
    try {
      const contentIds = await h5pEditor.contentManager.listContent(req.user);
      const contentList = [];
      for (const id of contentIds) {
        try {
          const metadata = await h5pEditor.contentManager.getContentMetadata(id, req.user);
          contentList.push({ id, title: metadata.title || `Content ${id}` });
        } catch {
          contentList.push({ id, title: `Content ${id}` });
        }
      }
      res.send(renderListPage(contentList));
    } catch (err) {
      res.status(500).send(renderErrorPage('Error', err.message));
    }
  });

  // --- Play content ---
  router.get('/play/:contentId', async (req, res) => {
    try {
      const { contentId } = req.params;
      const playerModel = await h5pPlayer.render(
        contentId,
        req.user,
        getLang(req),
        {
          showCopyButton: false,
          showDownloadButton: true,
          showFrame: true,
          showH5PIcon: false,
          showLicenseButton: true,
        }
      );
      res.send(renderPlayerPage(playerModel));
    } catch (err) {
      res.status(500).send(renderErrorPage('Error playing content', err.message));
    }
  });

  // --- New content form ---
  router.get('/new', async (req, res) => {
    try {
      const editorModel = await h5pEditor.render(undefined, getLang(req), req.user);
      res.send(renderEditorPage(editorModel, 'Create New Content'));
    } catch (err) {
      res.status(500).send(renderErrorPage('Error loading editor', err.message));
    }
  });

  // --- Save new content (AJAX JSON POST from the default renderer) ---
  router.post('/new', async (req, res) => {
    try {
      const { library, params } = req.body;
      if (!library || !params) {
        return res.status(400).json({ error: 'Missing library or params' });
      }
      const content = await h5pEditor.saveOrUpdateContentReturnMetaData(
        undefined,
        params.params,
        params.metadata,
        library,
        req.user
      );
      res.json({ contentId: content.id });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- Edit existing content ---
  router.get('/edit/:contentId', async (req, res) => {
    try {
      const { contentId } = req.params;
      const editorModel = await h5pEditor.render(contentId, getLang(req), req.user);
      res.send(renderEditorPage(editorModel, 'Edit Content'));
    } catch (err) {
      res.status(500).send(renderErrorPage('Error loading editor', err.message));
    }
  });

  // --- Save edited content (AJAX JSON POST from the default renderer) ---
  router.post('/edit/:contentId', async (req, res) => {
    try {
      const { contentId } = req.params;
      const { library, params } = req.body;
      if (!library || !params) {
        return res.status(400).json({ error: 'Missing library or params' });
      }
      await h5pEditor.saveOrUpdateContentReturnMetaData(
        contentId,
        params.params,
        params.metadata,
        library,
        req.user
      );
      res.json({ contentId });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- Delete content ---
  router.post('/delete/:contentId', async (req, res) => {
    try {
      const { contentId } = req.params;
      await h5pEditor.deleteContent(contentId, req.user);
      res.redirect('/');
    } catch (err) {
      res.status(500).send(renderErrorPage('Error deleting content', err.message));
    }
  });

  return router;
}

// --- HTML Rendering Helpers ---

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
    <a href="/" class="btn btn-outline-secondary">&larr; Back to list</a>
  </div>
</body>
</html>`;
}

function renderListPage(contentList) {
  const items = contentList.length > 0
    ? contentList
        .map(
          (c) =>
            `<tr>
              <td>${escapeHtml(c.title)}</td>
              <td class="text-end">
                <a href="/play/${c.id}" class="btn btn-primary btn-sm">Play</a>
                <a href="/edit/${c.id}" class="btn btn-secondary btn-sm">Edit</a>
                <form method="post" action="/delete/${c.id}" class="d-inline" onsubmit="return confirm('Delete this content?')">
                  <button type="submit" class="btn btn-danger btn-sm">Delete</button>
                </form>
              </td>
            </tr>`
        )
        .join('\n')
    : '<tr><td colspan="2" class="text-center text-muted">No content yet. Click "+ New Content" to create some!</td></tr>';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MyH5P Player</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
</head>
<body>
  ${NAV}
  <div class="container">
    <div class="d-flex justify-content-between align-items-center mb-3">
      <h1>H5P Content</h1>
      <a href="/new" class="btn btn-success">+ New Content</a>
    </div>
    <table class="table table-striped">
      <thead>
        <tr><th>Title</th><th class="text-end">Actions</th></tr>
      </thead>
      <tbody>
        ${items}
      </tbody>
    </table>
  </div>
</body>
</html>`;
}

function renderPlayerPage(playerHtml) {
  // The default player renderer returns a full HTML page.
  // We wrap it in an iframe approach for proper isolation.
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Play - MyH5P Player</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
  <style>
    .h5p-player-wrapper {
      border: 1px solid #dee2e6;
      border-radius: 0.375rem;
      overflow: hidden;
      min-height: 400px;
    }
    .h5p-player-wrapper iframe {
      width: 100%;
      min-height: 600px;
      border: none;
    }
  </style>
</head>
<body>
  ${NAV}
  <div class="container">
    <div class="mb-3">
      <a href="/" class="btn btn-outline-secondary">&larr; Back to list</a>
    </div>
    <div class="h5p-player-wrapper">
      <iframe id="h5p-iframe" srcdoc="${escapeHtml(playerHtml)}" allowfullscreen="allowfullscreen"></iframe>
    </div>
  </div>
  <script>
    // Auto-resize iframe to fit content
    const iframe = document.getElementById('h5p-iframe');
    iframe.addEventListener('load', function() {
      try {
        const body = iframe.contentDocument.body;
        const observer = new ResizeObserver(() => {
          iframe.style.height = Math.max(body.scrollHeight + 50, 400) + 'px';
        });
        observer.observe(body);
        iframe.style.height = Math.max(body.scrollHeight + 50, 400) + 'px';
      } catch(e) {}
    });
  </script>
</body>
</html>`;
}

function renderEditorPage(editorHtml, title) {
  // The default editor renderer returns a full HTML page with its own form handling.
  // The editor's built-in JS handles save via AJAX POST back to the current URL.
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} - MyH5P Player</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
  <style>
    .h5p-editor-wrapper {
      border: 1px solid #dee2e6;
      border-radius: 0.375rem;
      overflow: hidden;
      min-height: 500px;
    }
    .h5p-editor-wrapper iframe {
      width: 100%;
      min-height: 700px;
      border: none;
    }
  </style>
</head>
<body>
  ${NAV}
  <div class="container">
    <div class="mb-3">
      <a href="/" class="btn btn-outline-secondary">&larr; Back to list</a>
    </div>
    <h2 class="mb-3">${escapeHtml(title)}</h2>
    <div class="h5p-editor-wrapper">
      <iframe id="h5p-editor-iframe" srcdoc="${escapeHtml(editorHtml)}" allowfullscreen="allowfullscreen"></iframe>
    </div>
  </div>
  <script>
    const iframe = document.getElementById('h5p-editor-iframe');
    iframe.addEventListener('load', function() {
      try {
        const body = iframe.contentDocument.body;
        const observer = new ResizeObserver(() => {
          iframe.style.height = Math.max(body.scrollHeight + 50, 500) + 'px';
        });
        observer.observe(body);
        iframe.style.height = Math.max(body.scrollHeight + 50, 500) + 'px';
      } catch(e) {}
    });
  </script>
</body>
</html>`;
}

module.exports = createRoutes;
