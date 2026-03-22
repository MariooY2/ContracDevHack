'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useAccount, useWalletClient } from 'wagmi';
import Link from 'next/link';
import {
  PostWithCounts, CommunityComment,
  getCategoryMeta, truncateAddress, timeAgo, buildLikeMessage,
} from '@/lib/community';
import CommentSection from './CommentSection';

interface PostDetailProps {
  postId: string;
}

export default function PostDetail({ postId }: PostDetailProps) {
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();

  const [post, setPost] = useState<PostWithCounts | null>(null);
  const [comments, setComments] = useState<CommunityComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [liking, setLiking] = useState(false);

  const fetchPost = useCallback(async () => {
    try {
      const wallet = address ? `&wallet=${address.toLowerCase()}` : '';
      const res = await fetch(`/api/community/posts/${postId}?${wallet}`);
      if (!res.ok) throw new Error('Failed to load post');
      const data = await res.json();
      setPost(data.post);
      setComments(data.comments);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [postId, address]);

  useEffect(() => { fetchPost(); }, [fetchPost]);

  const handleLike = async () => {
    if (!walletClient || !address || !post || liking) return;

    const prevPost = { ...post };
    setPost({
      ...post,
      liked_by_user: !post.liked_by_user,
      like_count: post.liked_by_user ? post.like_count - 1 : post.like_count + 1,
    });

    try {
      setLiking(true);
      const timestamp = Date.now();
      const action = post.liked_by_user ? 'unlike' : 'like';
      const message = buildLikeMessage(postId, action, timestamp);
      const signature = await walletClient.signMessage({ message });

      const res = await fetch(`/api/community/posts/${postId}/like`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet_address: address, signature, timestamp }),
      });

      if (!res.ok) throw new Error('Failed to toggle like');

      const data = await res.json();
      setPost((prev) => prev ? { ...prev, liked_by_user: data.liked, like_count: data.count } : prev);
    } catch {
      setPost(prevPost);
    } finally {
      setLiking(false);
    }
  };

  const handleCommentAdded = (comment: CommunityComment) => {
    setComments((prev) => [...prev, comment]);
    setPost((prev) => prev ? { ...prev, comment_count: prev.comment_count + 1 } : prev);
  };

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto space-y-4 pt-4">
        <div className="w-32 h-4 rounded skeleton" />
        <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <div className="p-6 space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full skeleton" />
              <div className="w-24 h-3 rounded skeleton" />
              <div className="w-16 h-3 rounded-full skeleton" />
            </div>
            <div className="w-2/3 h-6 rounded skeleton" />
            <div className="space-y-2">
              <div className="w-full h-3 rounded skeleton" />
              <div className="w-full h-3 rounded skeleton" />
              <div className="w-1/2 h-3 rounded skeleton" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="max-w-3xl mx-auto text-center py-24">
        <div
          className="w-16 h-16 rounded-2xl mx-auto flex items-center justify-center mb-5"
          style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)' }}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="1.5">
            <circle cx="12" cy="12" r="10" />
            <path d="M15 9l-6 6M9 9l6 6" />
          </svg>
        </div>
        <p className="font-bold text-lg mb-2" style={{ color: 'var(--text-primary)' }}>Post not found</p>
        <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>This post may have been removed or doesn't exist.</p>
        <Link
          href="/community"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs transition-all"
          style={{ background: 'rgba(41,115,255,0.1)', color: 'var(--accent-primary)', border: '1px solid rgba(41,115,255,0.2)' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Back to Community
        </Link>
      </div>
    );
  }

  const cat = getCategoryMeta(post.category);

  return (
    <div className="max-w-3xl mx-auto">
      {/* Back link */}
      <motion.div
        initial={{ opacity: 0, x: -8 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.3 }}
      >
        <Link
          href="/community"
          className="inline-flex items-center gap-1.5 mb-6 font-mono text-xs font-bold transition-all hover:gap-2.5"
          style={{ color: 'var(--text-muted)' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Back to Community
        </Link>
      </motion.div>

      {/* Post */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="rounded-2xl overflow-hidden mb-8"
        style={{ background: 'var(--bg-card)', border: `1px solid ${cat.color}20` }}
      >
        {/* Category accent bar */}
        <div className="h-0.5" style={{ background: `linear-gradient(90deg, ${cat.color}, transparent)` }} />

        <div className="p-6">
          {/* Meta */}
          <div className="flex items-center gap-3 mb-5">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
              style={{ background: `${cat.color}10`, border: `1px solid ${cat.color}20` }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={cat.color} strokeWidth="2">
                <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </div>

            <div className="flex-1">
              <span className="font-mono text-sm font-bold block" style={{ color: 'var(--accent-primary)' }}>
                {truncateAddress(post.wallet_address)}
              </span>
              <div className="flex items-center gap-2 mt-0.5">
                <span
                  className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold uppercase tracking-wider"
                  style={{ background: `${cat.color}12`, color: cat.color, border: `1px solid ${cat.color}20` }}
                >
                  {cat.label}
                </span>
                <span className="font-mono text-[10px]" style={{ color: 'var(--text-muted)' }}>
                  {timeAgo(post.created_at)}
                </span>
              </div>
            </div>
          </div>

          {/* Title */}
          <h1
            className="font-black mb-5"
            style={{ color: 'var(--text-primary)', fontSize: 'clamp(1.25rem, 3vw, 1.5rem)', lineHeight: 1.3 }}
          >
            {post.title}
          </h1>

          {/* Content */}
          <div
            className="leading-relaxed whitespace-pre-wrap mb-6"
            style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-body)', lineHeight: 1.7 }}
          >
            {post.content}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-4 pt-5" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <motion.button
              onClick={handleLike}
              disabled={!address || liking}
              className="flex items-center gap-2 px-4 py-2 rounded-xl transition-all"
              style={{
                background: post.liked_by_user ? 'rgba(239,68,68,0.08)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${post.liked_by_user ? 'rgba(239,68,68,0.2)' : 'var(--border)'}`,
                color: post.liked_by_user ? '#ef4444' : 'var(--text-muted)',
                cursor: address ? 'pointer' : 'not-allowed',
              }}
              whileHover={address ? { scale: 1.02 } : {}}
              whileTap={address ? { scale: 0.98 } : {}}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill={post.liked_by_user ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
              </svg>
              <span className="font-mono text-xs font-bold">{post.like_count} {post.like_count === 1 ? 'like' : 'likes'}</span>
            </motion.button>

            <div
              className="flex items-center gap-2 px-4 py-2 rounded-xl"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
              </svg>
              <span className="font-mono text-xs font-bold">{post.comment_count} comments</span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Comments */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.4 }}
      >
        <CommentSection postId={postId} comments={comments} onCommentAdded={handleCommentAdded} />
      </motion.div>
    </div>
  );
}
