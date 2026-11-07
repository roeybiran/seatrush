'use client';

import { useRouter } from 'next/navigation';
import { UsernameForm } from '@/components/SessionProvider';

export default function Login() {
  const router = useRouter();

  return (
    <main id="main" className="page-width inner-page">
      <UsernameForm
        onComplete={() => {
          const next = new URLSearchParams(window.location.search).get('next');
          router.replace(
            next &&
              next.startsWith('/') &&
              !next.startsWith('//') &&
              !next.includes('\\')
              ? next
              : '/events',
          );
        }}
      />
    </main>
  );
}
