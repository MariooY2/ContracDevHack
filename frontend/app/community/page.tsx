'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useAccount, useWalletClient } from 'wagmi';
import PostCard from '@/components/community/PostCard';
import CreatePostModal from '@/components/community/CreatePostModal';
import { CATEGORIES, buildLikeMessage, type PostWithCounts } from '@/lib/community';

export default function CommunityPage() {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();

  const [posts, setPosts] = useState<PostWithCounts[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<string>('all');
  const [sort, setSort] = useState<'recent' | 'popular'>('recent');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  const fetchPosts = useCallback(async (pageNum = 1, append = false) => {
    try {
      if (pageNum === 1) setLoading(true);
      const params = new URLSearchParams();
      if (category !== 'all') params.set('category', category);
      params.set('sort', sort);
      params.set('page', String(pageNum));
      if (address) params.set('wallet', address.toLowerCase());

      const res = await fetch(`/api/community/posts?${params}`);
      const data = await res.json();

      if (append) {
        setPosts((prev) => [...prev, ...data.posts]);
      } else {
        setPosts(data.posts);
      }
      setHasMore(data.hasMore);
      setPage(pageNum);
    } catch (err) {
      console.error('Failed to fetch posts:', err);
    } finally {
      setLoading(false);
    }
  }, [category, sort, address]);

  useEffect(() => { fetchPosts(1); }, [fetchPosts]);

  const handleLike = async (postId: string) => {
    if (!walletClient || !address) return;

    const post = posts.find((p) => p.id === postId);
    if (!post) return;

    // Optimistic update
    setPosts((prev) => prev.map((p) => p.id === postId ? {
      ...p,
      liked_by_user: !p.liked_by_user,
      like_count: p.liked_by_user ? p.like_count - 1 : p.like_count + 1,
    } : p));

    try {
      const timestamp = Date.now();
      const action = post.liked_by_user ? 'unlike' : 'like';
      const message = buildLikeMessage(postId, action, timestamp);
      const signature = await walletClient.signMessage({ message });

      const res = await fetch(`/api/community/posts/${postId}/like`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet_address: address, signature, timestamp }),
      });

      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      setPosts((prev) => prev.map((p) => p.id === postId ? { ...p, liked_by_user: data.liked, like_count: data.count } : p));
    } catch {
      // Revert
      setPosts((prev) => prev.map((p) => p.id === postId ? { ...p, liked_by_user: post.liked_by_user, like_count: post.like_count } : p));
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      {/* Hero */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="mb-8 text-center"
      >
        <h1 className="font-black tracking-tight mb-3" style={{ fontSize: 'var(--text-h1)', color: 'var(--text-primary)' }}>
          Community
        </h1>
        <p className="font-sans max-w-lg mx-auto" style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-body)' }}>
          Share strategies, discuss markets, and propose ideas. Sign with your wallet — no gas required.
        </p>
      </motion.div>

      {/* Controls */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-6"
      >
        {/* Category filter */}
        <div className="flex gap-1.5 flex-wrap flex-1">
          <button
            onClick={() => setCategory('all')}
            className="px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all"
            style={{
              background: category === 'all' ? 'rgba(41,115,255,0.12)' : 'rgba(255,255,255,0.03)',
              border: category === 'all' ? '1px solid rgba(41,115,255,0.3)' : '1px solid var(--border)',
              color: category === 'all' ? 'var(--accent-primary)' : 'var(--text-muted)',
            }}
          >
            All
          </button>
          {CATEGORIES.map((cat) => (
            <button
              key={cat.slug}
              onClick={() => setCategory(cat.slug)}
              className="px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all"
              style={{
                background: category === cat.slug ? `${cat.color}15` : 'rgba(255,255,255,0.03)',
                border: `1px solid ${category === cat.slug ? `${cat.color}35` : 'var(--border)'}`,
                color: category === cat.slug ? cat.color : 'var(--text-muted)',
              }}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Sort + New Post */}
        <div className="flex items-center gap-2">
          <div
            className="flex rounded-lg overflow-hidden"
            style={{ border: '1px solid var(--border)' }}
          >
            {(['recent', 'popular'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSort(s)}
                className="px-3 py-1.5 text-xs font-mono font-bold capitalize transition-all"
                style={{
                  background: sort === s ? 'rgba(41,115,255,0.1)' : 'transparent',
                  color: sort === s ? 'var(--accent-primary)' : 'var(--text-muted)',
                }}
              >
                {s}
              </button>
            ))}
          </div>

          <button
            onClick={() => setShowCreate(true)}
            disabled={!isConnected}
            className="px-4 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all"
            style={{
              background: isConnected ? 'var(--accent-primary)' : 'rgba(255,255,255,0.05)',
              color: isConnected ? '#fff' : 'var(--text-muted)',
              cursor: isConnected ? 'pointer' : 'not-allowed',
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 5v14M5 12h14" />
            </svg>
            New Post
          </button>
        </div>
      </motion.div>

      {/* Post list */}
      <div className="space-y-3">
        {loading ? (
          [1, 2, 3].map((i) => (
            <div
              key={i}
              className="rounded-2xl h-36 animate-pulse"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
            />
          ))
        ) : posts.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-16 rounded-2xl"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
          >
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" className="mx-auto mb-4">
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
            </svg>
            <p className="font-bold mb-1" style={{ color: 'var(--text-primary)' }}>No posts yet</p>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              {isConnected ? 'Be the first to start a discussion!' : 'Connect your wallet to start posting'}
            </p>
          </motion.div>
        ) : (
          posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              onClick={() => router.push(`/community/${post.id}`)}
              onLike={handleLike}
            />
          ))
        )}
      </div>

      {/* Load more */}
      {hasMore && !loading && (
        <div className="text-center mt-6">
          <button
            onClick={() => fetchPosts(page + 1, true)}
            className="px-6 py-2 rounded-xl font-mono text-xs font-bold transition-all"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
          >
            Load More
          </button>
        </div>
      )}

      {/* Create modal */}
      <CreatePostModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onSuccess={() => fetchPosts(1)}
      />
    </div>
  );
}
