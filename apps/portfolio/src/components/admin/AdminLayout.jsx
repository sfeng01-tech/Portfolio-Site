import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import {
  LayoutDashboard,
  BookOpen,
  Library,
  FileText,
  LogOut,
  Menu,
  X,
  User
} from 'lucide-react';

const AdminLayout = ({ children }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/admin/login');
  };

  const navigationItems = [
    { name: 'Dashboard', path: '/admin', icon: LayoutDashboard },
    { name: 'Blog', path: '/admin/blog', icon: BookOpen },
    { name: 'Books', path: '/admin/books', icon: Library },
    { name: 'Papers', path: '/admin/papers', icon: FileText },
  ];

  return (
    <div className="min-h-screen bg-dark-bg flex">
      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-30 w-64 bg-dark-surface border-r border-dark-border transform transition-transform duration-200 ease-in-out lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="p-6 border-b border-dark-border">
            <div className="flex items-center justify-between">
              <h1 className="text-xl font-bold text-dark-text-primary">
                Admin Panel
              </h1>
              <button
                onClick={() => setSidebarOpen(false)}
                className="lg:hidden text-dark-text-secondary hover:text-dark-text-primary"
              >
                <X size={24} />
              </button>
            </div>

            {/* User Info */}
            {user && (
              <div className="mt-4 flex items-center gap-3">
                {user.avatar_url ? (
                  <img
                    src={user.avatar_url}
                    alt={user.name || user.login}
                    className="w-10 h-10 rounded-full border border-dark-border"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-dark-bg border border-dark-border flex items-center justify-center">
                    <User size={20} className="text-dark-text-muted" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-dark-text-primary truncate">
                    {user.name || user.login}
                  </p>
                  <p className="text-xs text-dark-text-muted truncate">
                    @{user.login}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
            {navigationItems.map((item) => {
              const Icon = item.icon;
              const isActive = window.location.pathname === item.path;

              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setSidebarOpen(false)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-dark-text-primary text-dark-bg'
                      : 'text-dark-text-secondary hover:bg-dark-bg hover:text-dark-text-primary'
                  }`}
                >
                  <Icon size={20} />
                  {item.name}
                </Link>
              );
            })}
          </nav>

          {/* Logout Button */}
          <div className="p-4 border-t border-dark-border">
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-dark-text-secondary hover:bg-dark-bg hover:text-red-400 transition-colors"
            >
              <LogOut size={20} />
              Logout
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile Header */}
        <header className="lg:hidden bg-dark-surface border-b border-dark-border px-4 py-4">
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-dark-text-primary hover:text-dark-text-secondary"
          >
            <Menu size={24} />
          </button>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
