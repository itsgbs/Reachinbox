'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';

export default function AuthCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const token = searchParams.get('token');
    if (token) {
      localStorage.setItem('auth_token', token);
      router.replace('/dashboard');
    } else {
      router.replace('/login?error=no_token');
    }
  }, [router, searchParams]);

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center">
      <div className="text-center">
        <Loader2 className="w-8 h-8 animate-spin text-brand-500 mx-auto mb-3" />
        <p className="text-gray-400">Signing you in...</p>
      </div>
    </div>
  );
}
