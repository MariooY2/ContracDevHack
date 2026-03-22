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
  const preview = post.content.length > 180 ? post.content.slice(0, 180) + '...' : post.content;

  return (
    <motion.div
      className="rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 group"
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
      }}
      whileHover={{ borderColor: `${cat.color}25`, boxShadow: `0 0 40px ${cat.color}06` }}
      onClick={onClick}
    >
      <div className="p-5">
        {/* Header: avatar + address + category + time */}
        <div className="flex items-center gap-2.5 mb-3">
          {/* Avatar */}
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
            style={{ background: `${cat.color}10`, border: `1px solid ${cat.color}20` }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={cat.color} strokeWidth="2">
              <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold" style={{ color: 'var(--accent-primary)' }}>
                {truncateAddress(post.wallet_address)}
              </span>
              <span
                className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold uppercase tracking-wider"
                style={{ background: `${cat.color}12`, color: cat.color, border: `1px solid ${cat.color}20` }}
              >
                {cat.label}
              </span>
            </div>
          </div>

          <span className="text-[10px] font-mono shrink-0" style={{ color: 'var(--text-muted)' }}>
            {timeAgo(post.created_at)}
          </span>
        </div>

        {/* Title */}
        <h3
          className="font-bold mb-2 group-hover:text-[var(--accent-primary)] transition-colors duration-200"
          style={{ color: 'var(--text-primary)', fontSize: 'var(--text-body)' }}
        >
          {post.title}
        </h3>

        {/* Content preview */}
        <p className="mb-4 leading-relaxed" style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
          {preview}
        </p>

        {/* Footer: likes + comments + read more */}
        <div className="flex items-center gap-4 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
          <button
            className="flex items-center gap-1.5 transition-all duration-200 group/like"
            style={{ color: post.liked_by_user ? '#ef4444' : 'var(--text-muted)' }}
            onClick={(e) => { e.stopPropagation(); onLike(post.id); }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill={post.liked_by_user ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
              <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
            </svg>
            <span className="font-mono text-xs font-bold">{post.like_count}</span>
          </button>

          <div className="flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
            </svg>
            <span className="font-mono text-xs font-bold">{post.comment_count}</span>
          </div>

          <span className="ml-auto text-[10px] font-mono font-bold opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: 'var(--accent-primary)' }}>
            Read more →
          </span>
        </div>
      </div>
    </motion.div>
  );
}
