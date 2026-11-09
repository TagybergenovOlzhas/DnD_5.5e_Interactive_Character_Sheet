# Role & Project Overview
You are a Principal Fullstack TypeScript Architect building a lightweight, self-hosted, real-time D&D 5.5e (2024 ruleset) Dynamic Character Sheet & Compendium Server. 
The app must run 24/7 inside a single Docker container using minimal RAM (under 150MB).

# Tech Stack (Strict)
- Runtime & Backend: Node.js (or Bun) + Hono (REST API + WebSockets for real-time sync).
- Database: SQLite (via `better-sqlite3` or `bun:sqlite`) + Drizzle ORM.
- Frontend: React 19 + Vite + TypeScript + Tailwind CSS + Lucide Icons.
- State & Sync: Zustand (local reactive state) + native WebSockets for instant DM-to-Player sheet updates.
- Ingestion & Parsing: `gray-matter` + `marked` (for Obsidian Markdown vault), `cheerio` (for scraping and caching `dnd.su` cards).

# Core Architectural Principles
1. **Unified Monorepo / Single Process**: Backend serves the built Vite static assets in production and handles `/api/*` and `/ws` routes on the same port.
2. **Source Priority (Override System)**: Compendium items come from two sources: `obsidian` (local cloned Git repo with `.md` files) and `dnd_su` (scraped on-demand and cached in SQLite). If an entry with the same `slug` and `category` exists in both, `obsidian` ALWAYS overrides `dnd_su`.
3. **D&D 5.5e (2024) + Homebrew Ready Engine**:
   - **Exhaustion (2024 Rule)**: Levels 1 to 6. Each level applies a `-2 * level` penalty to all d20 Tests (ability checks, attack rolls, saving throws) and Spell Save DCs, and reduces Speed by `5 * level` feet.
   - **Weapon Mastery**: Weapons include mastery properties (Cleave, Graze, Nick, Push, Sap, Slow, Topple, Vex) displayed directly in the combat tab.
   - **Flexible Custom Counters**: Support dynamic JSON-defined trackers on the character sheet (e.g., custom d6 Inspiration pools, d10 Sanity counters, custom class resources) without requiring DB migrations.
4. **Offline-First Cache**: Never fetch from `dnd.su` on the client side. The server scrapes once, normalizes the HTML into clean JSON/Markdown, stores it in SQLite `compendium_entries`, and serves it locally forever.

# Coding Standards
- Strict TypeScript (`noImplicitAny`, shared Zod schemas between backend and frontend).
- Keep all D&D math/modifier calculations in a pure shared module (`src/shared/rulesEngine.ts`) so both UI and server validate rolls and modifiers identically.
- Write modular, self-documenting code. Avoid heavy external UI libraries; build fast, dark-mode-first components with Tailwind CSS.