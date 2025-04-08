# Assistant

A lightweight LLM chat frontend that connects to OpenRouter. Currently in early development (nightly builds).

## Features
- Streaming with via WebSockets with smart compression
- More lightweight than SillyTavern
- Looks nice I think (๑˃ᴗ˂)ﻭ

## Requirements
- [Bun](https://bun.sh/) runtime

## Installation & Building

Clone the repository and build the project:

```bash
# Build the solid-select dependency
cd ./deps/solid-select
bun i
bun run build

# Build the main project
cd ../../
bun i
bun run build
```

## Running the Server

```bash
cd ./server
OPENROUTER_TOKEN=<your_token> bun run --port <your_port> --host <your_ip> --expose-dist
# .env is also supported
```

Default host is 127.0.0.1:3000

## Development

For development:

```bash
# Terminal 1: Start the frontend dev server
bun start  # Runs Vite on port 5173

# Terminal 2: Start the backend in watch mode
cd ./server
bun watch  # Runs server on port 3000 with auto-restart
```

Ports and hosts are hardcoded.

## Configuration
- Get your OpenRouter API key from [https://openrouter.ai/keys](https://openrouter.ai/keys)

## License
GNU Affero General Public License v3.0