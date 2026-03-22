'use client';

import { useState } from 'react';
import { useAccount, useWalletClient } from 'wagmi';
import { motion, AnimatePresence } from 'framer-motion';
import { CommunityComment, truncateAddress, timeAgo, buildCommentMessage } from '@/lib/community';

interface CommentSectionProps {
  postId: string;
  comments: CommunityComment[];
  onCommentAdded: (comment: CommunityComment) => void;
}

export default function CommentSection({ postId, comments, onCommentAdded }: CommentSectionProps) {
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();

  const [content, setContent] = useState('');
  const [status, setStatus] = useState<'idle' | 'signing' | 'posting'>('idle');
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!walletClient || !address || !content.trim()) return;

    try {
      setStatus('signing');
      setError('');

      const timestamp = Date.now();
      const message = buildCommentMessage(postId, timestamp);
      const signature = await walletClient.signMessage({ message });

      setStatus('posting');

      const res = await fetch(`/api/community/posts/${postId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet_address: address, content, signature, timestamp }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to add comment');
      }

      const { comment } = await res.json();
      onCommentAdded(comment);
      setContent('');
      setStatus('idle');
    } catch (err: any) {
      if (err?.message?.includes('User rejected') || err?.message?.includes('denied')) {
        setStatus('idle');
        return;
      }
      setError(err.message || 'Something went wrong');
      setStatus('idle');
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{ background: 'rgba(167,139,250,0.06)', border: '1px solid rgba(167,139,250,0.15)' }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2">
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
          </svg>
        </div>
        <div>
          <h3 className="font-bold" style={{ color: 'var(--text-primary)', fontSize: 'var(--text-body)' }}>
            Discussion
          </h3>
          <p className="font-mono text-[10px]" style={{ color: 'var(--text-muted)' }}>
            {comments.length} comment{comments.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* Add comment (top position for better UX) */}
      {isConnected ? (
        <div
          className="rounded-2xl overflow-hidden"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
        >
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Share your thoughts..."
            rows={3}
            maxLength={5000}
            className="w-full px-5 py-4 text-sm outline-none resize-none bg-transparent"
            style={{ color: 'var(--text-primary)' }}
          />
          {error && (
            <div className="px-5 pb-2">
              <p className="text-xs rounded-lg px-3 py-1.5" style={{ color: '#ef4444', background: 'rgba(239,68,68,0.06)' }}>
                {error}
              </p>
            </div>
          )}
          <div className="flex items-center justify-between px-5 py-3" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
            <p className="font-mono text-[10px]" style={{ color: 'var(--text-muted)' }}>
              Free — sign with wallet
            </p>
            <motion.button
              onClick={handleSubmit}
              disabled={!content.trim() || status !== 'idle'}
              className="px-5 py-2 rounded-xl font-bold text-xs transition-all flex items-center gap-1.5"
              style={{
                background: content.trim() && status === 'idle' ? 'var(--accent-primary)' : 'rgba(255,255,255,0.05)',
                color: content.trim() && status === 'idle' ? '#fff' : 'var(--text-muted)',
                cursor: content.trim() && status === 'idle' ? 'pointer' : 'not-allowed',
              }}
              whileHover={content.trim() && status === 'idle' ? { scale: 1.02 } : {}}
              whileTap={content.trim() && status === 'idle' ? { scale: 0.98 } : {}}
            >
              {status === 'signing' ? (
                <>
                  <svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                  </svg>
                  Signing...
                </>
              ) : status === 'posting' ? 'Posting...' : 'Reply'}
            </motion.button>
          </div>
        </div>
      ) : (
        <div
          className="text-center py-6 rounded-2xl"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" className="mx-auto mb-2">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0110 0v4" />
          </svg>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Connect your wallet to join the discussion
          </p>
        </div>
      )}

      {/* Comment list */}
      <div className="space-y-3">
        <AnimatePresence>
          {comments.map((comment, i) => (
            <motion.div
              key={comment.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03, duration: 0.25 }}
              className="rounded-2xl p-4"
              style={{ background: 'var(--bg-surface-1)', border: '1px solid var(--border)' }}
            >
              <div className="flex items-center gap-2.5 mb-2.5">
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
                  style={{ background: 'rgba(41,115,255,0.08)' }}
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth="2.5">
                    <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                </div>
                <span className="font-mono text-xs font-bold" style={{ color: 'var(--accent-primary)' }}>
                  {truncateAddress(comment.wallet_address)}
                </span>
                <span className="font-mono text-[10px]" style={{ color: 'var(--text-muted)' }}>
                  {timeAgo(comment.created_at)}
                </span>
              </div>
              <p className="text-sm leading-relaxed pl-8.5" style={{ color: 'var(--text-secondary)' }}>
                {comment.content}
              </p>
            </motion.div>
          ))}
        </AnimatePresence>

        {comments.length === 0 && (
          <div className="text-center py-10">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" className="mx-auto mb-3" style={{ opacity: 0.5 }}>
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
            </svg>
            <p className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>
              No comments yet — be the first to share your thoughts
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
