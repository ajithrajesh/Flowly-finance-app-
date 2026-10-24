import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { io } from 'socket.io-client';
import { authAPI, notificationsAPI, SOCKET_BASE } from '../services/api';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [account, setAccount] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('flowly_token') || null);
  const [loading, setLoading] = useState(true);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState('login'); // 'login' | 'register' | 'forgot_mpin'
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchProfile = async () => {
    if (!token) {
      setUser(null);
      setAccount(null);
      setUnreadCount(0);
      setLoading(false);
      return;
    }
    try {
      const res = await authAPI.getMe();
      if (res.data && res.data.user) {
        setUser(res.data.user);
        setAccount(res.data.account || null);
      } else {
        setUser(null);
        setAccount(null);
      }
    } catch (err) {
      console.error('Failed to fetch user profile:', err);
      // Clear token if invalid or expired
      if (err.response && (err.response.status === 401 || err.response.status === 403)) {
        logout();
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchUnreadCount = useCallback(async () => {
    if (!token) {
      setUnreadCount(0);
      return;
    }
    try {
      const res = await notificationsAPI.getMyNotifications({ limit: 1 });
      if (res.data) {
        const raw = res.data;
        const count = raw?.data?.unreadCount ?? raw?.unreadCount ?? 0;
        setUnreadCount(count);
      } else {
        setUnreadCount(0);
      }
    } catch (err) {
      // Non-critical notification count fetch error, default to 0
      setUnreadCount(0);
    }
  }, [token]);

  useEffect(() => {
    fetchProfile();
    fetchUnreadCount();
  }, [token, fetchUnreadCount]);

  // Real-time socket connection for balance updates, account events, and live notifications
  useEffect(() => {
    if (!token) return;
    let socket;
    try {
      socket = io(SOCKET_BASE, { auth: { token } });

      socket.on('connect', () => {
        socket.emit('get_unread_count', (res) => {
          if (res?.ok && typeof res.unreadCount === 'number') {
            setUnreadCount(res.unreadCount);
          }
        });
      });

      socket.on('account:update', (data) => {
        fetchProfile();
        window.dispatchEvent(new CustomEvent('flowly:account-update', { detail: data }));
      });

      socket.on('unread_count', (data) => {
        if (typeof data?.unreadCount === 'number') {
          setUnreadCount(data.unreadCount);
        }
      });

      socket.on('new_notification', (data) => {
        setUnreadCount((prev) => prev + 1);
        window.dispatchEvent(new CustomEvent('flowly:new-notification', { detail: data }));
      });

      socket.on('notification_read', (data) => {
        if (typeof data?.unreadCount === 'number') {
          setUnreadCount(data.unreadCount);
        }
        window.dispatchEvent(new CustomEvent('flowly:notification-read', { detail: data }));
      });

      socket.on('notifications_all_read', (data) => {
        setUnreadCount(0);
        window.dispatchEvent(new CustomEvent('flowly:notifications-all-read', { detail: data }));
      });
    } catch (err) {
      console.error('Socket connection error:', err);
    }

    return () => {
      if (socket) socket.disconnect();
    };
  }, [token]);

  const openAuthModal = (mode = 'login') => {
    setAuthMode(mode);
    setAuthModalOpen(true);
  };

  const closeAuthModal = () => {
    setAuthModalOpen(false);
  };

  const handleAuthSuccess = (tokenData, userData, accountData) => {
    localStorage.setItem('flowly_token', tokenData);
    setToken(tokenData);
    setUser(userData);
    setAccount(accountData || null);
    closeAuthModal();
  };

  const login = async (credentials) => {
    const res = await authAPI.login(credentials);
    const { token: newToken, user: newUser, account: newAccount } = res.data;
    handleAuthSuccess(newToken, newUser, newAccount);
    return res.data;
  };

  const register = async (userData) => {
    const res = await authAPI.register(userData);
    const { token: newToken, user: newUser, account: newAccount } = res.data;
    handleAuthSuccess(newToken, newUser, newAccount);
    return res.data;
  };

  const googleAuth = async (googleData) => {
    const res = await authAPI.googleAuth(googleData);
    const { token: newToken, user: newUser, account: newAccount } = res.data;
    handleAuthSuccess(newToken, newUser, newAccount);
    return res.data;
  };

  const logout = () => {
    localStorage.removeItem('flowly_token');
    setToken(null);
    setUser(null);
    setAccount(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        account,
        token,
        loading,
        isAuthenticated: !!token && !!user,
        authModalOpen,
        authMode,
        openAuthModal,
        closeAuthModal,
        setAuthMode,
        login,
        register,
        googleAuth,
        logout,
        refreshProfile: fetchProfile,
        unreadCount,
        setUnreadCount,
        refreshUnreadCount: fetchUnreadCount,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
