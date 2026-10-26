# Admin Panel Setup Guide

## Overview

Your portfolio site now has a fully functional admin panel that allows you to manage all content (projects, experience, blog posts, books, and research papers) without editing code. Changes are committed directly to your GitHub repository and trigger automatic redeployment.

## Features

✅ **Authentication**: GitHub OAuth for secure access
✅ **Content Management**: Full CRUD operations for all content types
✅ **Category Organization**: Standardized taxonomy (Inference, Training, GPU Programming, Architecture, Distributed Systems, Post-Training, Tools, HPC)
✅ **Markdown Editor**: Live preview for blog posts
✅ **Auto-deployment**: Changes trigger automatic rebuild
✅ **Version Control**: All changes are committed to Git

## Setup Instructions

### Step 1: Create GitHub OAuth App

1. Go to [GitHub Settings → Developer Settings → OAuth Apps](https://github.com/settings/developers)
2. Click **"New OAuth App"**
3. Fill in the details:
   - **Application name**: `Portfolio Admin Panel`
   - **Homepage URL**: `http://localhost:3000` (for development)
   - **Authorization callback URL**: `http://localhost:3000/api/auth/callback`
4. Click **"Register application"**
5. Note down your **Client ID**
6. Generate a new **Client Secret** and save it securely

### Step 2: Configure Environment Variables

Copy `.env.example` to `.env.local` in the project root:

```bash
cp .env.example .env.local

# GitHub OAuth Configuration
GITHUB_CLIENT_ID=your_client_id_here
GITHUB_CLIENT_SECRET=your_client_secret_here
# Encrypts the server-side session token (32+ random characters)
AUTH_SESSION_SECRET=your_long_random_session_secret
```

Sessions are stored in Postgres, so the admin panel also needs a database. Apply
`apps/portfolio/server/orin-schema.sql` once, then set `ORIN_DATABASE_URL` (or a
separate `AUTH_DATABASE_URL`). The GitHub access token is encrypted at rest and
never sent back to the browser; only an opaque session ID cookie is.

**Important**:
- Never commit the `.env` file to Git
- `.env` and `.env.local` are already in `.gitignore`

### Step 3: Update OAuth App for Production

When deploying to production (e.g., Vercel):

1. Update your GitHub OAuth App settings:
   - **Homepage URL**: `https://yourdomain.com`
   - **Callback URL**: `https://yourdomain.com/api/auth/callback`

2. Add environment variables to your hosting platform:
   - **Vercel**: Project Settings → Environment Variables
   - **Netlify**: Site Settings → Environment Variables

   Add:
   ```
   GITHUB_CLIENT_ID=your_client_id
   GITHUB_CLIENT_SECRET=your_client_secret
   AUTH_SESSION_SECRET=your_long_random_session_secret
   ORIN_DATABASE_URL=postgresql://USER:PASSWORD@HOST/DATABASE?sslmode=require
   ```

### Step 4: Start Development Server

The admin panel needs the serverless API routes as well as Vite. Run it with
Vercel's local runtime:

```bash
npx vercel dev
```

The site will normally be available at `http://localhost:3000`. Configure the
GitHub OAuth callback as `http://localhost:3000/api/auth/callback`.

## Using the Admin Panel

### Accessing the Admin Panel

1. Navigate to `/admin/login`
2. Click **"Sign in with GitHub"**
3. Authorize the application
4. You'll be redirected to the admin dashboard

### Managing Content

#### Projects
- **Add**: `/admin/projects` → "Add Project"
- **Edit**: Click the edit icon on any project
- **Delete**: Click the delete icon (with confirmation)
- **Fields**: Title, description, technologies, GitHub URL, demo URL, highlights

#### Experience
- **Add**: `/admin/experience` → "Add Experience"
- **Edit**: Click the edit icon on any experience entry
- **Fields**: Company, position, location, dates, description, highlights

#### Blog Posts
- **Add**: `/admin/blog` → "New Post"
- **Edit**: Click the edit icon on any post
- **Preview**: Live markdown preview while editing
- **Fields**: Title, slug, categories, keywords, summary, content (markdown), image, read time

#### Books
- **Add**: `/admin/books` → "Add Book"
- **Edit**: Click the edit icon on any book
- **Fields**: Title, author, cover image, rating, date read, review, categories, link

#### Research Papers
- **Add**: `/admin/papers` → "Add Paper"
- **Edit**: Click the edit icon on any paper
- **Fields**: Title, authors, venue/journal, year, PDF link, summary, key takeaways, tags

### Category Taxonomy

All content uses the following standardized categories:

- **Inference**: LLM inference, optimization, serving
- **Training**: Model training, fine-tuning, optimization
- **GPU Programming**: CUDA, GPU kernels, performance
- **Architecture**: System design, model architectures
- **Distributed Systems**: Scaling, distributed training
- **Post-Training**: RLHF, alignment, evaluation
- **Tools**: MLOps, frameworks, infrastructure
- **HPC**: High-performance computing, clusters

## How It Works

### Data Flow

1. **Edit Content** → Form in admin panel
2. **Save** → Validates and commits to GitHub via API
3. **GitHub** → Receives commit to `apps/portfolio/src/data/portfolioData.js`
4. **Auto-Deploy** → Vercel/Netlify rebuilds site (2-3 minutes)
5. **Live** → Changes appear on your portfolio

### Security

- ✅ Only the repository owner can access the admin panel
- ✅ GitHub OAuth ensures secure authentication
- ✅ The GitHub token lives in a server-side session (encrypted, 8-hour TTL) and is revoked on logout; the browser only receives an opaque HttpOnly session ID
- ✅ Admin writes require a `repo`/`public_repo` session; ORIN-only sessions cannot reach them
- ✅ All changes are version controlled
- ✅ Protected routes prevent unauthorized access

### Troubleshooting

**"Failed to fetch portfolio data"**
- Verify your GitHub session is still valid by reloading the page or signing out and back in
- Check that GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, and AUTH_SESSION_SECRET are set correctly
- Confirm the database is reachable and `orin-schema.sql` has been applied
- Ensure you have write access to the repository

**"Authentication Error"**
- Make sure the OAuth callback URL matches your GitHub app settings
- Check that `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, and `AUTH_SESSION_SECRET` are available to the serverless runtime
- If sign-in redirects back with `error=session_storage`, the database or session secret is missing

**Changes not appearing**
- Wait 2-3 minutes for deployment to complete
- Check your hosting platform's deployment logs
- Verify the commit was made in GitHub

**Token expired**
- Simply log out and log back in
- Tokens expire after 8 hours for security

## File Structure

```
apps/portfolio/src/
├── components/
│   ├── admin/
│   │   ├── AdminLayout.jsx          # Admin panel layout
│   │   └── forms/                   # Reusable form components
│   │       ├── Input.jsx
│   │       ├── Textarea.jsx
│   │       ├── ArrayInput.jsx
│   │       ├── CategorySelector.jsx
│   │       └── MarkdownEditor.jsx
│   └── ProtectedRoute.jsx           # Route protection
├── contexts/
│   └── AuthContext.jsx              # Authentication state
├── pages/
│   └── admin/
│       ├── LoginPage.jsx            # Login page
│       ├── DashboardPage.jsx        # Admin dashboard
│       ├── ProjectsAdmin.jsx        # Manage projects
│       ├── ExperienceAdmin.jsx      # Manage experience
│       ├── BlogAdmin.jsx            # Blog post list
│       ├── BlogEditor.jsx           # Blog post editor
│       ├── BooksAdmin.jsx           # Manage books
│       └── PapersAdmin.jsx          # Manage papers
├── services/
│   └── githubService.js             # GitHub API integration
└── utils/
    ├── constants.js                 # Category taxonomy
    ├── jsParser.js                  # Parse JS files
    └── validation.js                # Form validation

api/
└── auth/
    └── callback.js                  # OAuth callback handler
```

## Next Steps

1. ✅ Set up GitHub OAuth app
2. ✅ Add environment variables
3. ✅ Test locally
4. ✅ Deploy to production
5. ✅ Update OAuth app with production URL
6. ✅ Start managing your content!

## Support

If you encounter issues:
1. Check the browser console for errors
2. Verify environment variables are set
3. Check GitHub API rate limits
4. Review deployment logs

---

**Built with**: React, Vite, Tailwind CSS, GitHub API
**Authentication**: GitHub OAuth
**Storage**: GitHub Repository
**Deployment**: Auto-deploy on commit
