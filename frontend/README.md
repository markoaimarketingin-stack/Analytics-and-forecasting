# Analytics & Forecasting Agent - Frontend

A modern, responsive React-based frontend for the Analytics & Forecasting Agent. Built with TypeScript, Tailwind CSS, and Recharts for beautiful data visualization.

## Features

- **Dashboard**: Real-time analytics metrics and KPI tracking
- **Revenue Forecast**: Visual forecasting with interactive charts
- **Scenario Analysis**: Compare best, base, and worst case scenarios
- **Deep Analysis**: Cohort analysis, funnel modeling, and attribution insights
- **Chat Interface**: Conversational analysis and follow-up questions
- **Responsive Design**: Works seamlessly on desktop and mobile devices

## Tech Stack

- **React 19** - UI framework
- **TypeScript** - Type-safe development
- **Tailwind CSS** - Utility-first styling
- **Vite** - Fast build tool
- **Recharts** - Beautiful charts and graphs
- **Axios** - HTTP client
- **Lucide React** - Icon library

## Getting Started

### Prerequisites
- Node.js 18+
- npm or yarn

### Installation

```bash
cd frontend
npm install
```

### Development

```bash
npm run dev
```

The app will be available at `http://localhost:5173`

### Build

```bash
npm run build
```

### Lint

```bash
npm run lint
```

## Project Structure

```
frontend/
├── src/
│   ├── components/
│   │   ├── Header.tsx           # Top navigation
│   │   ├── Sidebar.tsx          # Navigation sidebar
│   │   ├── Dashboard.tsx        # Main dashboard view
│   │   ├── ChatInput.tsx        # Chat message input
│   │   ├── MessageList.tsx      # Chat message display
│   │   ├── SuggestionsPanel.tsx # Actionable suggestions
│   │   └── SuggestionCard.tsx   # Individual suggestion card
│   ├── App.tsx                  # Main app component
│   ├── types.ts                 # TypeScript types
│   ├── index.css                # Global styles
│   └── main.tsx                 # Entry point
├── index.html                   # HTML template
├── package.json                 # Dependencies
├── vite.config.ts               # Vite configuration
├── tailwind.config.js           # Tailwind configuration
├── tsconfig.json                # TypeScript configuration
└── eslint.config.js             # ESLint configuration
```

## API Integration

The frontend expects the backend API to be available at `http://localhost:8000/api`. Update the `API_BASE` constant in `App.tsx` if your API is hosted elsewhere.

### Sample Endpoints (to be implemented)

- `POST /api/analyze` - Run analytics analysis
- `POST /api/runs/{id}/chat` - Chat about specific analysis run
- `GET /api/history` - Get analysis history

## Key Components

### Dashboard
Displays key metrics, revenue forecast charts, scenario comparison, and funnel analysis.

### Chat Interface
Allows users to ask follow-up questions and interact with analysis results.

### Sidebar Navigation
- Dashboard
- Forecast
- Scenarios
- Analysis

## Styling

Uses a custom Tailwind CSS configuration with predefined color scheme:
- Primary: Blue (#3B82F6)
- Secondary: Green (#10B981)
- Danger: Red (#EF4444)
- Warning: Amber (#F59E0B)

## Future Enhancements

- [ ] Real-time WebSocket updates for long-running analyses
- [ ] PDF report export
- [ ] Custom date range filtering
- [ ] Budget allocation optimizer
- [ ] A/B testing interface
- [ ] User authentication and multi-tenant support
- [ ] Dark mode toggle

## License

GNU General Public License v3 (GPL-3.0)

