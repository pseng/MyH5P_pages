# MyH5P Player

An H5P content player and editor built with [H5P-Nodejs-library](https://github.com/Lumieducation/H5P-Nodejs-library) by Lumi Education.

## Features

- **Play** H5P interactive content in the browser
- **Create** new H5P content using the built-in editor
- **Edit** existing H5P content
- **Delete** content you no longer need
- **Upload** .h5p files directly from your machine
- **Content Hub** integration for discovering H5P content types
- **Learning Path Creator** — visual node-based editor for building learning paths
  - Drag-and-drop flow control nodes (Start, End, Gate, Branch) and content nodes (Theory, Lab, Wiki, URL, H5P, cmi5, SCORM)
  - Connect nodes via ports to define flow (pass/fail gates, A/B branches)
  - Upload .h5p files directly into learning paths
  - Graph-based player that follows node connections
  - xAPI/LRS integration for tracking learner progress

## Quick Start

### Prerequisites

- Node.js >= 16
- npm
- `curl` and `unzip` (for downloading H5P core files)

### Installation

```bash
# Install dependencies (also downloads H5P core/editor files automatically)
npm install

# If you need to re-download H5P core files manually:
npm run download:h5p
```

### Running

```bash
# Start the server
npm start

# Or with auto-reload during development
npm run dev
```

The server starts at **http://localhost:8080** by default.

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8080` | Server port |
| `H5P_LANGUAGE` | `auto` | Language for UI (`auto` = detect from browser, or set e.g. `en`, `de`) |

## Project Structure

```
├── config.json              # H5P configuration
├── package.json
├── scripts/
│   └── download-h5p.sh     # Downloads H5P core and editor files
├── src/
│   ├── index.js             # Express server entry point
│   ├── createH5PEditor.js   # H5P editor/player factory
│   ├── routes.js            # Content management routes
│   ├── User.js              # User model
│   └── learningPath/        # Learning path creator
│       ├── routes.js        # Learning path API + HTML pages
│       ├── nodeTypes.js     # Node type definitions + validation
│       ├── storage.js       # File-based learning path storage
│       ├── xapi.js          # xAPI/LRS statement builder
│       └── static/          # Frontend assets
│           ├── editor.js    # SVG node editor
│           ├── editor.css   # Editor styles
│           ├── player.js    # Learning path player
│           └── player.css   # Player styles
└── h5p/                     # H5P runtime data (gitignored)
    ├── core/                # H5P core player files
    ├── editor/              # H5P editor files
    ├── libraries/           # Installed H5P libraries
    ├── content/             # Saved H5P content
    ├── user-data/           # User progress data
    └── tmp/                 # Temporary uploads
```

## How It Works

The app uses these packages from the [Lumieducation H5P-Nodejs-library](https://github.com/Lumieducation/H5P-Nodejs-library):

- **@lumieducation/h5p-server** — Core H5P engine (content storage, library management, player/editor rendering)
- **@lumieducation/h5p-express** — Express middleware for H5P AJAX endpoints, serving core files, and library administration

All content is stored on the local filesystem under `h5p/`.

## Routes

### H5P Content

| Route | Description |
|-------|-------------|
| `GET /` | List all H5P content |
| `GET /new` | Create new H5P content |
| `GET /play/:id` | Play H5P content |
| `GET /edit/:id` | Edit H5P content |
| `POST /delete/:id` | Delete H5P content |
| `POST /upload-h5p` | Upload .h5p file from machine |

### Learning Paths

| Route | Description |
|-------|-------------|
| `GET /learning-paths` | List all learning paths |
| `GET /learning-paths/editor` | Create new learning path |
| `GET /learning-paths/editor/:id` | Edit existing learning path |
| `GET /learning-paths/play/:id` | Play a learning path |
| `POST /learning-paths/api/h5p-upload` | Upload .h5p into a learning path |

## Updating

To update an existing installation:

```bash
# Pull the latest changes
git pull origin main

# Install any new or updated dependencies
npm install

# Re-download H5P core files (if needed)
npm run download:h5p

# Restart the server
npm start
```

If you have local changes that conflict during pull:

```bash
# Option 1: Stash your changes, pull, then restore
git stash
git pull origin main
git stash pop

# Option 2: Discard local changes to a specific file
git checkout -- package-lock.json
git pull origin main
```

Your H5P content and learning paths are stored in `h5p/content/` and `h5p/learning-paths/` respectively and will not be affected by updates.

## License

CC0-1.0 (Public Domain)
