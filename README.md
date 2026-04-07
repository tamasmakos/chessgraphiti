# ChessGraphiti: Graph-Native Intelligence for the Modern Game

The dominant representation of chess knowledge—as move sequences, scalar evaluations, and engine-optimal lines—is mismatched with how humans learn, prepare, and fail under pressure. This representational deficiency is not an engineering problem to be patched by deeper search or better NLP; it is a structural gap in how we model the game.

**ChessGraphiti** is the first analytics and preparation platform built on a different ontology: **Graph-Native Intelligence.**

- **Positions are Relational Graphs:** Pieces are nodes; attacks and defenses are directed, typed, weighted relationships.
- **Games are Temporal Trajectories:** A game is a narrative of structural transformation across graph states, not just a series of centipawn scores.
- **Preparation is Structural Coverage:** We move beyond "lines" to map the structural neighborhoods of your repertoire, identifying motif-level gaps before they become tournament-losing failures.
- **Practical Sharpness as a Metric:** Quantifying "how hard" a position is for a human to navigate, bridging the gap between engine perfection and practical reality.

We aren't building another engine. We are building the first platform whose native representation matches the structure of human chess reasoning.

---

# ChessGraphiti

ChessGraphiti helps people learn chess faster by turning positions into directed weighted graphs and games into temporal graph experiences.

## 🚀 Vision

- **Graphity:** Pieces are nodes; attacks and defenses are directed weighted relationships.
- **Temporal Analysis:** A game is a temporal sequence of graph states.
- **Intuition:** Visualizing chess structure through graphs to accelerate understanding.

## 🏗️ Project Structure

This project is a monorepo managed with **pnpm**, **Turborepo**, and **TypeScript**.

### Applications (`apps/`)

- **`frontend/web`**: The primary browser-based training dashboard. Built with **React**, **Vite**, and **Tailwind CSS**.
- **`frontend/mobile`**: Touch-first study and practice flows. Built with **Expo** and **React Native**.
- **`frontend/landing`**: Marketing and product storytelling site. Built with **Astro**.
- **`backend/api`**: Server-side orchestration and analysis. Built with **Hono** and **Node.js**.

### Shared Packages (`packages/`)

- **`shared/chess`**: Shared chess domain model and graph logic.
- **`shared/config`**: Shared Biome, TypeScript, and developer tool configurations.
- **`backend/core`**: Common backend utilities and database access (Kysely).

## 🛠️ Tech Stack

- **Runtime:** [Node.js](https://nodejs.org/) (>= 24.0.0)
- **Package Manager:** [pnpm](https://pnpm.io/)
- **Monorepo:** [Turborepo](https://turbo.build/)
- **Tooling:** [Biome](https://biomejs.dev/) (Linting & Formatting), [Vitest](https://vitest.dev/) (Testing)

## 🏁 Getting Started

### Prerequisites

Ensure you have **Node.js >= 24** and **pnpm** installed.

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/tamasmakos/chessgraphiti.git
   cd chessgraphiti
   ```

2. **Install dependencies:**
   ```bash
   pnpm install
   ```

3. **Environment Setup:**
   Copy the example environment file and update it with your local settings.
   ```bash
   cp .env.example .env
   ```

4. **Start Development:**
   Run all applications simultaneously using Turborepo.
   ```bash
   pnpm run dev
   ```

## 📜 Available Scripts

- `pnpm dev`: Start all apps in development mode.
- `pnpm build`: Build all apps for production.
- `pnpm lint`: Lint and fix code using Biome.
- `pnpm typecheck`: Run TypeScript type checks across all packages.
- `pnpm test`: Run unit and integration tests.
- `pnpm format`: Format code using Biome.

## 📐 Development Guidelines

- **Product Reference:** Refer to `docs/mvp.html` for feature specifications.
- **UX Priorities:** Work **mobile-first**. Maintain a classic, calm base layer (brown board tones) with a secondary vivid visualization layer (Graphity Vision).
- **Architecture:** Keep UI concerns strictly frontend, and backend concerns strictly backend.
- **Terminology:** Use precise chess language: *position, line, opening, attack, defense, pressure, protection, centrality, community, modularity, evaluation, export*.

---
