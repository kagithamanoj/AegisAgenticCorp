# AegisCorp HQ Architecture

## Frontend (`/src`)
The frontend is built with React and Vite. It serves as the visual Mission Control.
- **Routing**: URL navigation is fully managed by `react-router-dom` in `App.tsx`.
- **Views**:
  - `/mission`: The Kanban board (`MissionControl.tsx`) with a togglable right-side Live Feed.
  - `/squad`: An interactive data table of squad agents.
  - `/analytics`: Real-time ROI reporting charting agent token usage and cost savings.
  - `/broadcast`: A global alert dispatcher to all working agents.
  - `/notifications`: A system ledger tracking milestones, errors, and task updates.
  - `/channel/:agent`: Direct War Room conversation contexts with individual AI agents.
  - `/project/:project`: Dedicated views for specific workstreams (e.g., Coinbase Trading).
- **Design System**: A strict Anthropic-inspired aesthetic using standard `lucide-react` icons, paper/ivory background tones, and minimalist UI components without harsh shadows.

## Backend (`server.js`)
An Express server sitting at the root directory acts as the central API gateway.
- **AI Integration**: It intercepts all chat commands and relays them to the Minimax M2.5 REST API using the configured `MINIMAX_API_KEY`.
- **System Prompts**: Automatically reads agent personas if available. Injects a foundational `UI CONTEXT` prompt telling agents they are currently operating inside the AegisCorp Mission Control UI.
- **Analytics Engine**: All tokens consumed by Minimax are parsed and logged in a persistent `analytics.json` flat file. 
- **Task Management**: Endpoints support a standard CRUD workflow for the Kanban board, stored in `tasks.json`. When tasks transition to "done", a global `tasks_completed` integer is automatically incremented in the analytics file.
