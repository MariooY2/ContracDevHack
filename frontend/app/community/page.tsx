'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useAccount, useWalletClient } from 'wagmi';
import PostCard from '@/components/community/PostCard';
import CreatePostModal from '@/components/community/CreatePostModal';
import { CATEGORIES, buildLikeMessage, type PostWithCounts } from '@/lib/community';

/* ─── Stats Bar ────────────────────────────────────────── */
/* ─── Page ─────────────────────────────────────────────── */
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

  const allCategories = [
    { slug: 'all', label: 'All Posts', color: '#2973ff' },
    ...CATEGORIES,
  ];

  return (
    <div className="max-w-4xl mx-auto">
      {/* ═══════════════════════════════════════════════════════
          HERO
          ═══════════════════════════════════════════════════════ */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="mb-8 relative"
      >
        {/* Background glow */}
        <div
          className="absolute -top-20 left-1/2 -translate-x-1/2 w-[500px] h-[300px] pointer-events-none"
          style={{ background: 'radial-gradient(ellipse at center, rgba(167,139,250,0.06) 0%, transparent 70%)' }}
        />

        <div className="relative text-center pt-4">
          <h1
            className="font-black tracking-tight mb-3"
            style={{ fontSize: 'clamp(1.75rem, 4vw, 2.5rem)', color: 'var(--text-primary)', lineHeight: 1.15 }}
          >
            VOLT{' '}
            <span style={{ color: '#a78bfa' }}>Community</span>
          </h1>
          <p className="font-sans max-w-xl mx-auto mb-6" style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-body)', lineHeight: 1.6 }}>
            Share strategies, discuss markets, and propose ideas. All posts are wallet-signed — no gas required, full accountability.
          </p>

          {/* New Post CTA */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <motion.button
              onClick={() => setShowCreate(true)}
              disabled={!isConnected}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm transition-all"
              style={{
                background: isConnected ? 'var(--accent-primary)' : 'rgba(255,255,255,0.05)',
                color: isConnected ? '#fff' : 'var(--text-muted)',
                cursor: isConnected ? 'pointer' : 'not-allowed',
              }}
              whileHover={isConnected ? { scale: 1.02 } : {}}
              whileTap={isConnected ? { scale: 0.98 } : {}}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M12 5v14M5 12h14" />
              </svg>
              {isConnected ? 'Start a Discussion' : 'Connect Wallet to Post'}
            </motion.button>
            {!isConnected && (
              <p className="font-mono text-[10px] mt-2" style={{ color: 'var(--text-muted)' }}>
                Wallet signature required — free, no gas
              </p>
            )}
          </motion.div>
        </div>
      </motion.div>

      {/* ═══════════════════════════════════════════════════════
          CONTROLS (Sticky)
          ═══════════════════════════════════════════════════════ */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="mb-6 sticky top-0 z-20 -mx-4 px-4 py-3"
        style={{ background: 'linear-gradient(to bottom, rgba(9,9,9,0.97) 70%, transparent)' }}
      >
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          {/* Category filter */}
          <div className="flex gap-1.5 flex-wrap flex-1">
            {allCategories.map((cat) => {
              const isActive = category === cat.slug;
              return (
                <motion.button
                  key={cat.slug}
                  onClick={() => setCategory(cat.slug)}
                  className="px-3 py-2 rounded-xl text-xs font-mono font-bold transition-all"
                  style={{
                    background: isActive ? `${cat.color}12` : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${isActive ? `${cat.color}30` : 'var(--border)'}`,
                    color: isActive ? cat.color : 'var(--text-muted)',
                  }}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  {cat.label}
                </motion.button>
              );
            })}
          </div>

          {/* Sort toggle */}
          <div
            className="flex rounded-xl overflow-hidden shrink-0"
            style={{ border: '1px solid var(--border)' }}
          >
            {(['recent', 'popular'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSort(s)}
                className="px-4 py-2 text-xs font-mono font-bold capitalize transition-all"
                style={{
                  background: sort === s ? 'rgba(41,115,255,0.1)' : 'transparent',
                  color: sort === s ? 'var(--accent-primary)' : 'var(--text-muted)',
                }}
              >
                {s === 'recent' ? 'Latest' : 'Top'}
              </button>
            ))}
          </div>
        </div>
      </motion.div>

      {/* ═══════════════════════════════════════════════════════
          POST LIST
          ═══════════════════════════════════════════════════════ */}
      <div className="space-y-3">
        {loading ? (
          [1, 2, 3, 4].map((i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: i * 0.08 }}
              className="rounded-2xl overflow-hidden"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
            >
              <div className="p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full skeleton" />
                  <div className="w-24 h-3 rounded skeleton" />
                  <div className="w-16 h-3 rounded-full skeleton" />
                </div>
                <div className="w-3/4 h-4 rounded skeleton" />
                <div className="space-y-1.5">
                  <div className="w-full h-3 rounded skeleton" />
                  <div className="w-2/3 h-3 rounded skeleton" />
                </div>
                <div className="flex gap-4 pt-2">
                  <div className="w-12 h-3 rounded skeleton" />
                  <div className="w-12 h-3 rounded skeleton" />
                </div>
              </div>
            </motion.div>
          ))
        ) : posts.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center py-20 rounded-2xl"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
          >
            <div
              className="w-16 h-16 rounded-2xl mx-auto flex items-center justify-center mb-5"
              style={{ background: 'rgba(167,139,250,0.06)', border: '1px solid rgba(167,139,250,0.15)' }}
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="1.5">
                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
              </svg>
            </div>
            <p className="font-bold text-lg mb-2" style={{ color: 'var(--text-primary)' }}>No posts yet</p>
            <p className="text-sm max-w-xs mx-auto mb-6" style={{ color: 'var(--text-muted)' }}>
              {isConnected
                ? 'Be the first to start a discussion and build the VOLT community.'
                : 'Connect your wallet to start posting and join the conversation.'}
            </p>
            {isConnected && (
              <button
                onClick={() => setShowCreate(true)}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs transition-all"
                style={{ background: 'var(--accent-primary)', color: '#fff' }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                Create First Post
              </button>
            )}
          </motion.div>
        ) : (
          <AnimatePresence mode="popLayout">
            {posts.map((post, i) => (
              <motion.div
                key={post.id}
                layout
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ delay: i * 0.04, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              >
                <PostCard
                  post={post}
                  onClick={() => router.push(`/community/${post.id}`)}
                  onLike={handleLike}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════
          LOAD MORE
          ═══════════════════════════════════════════════════════ */}
      {hasMore && !loading && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center mt-8"
        >
          <motion.button
            onClick={() => fetchPosts(page + 1, true)}
            className="px-8 py-3 rounded-xl font-mono text-xs font-bold transition-all"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
            whileHover={{ scale: 1.02, borderColor: 'rgba(41,115,255,0.3)' }}
            whileTap={{ scale: 0.98 }}
          >
            Load More Posts
          </motion.button>
        </motion.div>
      )}

      {/* ═══════════════════════════════════════════════════════
          CREATE MODAL
          ═══════════════════════════════════════════════════════ */}
      <CreatePostModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onSuccess={() => fetchPosts(1)}
      />
    </div>
  );
}
