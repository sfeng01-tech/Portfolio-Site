# AGENTS.md

This repository is an npm-workspaces monorepo containing:

- `apps/portfolio`: the React 18 + Vite portfolio front end and its optional Node HTTP server.
- `apps/orin-collector`: the independently scheduled ORIN content collector.
- `api/`: root-level serverless API handlers used by Vercel.
- `docs/`: operational and setup documentation.

## Development commands

Run commands from the repository root unless a task clearly belongs to one workspace.

- `npm ci`: install all workspace dependencies.
- `npm run dev`: start the Vite development server.
- `npm run dev:server`: start the local Node HTTP server with `.env.local`, if present.
- `npm run build`: build the portfolio and copy `apps/portfolio/dist` to the root `dist` for Render static deployments.
- `npm run preview`: preview the Vite production build.
- `npm test`: run the full repository test suite.
- `npm run test:portfolio`: run only the portfolio tests.
- `npm run test:orin`: run only the ORIN collector tests.
- `npm run collect`: run the ORIN collector.

For a local ORIN dry run, use:

```bash
npm run collect --workspace=@portfolio/orin-collector -- --once --rss-only --dry-run
```

## Implementation guidance

- Preserve the existing monorepo boundaries. Do not move `api/` out of the repository root; Vercel relies on its current location.
- Keep shared package-lock updates in the root lockfile. Do not create a second package manager.
- Keep portfolio content customizations in `apps/portfolio/src/data/portfolioData.js`.
- Keep theme tokens and Tailwind customization in `apps/portfolio/tailwind.config.js`.
- Respect `apps/portfolio/src/config/publicSections.js`; private ORIN configuration may intentionally hide source-backed public sections.
- Use ES modules. Both workspace packages declare `"type": "module"`.
- Prefer the existing React patterns: function components, hooks, Tailwind utility classes, and the current component/data organization.
- Treat the portfolio server and API handlers as deployment-sensitive. Verify environment-variable access and host/port handling before changing them.
- Follow the README deployment notes before making hosting changes. The Render static service cannot execute the API handlers; ORIN requires a Node web service or compatible serverless hosting.

## Testing and verification

- Run the narrowest relevant workspace test command first.
- After changing shared code, build logic, dependency versions, or API handlers, run the full `npm test`.
- Before shipping deployment-affecting changes, also run `npm run build`.
- Do not commit generated build output unless a task explicitly requires a source-controlled deployment artifact.
