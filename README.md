# ChatGPT TUI

Terminal interface for OpenAI coding conversations.

## Requirements

- Node.js 20 or later
- An OpenAI API key

## Build and run

```bash
npm install
export OPENAI_API_KEY="your_api_key"
npm run dev
```

To build the distributable CLI:

```bash
npm run build
npm run shebang
node dist/index.js
```

Use `--help` to view CLI options. The application defaults to `gpt-5.6-terra`; supply `--model <name>` to select another model available to your OpenAI project.
