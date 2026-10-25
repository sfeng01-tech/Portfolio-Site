import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Github, Lock, ShieldCheck } from 'lucide-react';

const LoginPage = () => {
  const { login, isAuthenticated, error } = useAuth();
  const navigate = useNavigate();

  // Redirect to admin dashboard if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/admin');
    }
  }, [isAuthenticated, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-dark-bg px-4">
      <div className="max-w-md w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-dark-surface border border-dark-border rounded-full mb-4">
            <Lock className="text-dark-text-primary" size={32} />
          </div>
          <h1 className="text-3xl font-bold text-dark-text-primary mb-2">
            Admin Panel
          </h1>
          <p className="text-dark-text-secondary">
            Sign in with GitHub to manage your portfolio
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-dark-surface border border-dark-border rounded-lg p-8">
          {/* Error Message */}
          {error && (
            <div className="mb-6 p-4 bg-red-900/20 border border-red-500/50 rounded-lg text-red-400 text-sm">
              <strong>Authentication Error:</strong> {error}
            </div>
          )}

          {/* GitHub Login Button */}
          <button
            onClick={login}
            className="w-full flex items-center justify-center gap-3 px-6 py-3 bg-dark-text-primary text-dark-bg font-medium rounded-lg hover:bg-dark-text-secondary transition-colors"
          >
            <Github size={20} />
            Sign in with GitHub
          </button>

          {/* Info Section */}
          <div className="mt-8 pt-8 border-t border-dark-border">
            <h3 className="text-sm font-semibold text-dark-text-primary mb-4 flex items-center gap-2">
              <ShieldCheck size={16} />
              Security Information
            </h3>
            <ul className="space-y-2 text-sm text-dark-text-secondary">
              <li className="flex items-start gap-2">
                <span className="text-dark-text-muted mt-1">•</span>
                <span>Only the repository owner can access this admin panel</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-dark-text-muted mt-1">•</span>
                <span>Your GitHub token is stored securely in your browser</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-dark-text-muted mt-1">•</span>
                <span>Changes are committed directly to your GitHub repository</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-dark-text-muted mt-1">•</span>
                <span>Token expires after 8 hours for security</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 text-center text-sm text-dark-text-muted">
          <p>
            Need help?{' '}
            <a
              href="https://github.com/sfeng01-tech/Portfolio-Site"
              target="_blank"
              rel="noopener noreferrer"
              className="text-dark-text-primary hover:text-dark-text-secondary underline"
            >
              View Documentation
            </a>
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
