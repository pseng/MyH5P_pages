# MyH5P Player

An H5P content player and editor built with [H5P-Nodejs-library](https://github.com/Lumieducation/H5P-Nodejs-library) by Lumi Education.

## Features

- **Play** H5P interactive content in the browser
- **Create** new H5P content using the built-in editor
- **Edit** existing H5P content
- **Delete** content you no longer need
- **Content Hub** integration for discovering H5P content types

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
│   └── User.js              # User model
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

| Route | Description |
|-------|-------------|
| `GET /` | List all H5P content |
| `GET /new` | Create new H5P content |
| `GET /play/:id` | Play H5P content |
| `GET /edit/:id` | Edit H5P content |
| `POST /delete/:id` | Delete H5P content |

## License

CC0-1.0 (Public Domain)
