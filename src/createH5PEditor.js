const path = require('path');
const h5pServer = require('@lumieducation/h5p-server');
const { H5PEditor, H5PPlayer, H5PConfig } = h5pServer;
const {
  FileContentStorage,
  FileLibraryStorage,
  DirectoryTemporaryFileStorage,
  FileContentUserDataStorage,
  InMemoryStorage,
} = h5pServer.fsImplementations;

/**
 * Creates and configures an H5PEditor instance with file-based storage.
 * @param {Function} translationCallback - i18next translation function
 * @returns {{ h5pEditor: H5PEditor, h5pPlayer: H5PPlayer }}
 */
async function createH5PEditor(translationCallback) {
  const projectDir = path.resolve(__dirname, '..');
  const h5pDir = path.join(projectDir, 'h5p');

  // Load configuration
  const config = new H5PConfig(new InMemoryStorage());
  const configJson = require(path.join(projectDir, 'config.json'));
  Object.assign(config, configJson);

  // Set up file-based storage
  const libraryStorage = new FileLibraryStorage(
    path.join(h5pDir, 'libraries')
  );
  const contentStorage = new FileContentStorage(
    path.join(h5pDir, 'content')
  );
  const temporaryStorage = new DirectoryTemporaryFileStorage(
    path.join(h5pDir, 'tmp')
  );
  const contentUserDataStorage = new FileContentUserDataStorage(
    path.join(h5pDir, 'user-data')
  );

  const h5pEditor = new H5PEditor(
    new InMemoryStorage(),   // cache
    config,
    libraryStorage,
    contentStorage,
    temporaryStorage,
    translationCallback,
    undefined,               // urlGenerator
    undefined,               // options
    contentUserDataStorage
  );

  const h5pPlayer = new H5PPlayer(
    libraryStorage,
    contentStorage,
    config,
    undefined,               // integrationObjectDefaults
    undefined,               // urlGenerator
    translationCallback,
    undefined,               // options
    contentUserDataStorage
  );

  return { h5pEditor, h5pPlayer, config };
}

module.exports = createH5PEditor;
