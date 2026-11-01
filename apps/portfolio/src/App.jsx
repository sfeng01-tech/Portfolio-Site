import React, { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Navigation from './components/Navigation';
import HomePage from './pages/HomePage';
import OpenSourcePage from './pages/OpenSourcePage';
import PublicationsPage from './pages/PublicationsPage';
import TalksPage from './pages/TalksPage';
import BlogPage from './pages/BlogPage';
import BlogPostPage from './pages/BlogPostPage';
// import BooksPage from './pages/BooksPage';
// import PhotographyPage from './pages/PhotographyPage';
import ContactPage from './pages/ContactPage';

const LoginPage = lazy(() => import('./pages/admin/LoginPage'));
const OrinPage = lazy(() => import('./pages/OrinPage'));
const OrinVideosPage = lazy(() => import('./pages/OrinVideosPage'));
const DashboardPage = lazy(() => import('./pages/admin/DashboardPage'));
const BlogAdmin = lazy(() => import('./pages/admin/BlogAdmin'));
const BlogEditor = lazy(() => import('./pages/admin/BlogEditor'));
const BooksAdmin = lazy(() => import('./pages/admin/BooksAdmin'));
const PapersAdmin = lazy(() => import('./pages/admin/PapersAdmin'));

const RouteFallback = () => (
  <div className="flex items-center justify-center min-h-screen bg-dark-bg">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-dark-text-primary" />
  </div>
);

// Static portfolio hosting delegates the private route to its Node service.
// The Node deployment leaves this build variable unset and renders ORIN locally.
function OrinEntry({ path = '/orin', children }) {
  const target = import.meta.env.VITE_ORIN_ORIGIN;
  const external = target && target !== window.location.origin;
  useEffect(() => {
    if (external) window.location.replace(`${target.replace(/\/$/, '')}${path}`);
  }, [target, external]);
  return external ? <RouteFallback /> : (children || <OrinPage />);
}

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
                <main id="main-content" tabIndex={-1}><HomePage /></main>
              </>
            } />
            <Route path="/experience" element={<Navigate to="/" replace />} />
            <Route path="/projects" element={<Navigate to="/" replace />} />
            <Route path="/open-source" element={
              <>
                <Navigation />
                <main id="main-content" tabIndex={-1}><OpenSourcePage /></main>
              </>
            } />
            <Route path="/publications" element={
              <>
                <Navigation />
                <main id="main-content" tabIndex={-1}><PublicationsPage /></main>
              </>
            } />
            <Route path="/talks" element={
              <>
                <Navigation />
                <main id="main-content" tabIndex={-1}><TalksPage /></main>
              </>
            } />
            <Route path="/blog" element={
              <>
                <Navigation />
                <main id="main-content" tabIndex={-1}><BlogPage /></main>
              </>
            } />
            <Route path="/blog/:slug" element={
              <>
                <Navigation />
                <main id="main-content" tabIndex={-1}><BlogPostPage /></main>
              </>
            } />
            {/* Reading and photography are temporarily disabled.
            <Route path="/books" element={
              <>
                <Navigation />
                <main id="main-content" tabIndex={-1}><BooksPage /></main>
              </>
            } />
            <Route path="/photography" element={
              <>
                <Navigation />
                <main id="main-content" tabIndex={-1}><PhotographyPage /></main>
              </>
            } />
            */}
            <Route path="/contact" element={
              <>
                <Navigation />
                <main id="main-content" tabIndex={-1}><ContactPage /></main>
              </>
            } />

            {/* Admin Routes */}
            <Route path="/orin" element={
              <>
                <Navigation variant="orin" />
                <OrinEntry />
              </>
            } />
            <Route path="/orin/videos" element={
              <>
                <Navigation variant="orin" />
                <OrinEntry path="/orin/videos"><OrinVideosPage /></OrinEntry>
              </>
            } />
            <Route path="/admin/login" element={<LoginPage />} />
            <Route path="/admin" element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            } />
            <Route path="/admin/projects" element={<Navigate to="/admin" replace />} />
            <Route path="/admin/experience" element={<Navigate to="/admin" replace />} />
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
