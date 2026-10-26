# Professional Portfolio Website

A modern, responsive portfolio website for Tech Leads and AI Technical Program Managers. Built with React, Vite, and Tailwind CSS, with light and dark themes and a private ORIN research reading space.

## Features

- **Intro Section**: Showcase your skills and key achievements
- **Experience Timeline**: Display work history with company details, dates, and locations
- **Projects Showcase**: Highlight your technical projects with links and technologies
- **Publications**: List academic papers and articles with venue information
- **Talks & Presentations**: Share your speaking engagements with slides/video links
- **Blog Section**: Articles organized by categories (AI Inference, Training, DevOps, Software Engineering) with keyword tags
- **Photography/Exploration**: Photo gallery with lightbox modal
- **Contact Form**: Get in touch section with social media links
- **Responsive Design**: Mobile-first, works on all devices
- **Smooth Navigation**: Sticky header with smooth scrolling

## Tech Stack

- **React 18**: Modern React with hooks
- **Vite**: Lightning-fast build tool
- **Tailwind CSS**: Utility-first CSS framework
- **Lucide React**: Beautiful icon library

## Monorepo layout

The repository uses npm workspaces with one lockfile. The portfolio and its server adapter live in `apps/portfolio`; the independently scheduled ORIN collector lives in `apps/orin-collector`. The API handlers stay at the repository root because Vercel discovers functions from the root `api/` directory. Root scripts provide common developer commands, and deployments can install only the workspace they run.

## Getting Started

### Prerequisites

- Node.js 22
- npm 10

### Installation

1. Clone the repository:
```bash
git clone <your-repo-url>
cd Portfolio-Site
```

2. Install all workspace dependencies from the repository root:
```bash
npm ci
```

3. Start the development server:
```bash
npm run dev
```

4. Open your browser and navigate to `http://localhost:5173`

### Build for Production

```bash
npm run build
```

The portfolio build is in `apps/portfolio/dist`. The root `npm run build` also copies it to `dist` for the existing Render Static Site configuration.

### Preview Production Build

```bash
npm run preview
```

## Customization

### Update Your Information

Edit `apps/portfolio/src/data/portfolioData.js` to add your personal information:

1. **Profile**: Name, title, email, social links
2. **Skills**: Organized by categories
3. **Achievements**: Key accomplishments
4. **Experiences**: Work history with dates and details
5. **Projects**: Portfolio projects with links
6. **Publications**: Research papers and articles
7. **Talks**: Speaking engagements
8. **Blog Posts**: Articles with categories and keywords
9. **Photography**: Photo gallery with descriptions

### Customize Colors

The color theme can be adjusted in `apps/portfolio/tailwind.config.js`:

```javascript
colors: {
  dark: {
    bg: '#0a0a0a',           // Main background
    surface: '#141414',       // Card backgrounds
    border: '#262626',        // Borders
    text: {
      primary: '#e5e5e5',    // Primary text
      secondary: '#a3a3a3',  // Secondary text
      muted: '#737373',      // Muted text
    }
  }
}
```

## Project Structure

```
Portfolio-Site/
├── apps/
│   ├── portfolio/
│   │   ├── src/
│   │   │   ├── components/
│   │   │   ├── data/
│   │   │   ├── pages/
│   │   │   └── App.jsx
│   │   ├── server/
│   │   ├── tests/
│   │   ├── index.html
│   │   └── package.json
│   └── orin-collector/
│       ├── collect.mjs
│       ├── config.example.json
│       └── package.json
├── api/                 # root-discovered Vercel API functions
├── docs/
├── package.json         # workspace scripts and package manager root
└── package-lock.json
```

`npm test` runs both workspace test suites. For a local ORIN collection dry run, use `npm run collect --workspace=@portfolio/orin-collector -- --once --rss-only --dry-run`.

## Deployment

This site can be deployed to various platforms:

### Vercel
```bash
npm install -g vercel
vercel
```

### Netlify
```bash
npm run build
# Drag and drop 'apps/portfolio/dist' to Netlify
```

### GitHub Pages
```bash
npm run build
# Push the 'dist' folder to gh-pages branch
```

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For questions or issues, please open an issue on GitHub.

## ORIN private reading room

Visit `/orin` for the owner-only daily digest. Projects and Experience are currently hidden through `apps/portfolio/src/config/publicSections.js`, with their source retained.

GitHub sign-in uses a server-side session: the browser holds only an opaque HttpOnly cookie, the GitHub token is encrypted at rest in Postgres, and sign-out revokes it. Set `AUTH_SESSION_SECRET` (32+ random characters) and apply `apps/portfolio/server/orin-schema.sql`; sessions use `AUTH_DATABASE_URL` when present and otherwise `ORIN_DATABASE_URL`.

See [ORIN hosting and database setup](docs/ORIN.md) and [daily collection, model choices, and pricing](docs/ORIN-SOURCES.md). The current Render static service cannot execute API handlers; ORIN needs a Node web service (`npm start`) or compatible serverless hosting. `render-node.yaml` is an optional Node service blueprint; the existing static configuration remains unchanged. Unknown `/api/*` routes return JSON 404 instead of the SPA, and both hosting paths send a strict Content Security Policy.
