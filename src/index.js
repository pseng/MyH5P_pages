const path = require('path');
const express = require('express');
const fileUpload = require('express-fileupload');
const i18next = require('i18next');
const i18nextFsBackend = require('i18next-fs-backend');
const i18nextHttpMiddleware = require('i18next-http-middleware');

const {
  h5pAjaxExpressRouter,
  libraryAdministrationExpressRouter,
  contentTypeCacheExpressRouter,
} = require('@lumieducation/h5p-express');

const createH5PEditor = require('./createH5PEditor');
const createRoutes = require('./routes');
const createLearningPathRoutes = require('./learningPath/routes');
const User = require('./User');

const PORT = process.env.PORT || 8080;
const LANGUAGE = process.env.H5P_LANGUAGE || 'auto';

async function start() {
  // Initialize i18next for translations
  await i18next.use(i18nextFsBackend).use(i18nextHttpMiddleware.LanguageDetector).init({
    backend: {
      loadPath: path.join(
        path.dirname(require.resolve('@lumieducation/h5p-server')),
        'assets/translations/{{ns}}/{{lng}}.json'
      ),
    },
    defaultNS: 'server',
    fallbackLng: 'en',
    ns: [
      'client',
      'copyright-semantics',
      'hub',
      'library-metadata',
      'metadata-semantics',
      'mongo-s3-content-storage',
      's3-temporary-storage',
      'server',
      'storage-file-implementations',
    ],
    preload: ['en'],
  });

  // Create H5P editor and player
  const { h5pEditor, h5pPlayer, config } = await createH5PEditor(
    i18next.getFixedT(null, 'server')
  );

  // Set up custom renderers that redirect to our routes after saving
  h5pEditor.setRenderer((model) => {
    // Default renderer includes the full editor HTML with AJAX save behavior.
    // We customize the play URL so after saving, the user is redirected properly.
    return defaultEditorRenderer(model);
  });

  h5pPlayer.setRenderer((model) => {
    return defaultPlayerRenderer(model);
  });

  // Create Express app
  const app = express();

  // Body parsing
  app.use(express.json({ limit: '500mb' }));
  app.use(express.urlencoded({ extended: true, limit: '500mb' }));

  // File upload support
  app.use(
    fileUpload({
      limits: { fileSize: config.maxFileSize },
      useTempFiles: true,
      tempFileDir: path.join(__dirname, '..', 'h5p', 'tmp'),
    })
  );

  // i18next middleware for language detection
  app.use(i18nextHttpMiddleware.handle(i18next));

  // Inject user into every request
  app.use((req, _res, next) => {
    req.user = new User();
    next();
  });

  // Inject translation function into every request
  app.use((req, _res, next) => {
    req.t = i18next.getFixedT(req.language || 'en', 'server');
    next();
  });

  // H5P AJAX routes (serves core JS/CSS, library files, content files, AJAX API)
  const h5pCorePath = path.resolve(__dirname, '..', 'h5p', 'core');
  const h5pEditorPath = path.resolve(__dirname, '..', 'h5p', 'editor');

  app.use(
    config.baseUrl || '/',
    h5pAjaxExpressRouter(h5pEditor, h5pCorePath, h5pEditorPath, undefined, LANGUAGE)
  );

  // Library administration routes
  app.use(
    '/libraries',
    libraryAdministrationExpressRouter(h5pEditor, undefined, LANGUAGE)
  );

  // Content type cache routes
  app.use(
    '/content-type-cache',
    contentTypeCacheExpressRouter(h5pEditor.contentTypeCache, undefined, LANGUAGE)
  );

  // Learning Path routes (node editor, player, API)
  const learningPathRouter = createLearningPathRoutes(h5pEditor);
  app.use('/learning-paths/static', express.static(
    path.join(__dirname, 'learningPath', 'static'),
    { maxAge: '1d' }
  ));
  app.use('/learning-paths', learningPathRouter);

  // Our custom content management routes (list, play, edit, new, delete)
  app.use('/', createRoutes(h5pEditor, h5pPlayer, LANGUAGE));

  // Start server
  app.listen(PORT, () => {
    console.log(`MyH5P Player is running at http://localhost:${PORT}`);
    console.log('');
    console.log('Features:');
    console.log('  - Browse content:    http://localhost:' + PORT + '/');
    console.log('  - Create content:    http://localhost:' + PORT + '/new');
    console.log('  - Play content:      http://localhost:' + PORT + '/play/:id');
    console.log('  - Edit content:      http://localhost:' + PORT + '/edit/:id');
    console.log('');
    console.log('Learning Paths:');
    console.log('  - Browse paths:      http://localhost:' + PORT + '/learning-paths');
    console.log('  - Path editor:       http://localhost:' + PORT + '/learning-paths/editor');
    console.log('  - Play path:         http://localhost:' + PORT + '/learning-paths/play/:id');
  });
}

/**
 * Custom player renderer - returns a full HTML page for iframe embedding.
 */
function defaultPlayerRenderer(model) {
  return `<!doctype html>
<html class="h5p-iframe">
<head>
    <meta charset="utf-8">
    ${model.styles.map((s) => `<link rel="stylesheet" href="${s}"/>`).join('\n    ')}
    ${model.scripts.map((s) => `<script src="${s}"></script>`).join('\n    ')}
    <script>
        window.H5PIntegration = ${JSON.stringify(model.integration, null, 2)};
    </script>
</head>
<body>
    <div class="h5p-content" data-content-id="${model.contentId}"></div>
</body>
</html>`;
}

/**
 * Custom editor renderer - returns a full HTML page.
 * The editor JS handles saving via AJAX POST.
 */
function defaultEditorRenderer(model) {
  return `<html>
<head>
<meta charset="UTF-8">
<script> window.H5PIntegration = parent.H5PIntegration || ${JSON.stringify(model.integration, null, 2)}</script>
${model.styles.map((s) => `<link rel="stylesheet" href="${s}">`).join('\n    ')}
${model.scripts.map((s) => `<script src="${s}"></script>`).join('\n    ')}
</head>
<body>
<form method="post" enctype="multipart/form-data" id="h5p-content-form">
    <div id="post-body-content">
        <div class="h5p-create">
            <div class="h5p-editor"></div>
        </div>
    </div>
    <input id="save-h5p" type="submit" name="submit" value="Save" class="button button-primary button-large" style="margin-top:1rem; padding:0.5rem 2rem; font-size:1rem; cursor:pointer;">
</form>
<script>
var ns = H5PEditor;

(function($) {
    H5PEditor.init = function() {
        H5PEditor.$ = H5P.jQuery;
        H5PEditor.basePath = H5PIntegration.editor.libraryUrl;
        H5PEditor.fileIcon = H5PIntegration.editor.fileIcon;
        H5PEditor.ajaxPath = H5PIntegration.editor.ajaxPath;
        H5PEditor.filesPath = H5PIntegration.editor.filesPath;
        H5PEditor.apiVersion = H5PIntegration.editor.apiVersion;
        H5PEditor.contentLanguage = H5PIntegration.editor.language;
        H5PEditor.copyrightSemantics = H5PIntegration.editor.copyrightSemantics;
        H5PEditor.metadataSemantics = H5PIntegration.editor.metadataSemantics;
        H5PEditor.assets = H5PIntegration.editor.assets;
        H5PEditor.baseUrl = '';

        if (H5PIntegration.editor.nodeVersionId !== undefined) {
            H5PEditor.contentId = H5PIntegration.editor.nodeVersionId;
        }

        var h5peditor;
        var $upload = $('.h5p-upload');
        var $create = $('.h5p-create').hide();
        var $editor = $('.h5p-editor');

        $upload.hide();
        if (h5peditor === undefined) {
            if (H5PEditor.contentId) {
                $.ajax({
                    error: function() {
                        h5peditor = new ns.Editor(undefined, undefined, $editor[0]);
                        $create.show();
                    },
                    success: function(res) {
                        h5peditor = new ns.Editor(
                            res.library,
                            JSON.stringify(res.params),
                            $editor[0]
                        );
                        $create.show();
                    },
                    type: 'GET',
                    url: '${model.urlGenerator.parameters()}/' + H5PEditor.contentId + window.location.search
                });
            } else {
                h5peditor = new ns.Editor(undefined, undefined, $editor[0]);
                $create.show();
            }
        }

        var formIsSubmitting = false;
        $('#h5p-content-form').submit(function(event) {
            if (h5peditor !== undefined && !formIsSubmitting) {
                var params = h5peditor.getParams();
                if (params.params !== undefined) {
                    h5peditor.getContent(function(content) {
                        formIsSubmitting = true;
                        $.ajax({
                            data: JSON.stringify({
                                library: content.library,
                                params: JSON.parse(content.params)
                            }),
                            headers: { 'Content-Type': 'application/json' },
                            type: 'POST'
                        }).then(function(result) {
                            var parsed = typeof result === 'string' ? JSON.parse(result) : result;
                            if (parsed.contentId) {
                                window.top.location.href = '/play/' + parsed.contentId;
                            }
                        }).catch(function(err) {
                            formIsSubmitting = false;
                            alert('Error saving content: ' + (err.responseText || err.message));
                        });
                    });
                    return event.preventDefault();
                }
            }
        });
    };

    H5PEditor.getAjaxUrl = function(action, parameters) {
        var url = H5PIntegration.editor.ajaxPath + action;
        if (parameters !== undefined) {
            for (var property in parameters) {
                if (parameters.hasOwnProperty(property)) {
                    url += '&' + property + '=' + parameters[property];
                }
            }
        }
        url += window.location.search.replace(/\\?/g, '&');
        return url;
    };

    H5PEditor.enableContentHub = H5PIntegration.editor.enableContentHub || false;

    $(document).ready(H5PEditor.init);
})(H5P.jQuery);
</script>
</body>
</html>`;
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
