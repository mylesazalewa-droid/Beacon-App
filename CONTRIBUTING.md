# Contributing to Beacon

Thanks for wanting to help! Beacon is a free, open-source tool for church media teams.

## Getting Started

1. Fork the repo and clone your fork
2. Run `./setup.sh` to install all dependencies
3. Start dev mode: `npm run dev`
4. Make your changes and test them
5. Open a PR with a clear description of what you changed and why

## Project Conventions

- **Python:** PEP 8, type hints where practical, no external AI APIs
- **React:** Functional components, Tailwind for all styles, no CSS modules
- **Commits:** Use present tense (`Add X`, `Fix Y`, `Update Z`)

## Key Rules (from the project brief)

- **Local only** — never add cloud API calls for vision, transcription, or embeddings
- **LLaVA only** — do not swap in Moondream or other models without discussion
- **SQLite only** — no Postgres, MySQL, or cloud databases
- **Dynamic categories** — the AI prompt must always read from the DB at runtime

## Reporting Bugs

Open a GitHub issue with:
- macOS version + chip (e.g. M2 Pro)
- Steps to reproduce
- What you expected vs what happened
- Relevant log output from the dev console

## Feature Requests

Check the existing issues first. If your idea isn't there, open an issue describing the use case before building it — this keeps effort aligned with what church media teams actually need.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
