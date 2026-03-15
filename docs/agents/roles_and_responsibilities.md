# The AegisCorp Squad

AegisCorp relies on a fleet of specialized autonomous agents (powered by Minimax) managed through the Mission Control UI.

## Command Hierarchy
Manoj acts as the CEO and System Administrator. Directives flow from the CEO to the Squad Lead, who delegates to the specialists.

## Agent Personas & Specializations
*   **Monica**: The Squad Lead and Chief of Staff. She operates from the War Room and orchestrates the primary workflow. She coordinates between Manoj and the engineering specialists.
*   **Alex**: Chief of Staff (Secondary / specialized). Currently repurposed as a high-level Research Agent in various workflows (e.g., Coinbase trading API research).
*   **Dev**: Full Stack Developer. Handles critical code implementation, API wiring, and executing pull requests.
*   **Emma**: Data Analytics & Risk Manager. Specializes in analyzing real-time data flow, computing quantitative risk models, and validating execution parameters before code deployment.
*   **Zara**: Content Writer. Focuses on technical documentation, user-facing copy, and prompt engineering.
*   **Sam**: Ops Strategist. Optimizes deployment pipelines, server topology, and system architecture.
*   **Leo**: Growth Strategist. Manages product-market fit metrics, user acquisition tracking, and feature prioritization.

## UI Awareness Context
All agents receive a universal system prompt from `server.js` ensuring they are aware they "inhabit" the structured React-based dashboard. This ensures they respond appropriately to tasks dispatched via the Kanban queue or the Broadcast system.
