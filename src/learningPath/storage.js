const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

const PATHS_DIR = path.resolve(__dirname, '..', '..', 'data', 'learning-paths');

/**
 * File-based storage for learning paths.
 * Each learning path is stored as a JSON file in data/learning-paths/.
 */
class LearningPathStorage {
  constructor() {
    this._initialized = false;
  }

  async _ensureDir() {
    if (!this._initialized) {
      await fs.mkdir(PATHS_DIR, { recursive: true });
      this._initialized = true;
    }
  }

  _filePath(id) {
    // Sanitize id to prevent path traversal
    const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '');
    return path.join(PATHS_DIR, `${safeId}.json`);
  }

  async list() {
    await this._ensureDir();
    const files = await fs.readdir(PATHS_DIR);
    const paths = [];
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      try {
        const raw = await fs.readFile(path.join(PATHS_DIR, file), 'utf8');
        const data = JSON.parse(raw);
        paths.push({
          id: data.id,
          title: data.title,
          description: data.description || '',
          status: data.status || 'draft',
          nodeCount: (data.nodes || []).length,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
        });
      } catch {
        // skip corrupt files
      }
    }
    return paths.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  }

  async get(id) {
    await this._ensureDir();
    const filePath = this._filePath(id);
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  }

  async create(data) {
    await this._ensureDir();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const pathData = {
      id,
      title: data.title || 'Untitled Learning Path',
      description: data.description || '',
      status: 'draft',
      nodes: data.nodes || [],
      connections: data.connections || [],
      lrsConfig: data.lrsConfig || null,
      createdAt: now,
      updatedAt: now,
    };
    await fs.writeFile(this._filePath(id), JSON.stringify(pathData, null, 2), 'utf8');
    return pathData;
  }

  async update(id, data) {
    await this._ensureDir();
    const existing = await this.get(id);
    const updated = {
      ...existing,
      title: data.title !== undefined ? data.title : existing.title,
      description: data.description !== undefined ? data.description : existing.description,
      status: data.status !== undefined ? data.status : existing.status,
      nodes: data.nodes !== undefined ? data.nodes : existing.nodes,
      connections: data.connections !== undefined ? data.connections : existing.connections,
      lrsConfig: data.lrsConfig !== undefined ? data.lrsConfig : existing.lrsConfig,
      updatedAt: new Date().toISOString(),
    };
    await fs.writeFile(this._filePath(id), JSON.stringify(updated, null, 2), 'utf8');
    return updated;
  }

  async delete(id) {
    await this._ensureDir();
    await fs.unlink(this._filePath(id));
  }

  async duplicate(id) {
    const original = await this.get(id);
    return this.create({
      ...original,
      title: `${original.title} (Copy)`,
    });
  }
}

module.exports = new LearningPathStorage();
