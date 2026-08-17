import React, { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Navigation from './components/Navigation';
import HomePage from './pages/HomePage';
import ExperiencePage from './pages/ExperiencePage';
import ProjectsPage from './pages/ProjectsPage';
import OpenSourcePage from './pages/OpenSourcePage';
import PublicationsPage from './pages/PublicationsPage';
import TalksPage from './pages/TalksPage';
import BlogPage from './pages/BlogPage';
import BlogDetailPage from './pages/BlogDetailPage';
// import BooksPage from './pages/BooksPage';
// import PhotographyPage from './pages/PhotographyPage';
import ContactPage from './pages/ContactPage';

const LoginPage = lazy(() => import('./pages/admin/LoginPage'));
const DashboardPage = lazy(() => import('./pages/admin/DashboardPage'));
const ProjectsAdmin = lazy(() => import('./pages/admin/ProjectsAdmin'));
const ExperienceAdmin = lazy(() => import('./pages/admin/ExperienceAdmin'));
const BlogAdmin = lazy(() => import('./pages/admin/BlogAdmin'));
const BlogEditor = lazy(() => import('./pages/admin/BlogEditor'));
const BooksAdmin = lazy(() => import('./pages/admin/BooksAdmin'));
const PapersAdmin = lazy(() => import('./pages/admin/PapersAdmin'));

const RouteFallback = () => (
  <div className="flex items-center justify-center min-h-screen bg-dark-bg">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-dark-text-primary" />
  </div>
);

function App() {
  return (
    <Router>
      <AuthProvider>
        <div className="min-h-screen bg-dark-bg">
          <Suspense fallback={<RouteFallback />}>
            <Routes>
            {/* Public Routes */}
            <Route path="/" element={
              <>
                <Navigation />
                <main><HomePage /></main>
              </>
            } />
            <Route path="/experience" element={
              <>
                <Navigation />
                <main><ExperiencePage /></main>
              </>
            } />
            <Route path="/projects" element={
              <>
                <Navigation />
                <main><ProjectsPage /></main>
              </>
            } />
            <Route path="/open-source" element={
              <>
                <Navigation />
                <main><OpenSourcePage /></main>
              </>
            } />
            <Route path="/publications" element={
              <>
                <Navigation />
                <main><PublicationsPage /></main>
              </>
            } />
            <Route path="/talks" element={
              <>
                <Navigation />
                <main><TalksPage /></main>
              </>
            } />
            <Route path="/blog" element={
              <>
                <Navigation />
                <main><BlogPage /></main>
              </>
            } />
            <Route path="/blog/:slug" element={
              <>
                <Navigation />
                <main><BlogDetailPage /></main>
              </>
            } />
            {/* Reading and photography are temporarily disabled.
            <Route path="/books" element={
              <>
                <Navigation />
                <main><BooksPage /></main>
              </>
            } />
            <Route path="/photography" element={
              <>
                <Navigation />
                <main><PhotographyPage /></main>
              </>
            } />
            */}
            <Route path="/contact" element={
              <>
                <Navigation />
                <main><ContactPage /></main>
              </>
            } />

            {/* Admin Routes */}
            <Route path="/admin/login" element={<LoginPage />} />
            <Route path="/admin" element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            } />
            <Route path="/admin/projects" element={
              <ProtectedRoute>
                <ProjectsAdmin />
              </ProtectedRoute>
            } />
            <Route path="/admin/experience" element={
              <ProtectedRoute>
                <ExperienceAdmin />
              </ProtectedRoute>
            } />
            <Route path="/admin/blog" element={
              <ProtectedRoute>
                <BlogAdmin />
              </ProtectedRoute>
            } />
            <Route path="/admin/blog/:id" element={
              <ProtectedRoute>
                <BlogEditor />
              </ProtectedRoute>
            } />
            <Route path="/admin/books" element={
              <ProtectedRoute>
                <BooksAdmin />
              </ProtectedRoute>
            } />
            <Route path="/admin/papers" element={
              <ProtectedRoute>
                <PapersAdmin />
              </ProtectedRoute>
            } />
            </Routes>
          </Suspense>
        </div>
      </AuthProvider>
    </Router>
  );
}

export default App;
