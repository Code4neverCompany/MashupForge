'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';

export function useAuth() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const auth = localStorage.getItem('mashup_auth');
    if (auth === 'true') {
      setIsAuthenticated(true);
    } else {
      setIsAuthenticated(false);
      if (pathname !== '/login') {
        router.push('/login');
      }
    }
  }, [pathname, router]);

  const logout = () => {
    localStorage.removeItem('mashup_auth');
    setIsAuthenticated(false);
    router.push('/login');
  };

  return { isAuthenticated, logout };
}
