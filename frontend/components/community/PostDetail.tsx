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
    // Optimistic update
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
    } catch (err: any) {
      // Revert optimistic update
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
      <div className="max-w-3xl mx-auto space-y-4">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="rounded-2xl h-24 animate-pulse"
            style={{ background: 'var(--bg-card)' }}
          />
        ))}
      </div>
    );
  }

  if (!post) {
    return (
      <div className="max-w-3xl mx-auto text-center py-20">
        <p style={{ color: 'var(--text-muted)' }}>Post not found</p>
        <Link href="/community" className="text-sm mt-3 inline-block" style={{ color: 'var(--accent-primary)' }}>
          Back to Community
        </Link>
      </div>
    );
  }

  const cat = getCategoryMeta(post.category);

  return (
    <div className="max-w-3xl mx-auto">
      {/* Back link */}
      <Link
        href="/community"
        className="inline-flex items-center gap-1.5 mb-6 font-mono text-xs transition-colors hover:opacity-80"
        style={{ color: 'var(--text-muted)' }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
        Back to Community
      </Link>

      {/* Post */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl p-6 mb-6"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
      >
        {/* Meta */}
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <div className="flex items-center gap-1.5">
            <div
              className="w-6 h-6 rounded-full flex items-center justify-center"
              style={{ background: 'rgba(41,115,255,0.1)' }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth="2.5">
                <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </div>
            <span className="font-mono text-xs" style={{ color: 'var(--accent-primary)' }}>
              {truncateAddress(post.wallet_address)}
            </span>
          </div>

          <span
            className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider"
            style={{ background: `${cat.color}15`, color: cat.color, border: `1px solid ${cat.color}25` }}
          >
            {cat.label}
          </span>

          <span className="font-mono text-[10px]" style={{ color: 'var(--text-muted)' }}>
            {timeAgo(post.created_at)}
          </span>
        </div>

        {/* Title */}
        <h1 className="font-black text-xl mb-4" style={{ color: 'var(--text-primary)' }}>
          {post.title}
        </h1>

        {/* Content */}
        <div
          className="leading-relaxed whitespace-pre-wrap mb-6"
          style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-body)' }}
        >
          {post.content}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-4 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
          <button
            onClick={handleLike}
            disabled={!address || liking}
            className="flex items-center gap-1.5 transition-colors"
            style={{
              color: post.liked_by_user ? '#ef4444' : 'var(--text-muted)',
              cursor: address ? 'pointer' : 'not-allowed',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill={post.liked_by_user ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
              <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
            </svg>
            <span className="font-mono text-sm">{post.like_count} {post.like_count === 1 ? 'like' : 'likes'}</span>
          </button>

          <div className="flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
            </svg>
            <span className="font-mono text-sm">{post.comment_count}</span>
          </div>
        </div>
      </motion.div>

      {/* Comments */}
      <CommentSection postId={postId} comments={comments} onCommentAdded={handleCommentAdded} />
    </div>
  );
}
