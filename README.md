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

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone <your-repo-url>
cd Portfolio-Site
```

2. Install dependencies:
```bash
npm install
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

The built files will be in the `dist` directory.

### Preview Production Build

```bash
npm run preview
```

## Customization

### Update Your Information

Edit the `src/data/portfolioData.js` file to add your personal information:

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

The color theme can be adjusted in `tailwind.config.js`:

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
├── src/
│   ├── components/
│   │   ├── Navigation.jsx
│   │   ├── Hero.jsx
│   │   ├── Experience.jsx
│   │   ├── Projects.jsx
│   │   ├── Publications.jsx
│   │   ├── Talks.jsx
│   │   ├── Blog.jsx
│   │   ├── Photography.jsx
│   │   └── Contact.jsx
│   ├── data/
│   │   └── portfolioData.js
│   ├── App.jsx
│   ├── main.jsx
│   └── index.css
├── public/
├── index.html
├── package.json
├── vite.config.js
└── tailwind.config.js
```

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
# Drag and drop the 'dist' folder to Netlify
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

Visit `/orin` for the owner-only daily digest. Projects and Experience are currently hidden through `src/config/publicSections.js`, with their source retained.

See [ORIN hosting and database setup](docs/ORIN.md) and [daily collection, model choices, and pricing](docs/ORIN-SOURCES.md). The current Render static service cannot execute API handlers; ORIN needs a Node web service (`npm start`) or compatible serverless hosting. `render-node.yaml` is an optional Node service blueprint; the existing static configuration remains unchanged.
