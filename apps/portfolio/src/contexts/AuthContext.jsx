import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const restoreSession = async () => {
      try {
        const response = await fetch('/api/auth/session', {
          credentials: 'same-origin',
          headers: { Accept: 'application/json' }
        });

        if (response.ok) {
          if (!response.headers.get('content-type')?.includes('application/json')) {
            throw new Error('GitHub sign-in requires the server API. Use the Node server or a deployment with API support.');
          }
          const payload = await response.json();
          setUser(payload.user);
        } else if (response.status !== 401 && response.status !== 404) {
          throw new Error('Unable to verify the admin session');
        }
      } catch (sessionError) {
        setError(sessionError.message);
      } finally {
        setLoading(false);
      }
    };

    const oauthError = new URLSearchParams(window.location.search).get('error');
    if (oauthError) setError(`GitHub authentication failed: ${oauthError}`);

    restoreSession();
  }, []);

  const login = (returnTo) => {
    window.location.assign(returnTo === '/orin' ? '/api/auth/login?returnTo=%2Forin' : '/api/auth/login');
  };

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'same-origin'
      });
    } finally {
      setUser(null);
    }
  };

  const value = useMemo(() => ({
    user,
    loading,
    error,
    login,
    logout,
    isAuthenticated: Boolean(user)
  }), [user, loading, error]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default AuthContext;
