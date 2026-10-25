import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const portfolioBuild = path.join(repositoryRoot, 'apps/portfolio/dist');
const staticSiteBuild = path.join(repositoryRoot, 'dist');

await rm(staticSiteBuild, { recursive: true, force: true });
await mkdir(staticSiteBuild, { recursive: true });
await cp(portfolioBuild, staticSiteBuild, { recursive: true });
