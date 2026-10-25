import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import githubService from '../../services/githubService';
import AdminLayout from '../../components/admin/AdminLayout';
import {
  BookOpen,
  Library,
  FileText,
  Plus,
  AlertCircle,
  CheckCircle,
  RefreshCw
} from 'lucide-react';

const DashboardPage = () => {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const portfolioData = await githubService.fetchPortfolioData();
      setData(portfolioData);
    } catch (err) {
      console.error('Error loading data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const stats = data ? [
    {
      name: 'Blog Posts',
      count: data.blogPosts?.length || 0,
      icon: BookOpen,
      link: '/admin/blog',
      color: 'text-purple-400'
    },
    {
      name: 'Books',
      count: data.books?.length || 0,
      icon: Library,
      link: '/admin/books',
      color: 'text-yellow-400'
    },
    {
      name: 'Research Papers',
      count: data.researchPapers?.length || 0,
      icon: FileText,
      link: '/admin/papers',
      color: 'text-pink-400'
    }
  ] : [];

  return (
    <AdminLayout>
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-dark-text-primary mb-2">
            Dashboard
          </h1>
          <p className="text-dark-text-secondary">
            Welcome back, {user?.name || user?.login}! Manage your portfolio content.
          </p>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <RefreshCw className="animate-spin text-dark-text-primary mx-auto mb-4" size={40} />
              <p className="text-dark-text-secondary">Loading portfolio data...</p>
            </div>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="bg-red-900/20 border border-red-500/50 rounded-lg p-6 mb-8">
            <div className="flex items-start gap-3">
              <AlertCircle className="text-red-400 flex-shrink-0 mt-0.5" size={20} />
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-red-400 mb-1">
                  Error Loading Data
                </h3>
                <p className="text-red-300 text-sm mb-3">{error}</p>
                <button
                  onClick={loadData}
                  className="text-sm text-red-400 hover:text-red-300 underline"
                >
                  Try Again
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Success State */}
        {!loading && !error && data && (
          <>
            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
              {stats.map((stat) => {
                const Icon = stat.icon;
                return (
                  <Link
                    key={stat.name}
                    to={stat.link}
                    className="bg-dark-surface border border-dark-border rounded-lg p-6 hover:border-dark-text-muted transition-all hover:-translate-y-1"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <Icon className={`${stat.color}`} size={32} />
                      <span className="text-3xl font-bold text-dark-text-primary">
                        {stat.count}
                      </span>
                    </div>
                    <h3 className="text-lg font-semibold text-dark-text-primary">
                      {stat.name}
                    </h3>
                  </Link>
                );
              })}
            </div>

            {/* Quick Actions */}
            <div className="bg-dark-surface border border-dark-border rounded-lg p-6">
              <h2 className="text-xl font-bold text-dark-text-primary mb-4 flex items-center gap-2">
                <CheckCircle size={24} />
                Quick Actions
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <Link
                  to="/admin/blog"
                  className="flex items-center gap-3 px-4 py-3 bg-dark-bg border border-dark-border rounded-lg hover:border-dark-text-muted transition-colors"
                >
                  <Plus size={20} className="text-purple-400" />
                  <span className="text-dark-text-primary font-medium">New Blog Post</span>
                </Link>
                <Link
                  to="/admin/books"
                  className="flex items-center gap-3 px-4 py-3 bg-dark-bg border border-dark-border rounded-lg hover:border-dark-text-muted transition-colors"
                >
                  <Plus size={20} className="text-yellow-400" />
                  <span className="text-dark-text-primary font-medium">Add Book</span>
                </Link>
                <Link
                  to="/admin/papers"
                  className="flex items-center gap-3 px-4 py-3 bg-dark-bg border border-dark-border rounded-lg hover:border-dark-text-muted transition-colors"
                >
                  <Plus size={20} className="text-pink-400" />
                  <span className="text-dark-text-primary font-medium">Add Paper</span>
                </Link>
                <a
                  href="/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 px-4 py-3 bg-dark-bg border border-dark-border rounded-lg hover:border-dark-text-muted transition-colors"
                >
                  <BookOpen size={20} className="text-dark-text-muted" />
                  <span className="text-dark-text-primary font-medium">View Portfolio</span>
                </a>
              </div>
            </div>

            {/* Info Banner */}
            <div className="mt-8 bg-blue-900/20 border border-blue-500/50 rounded-lg p-6">
              <div className="flex items-start gap-3">
                <AlertCircle className="text-blue-400 flex-shrink-0 mt-0.5" size={20} />
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-blue-400 mb-1">
                    About Admin Panel
                  </h3>
                  <p className="text-blue-300 text-sm mb-2">
                    Changes made here are committed directly to your GitHub repository and will trigger a rebuild.
                    It may take 2-3 minutes for changes to appear on your live portfolio.
                  </p>
                  <ul className="text-sm text-blue-300 space-y-1 list-disc list-inside">
                    <li>All changes are version controlled in Git</li>
                    <li>Your token expires after 8 hours for security</li>
                    <li>Only you (repository owner) can access this panel</li>
                  </ul>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
};

export default DashboardPage;
