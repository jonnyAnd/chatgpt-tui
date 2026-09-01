# ChatGPT TUI

Terminal interface for OpenAI coding conversations.

## Requirements

- Node.js 22 or later
- An OpenAI API key

## Build and run

```bash
npm ci
export OPENAI_API_KEY="your_api_key"
npm run dev
```

To build the Node.js CLI:

```bash
npm run build
npm run shebang
node dist/index.js
```

## Single-file Linux executable

Build a `linux-x64` executable for Debian-based systems with glibc 2.28 or
newer (for example Debian 10+ or Ubuntu 20.04+):

```bash
npm ci
npm run package:linux
./dist/chatgpt-tui-linux-x64 --help
```

The executable embeds Node.js and the application's JavaScript dependencies,
so target machines do not need Node.js or npm. Build it with Node.js 24 LTS on
Linux x64. The interactive clipboard action still requires `xsel` on the target
machine when it is used.

Use `--help` to view CLI options. The application defaults to `gpt-5.6-terra`; supply `--model <name>` to select another model available to your OpenAI project.
