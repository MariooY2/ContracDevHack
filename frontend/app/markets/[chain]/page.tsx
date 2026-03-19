'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function ChainRedirect() {
  const params = useParams();
  const router = useRouter();
  const chain = params.chain as string;

  useEffect(() => {
    router.replace(`/markets?chain=${chain}`);
  }, [chain, router]);

  return null;
}
