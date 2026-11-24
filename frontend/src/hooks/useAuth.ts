'use client';

import { useState, useEffect, useCallback } from 'react';
import { User } from '../types';
import { getMe } from '../lib/api';

interface AuthState {
  user: User | null;
  loading: boolean;
  error: string | null;
}

export function useAuth(): AuthState & { logout: () => void } {
  const [state, setState] = useState<AuthState>({ user: null, loading: true, error: null });

  const fetchUser = useCallback(async () => {
    const token = localStorage.getItem('auth_token');
    if (!token) {
      setState({ user: null, loading: false, error: null });
      return;
    }
    try {
      const user = await getMe();
      setState({ user, loading: false, error: null });
    } catch {
      localStorage.removeItem('auth_token');
      setState({ user: null, loading: false, error: null });
    }
  }, []);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  const logout = () => {
    localStorage.removeItem('auth_token');
    setState({ user: null, loading: false, error: null });
    window.location.href = '/login';
  };

  return { ...state, logout };
}
