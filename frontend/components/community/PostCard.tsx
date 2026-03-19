'use client';

import { motion } from 'framer-motion';
import { PostWithCounts, getCategoryMeta, truncateAddress, timeAgo } from '@/lib/community';

interface PostCardProps {
  post: PostWithCounts;
  onClick: () => void;
  onLike: (postId: string) => void;
}

export default function PostCard({ post, onClick, onLike }: PostCardProps) {
  const cat = getCategoryMeta(post.category);
  const preview = post.content.length > 160 ? post.content.slice(0, 160) + '...' : post.content;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl p-5 cursor-pointer transition-all duration-200 group"
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
      }}
      whileHover={{ borderColor: 'rgba(41,115,255,0.2)' }}
      onClick={onClick}
    >
      {/* Header: address + category + time */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <div className="flex items-center gap-1.5">
          <div
            className="w-5 h-5 rounded-full flex items-center justify-center"
            style={{ background: 'rgba(41,115,255,0.1)' }}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth="2.5">
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

        <span className="ml-auto text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
          {timeAgo(post.created_at)}
        </span>
      </div>

      {/* Title */}
      <h3
        className="font-bold mb-2 group-hover:text-[var(--accent-primary)] transition-colors"
        style={{ color: 'var(--text-primary)', fontSize: 'var(--text-body)' }}
      >
        {post.title}
      </h3>

      {/* Content preview */}
      <p className="mb-4 leading-relaxed" style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
        {preview}
      </p>

      {/* Footer: likes + comments */}
      <div className="flex items-center gap-4">
        <button
          className="flex items-center gap-1.5 transition-colors"
          style={{ color: post.liked_by_user ? '#ef4444' : 'var(--text-muted)' }}
          onClick={(e) => { e.stopPropagation(); onLike(post.id); }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill={post.liked_by_user ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
            <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
          </svg>
          <span className="font-mono text-xs">{post.like_count}</span>
        </button>

        <div className="flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
          </svg>
          <span className="font-mono text-xs">{post.comment_count}</span>
        </div>
      </div>
    </motion.div>
  );
}
