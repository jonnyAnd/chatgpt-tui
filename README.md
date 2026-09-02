# ChatGPT TUI

## Updated version of https://github.com/narinluangrath/chatgpt-tui
## Rough beta demo - use at own risk, probably unstable, only for debian based linux
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
node dist/index.js
```

## Single-file Linux executable

Build a `linux-x64` executable for Debian-based systems with glibc 2.28 or
newer (for example Debian 10+ or Ubuntu 20.04+):

To install the latest published release directly:

```bash
sh -c "$(curl -fsSL https://raw.githubusercontent.com/jonnyAnd/chatgpt-tui/main/tools/install.sh)"
```

The installer requires `python3` to inspect release metadata. It prompts for an
administrator password through `sudo` if `/usr/local/bin` is not writable.

```bash
npm ci
npm run package:linux
./dist/chatgpt-tui-linux-x64 --help
```

The executable embeds Node.js and the application's JavaScript dependencies,
so target machines do not need Node.js or npm. Build it with Node.js 24 LTS on
Linux x64. The interactive clipboard action still requires `xsel` on the target
machine when it is used.

To install a packaged executable system-wide, run its install command with the
privileges needed to write to `/usr/local/bin`:

```bash
sudo ./dist/chatgpt-tui-linux-x64 -install
```

It installs as `chatgpt-tui` without modifying your `PATH`.

Once installed, check for and apply the latest published Linux x64 release with:

```bash
chatgpt-tui --update
```

The command verifies the release asset before atomically replacing the installed
executable. If the installation directory requires administrator permission, it
prompts for your password through `sudo`.

Use `--help` to view CLI options. The application defaults to `gpt-5.6-terra`; supply `--model <name>` to select another model available to your OpenAI project.

## CLI arguments

Run `chatgpt-tui --help` (or `node dist/index.js --help` when running from a
source build) to see the options available in your installation.

| Argument | What it does |
| --- | --- |
| `-h, --help` | Show the available command-line options and exit. |
| `-v, --version` | Print the application version and exit. |
| `-s, --system-msg <msg>` | Preload a system message that sets instructions or context for the conversation. |
| `-u, --user-msg <msg>` | Send a user message immediately instead of opening the interactive prompt. The response streams to standard output, which makes this useful in scripts. |
| `-m, --model <model>` | Select the OpenAI model to use. Defaults to `gpt-5.6-terra`; the model must be available to your OpenAI project. |
| `-d, --debug` | Print user messages after the application's placeholder parsing, for troubleshooting. |
| `-q, --quiet` | Do not display the Figlet startup banner. |
| `-l, --location <path>` | Set the workspace for this run. Relative `$FILE` and `$FOLDER` paths are resolved from this folder, and paths outside it are not imported. Defaults to the directory where you started the command. |
| `--install` / `-install` | Install a packaged Linux executable as `/usr/local/bin/chatgpt-tui`. This option is available before installation; `-install` is kept as an alias. |
| `--update` | Download and install the latest published Linux x64 executable. This option is available only from an installed `chatgpt-tui` executable; it requests administrator permission when needed. |

For example, use `~/projects/my-app` as the workspace and import its
`package.json` file with:

```bash
chatgpt-tui --location ~/projects/my-app --user-msg '$FILE(package.json)'
```

For example, to make a non-interactive request with a specific model:

```bash
chatgpt-tui --quiet --model gpt-5.6-terra --user-msg "Explain this project"
```
