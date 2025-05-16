# Assistant

A lightweight LLM chat frontend that connects to OpenRouter. Currently in early development (nightly builds).

## Features
- Streaming with via WebSockets with smart compression
- More lightweight than SillyTavern
- More ergonomic
- Looks nice I think (๑˃ᴗ˂)ﻭ

## Screenshots
<img alt="Screenshot of UI" src="https://github.com/user-attachments/assets/c19aa1f2-fb29-4e92-9fb7-fe6a7f4f9f12" width="600">
<br>
<img alt="Screenshot of UI" src="https://github.com/user-attachments/assets/06aa6cb1-f426-46b8-9fd1-78baea33134e" width="400">

## Requirements
- [Bun](https://bun.sh/) runtime (Any other runtime works as well but you'd have to polyfill/replace Bun.file, Bun.write, Bun.gzipSync, and Bun.gunzipSync)

## Installation & Building

Clone the repository and build the project:

```bash
# Build the solid-select dependency
cd ./deps/solid-select
bun i
bun run build

# Build the frontend
cd ../../
bun i
bun run build

# Prepare the backend
cd ./server
bun i
```

## Running the Server

```bash
cd ./server
OPENROUTER_TOKEN=<your_token> AKASH_TOKEN=<your_token> bun run --port <your_port> --host <your_ip> --expose-dist
# .env is also supported (must be in cwd)
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

## Note
I can't be arsed to add a `.prettierrc` and such right now. Cheers. (￣ω￣)
