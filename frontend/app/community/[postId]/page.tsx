'use client';

import { useParams } from 'next/navigation';
import PostDetail from '@/components/community/PostDetail';

export default function PostDetailPage() {
  const params = useParams();
  const postId = params.postId as string;

  return (
    <div className="min-h-[calc(100vh-140px)]">
      <PostDetail postId={postId} />
    </div>
  );
}
