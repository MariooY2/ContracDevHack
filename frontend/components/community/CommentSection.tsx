'use client';

import { useState } from 'react';
import { useAccount, useWalletClient } from 'wagmi';
import { motion } from 'framer-motion';
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
    <div className="space-y-4">
      <h3 className="font-bold flex items-center gap-2" style={{ color: 'var(--text-primary)', fontSize: 'var(--text-body)' }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
        </svg>
        Comments ({comments.length})
      </h3>

      {/* Comment list */}
      <div className="space-y-3">
        {comments.map((comment, i) => (
          <motion.div
            key={comment.id}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.03 }}
            className="rounded-xl p-4"
            style={{ background: 'var(--bg-surface-1)', border: '1px solid var(--border)' }}
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="font-mono text-xs" style={{ color: 'var(--accent-primary)' }}>
                {truncateAddress(comment.wallet_address)}
              </span>
              <span className="font-mono text-[10px]" style={{ color: 'var(--text-muted)' }}>
                {timeAgo(comment.created_at)}
              </span>
            </div>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              {comment.content}
            </p>
          </motion.div>
        ))}

        {comments.length === 0 && (
          <p className="text-center py-6 font-mono text-xs" style={{ color: 'var(--text-muted)' }}>
            No comments yet — be the first to share your thoughts
          </p>
        )}
      </div>

      {/* Add comment */}
      {isConnected ? (
        <div className="space-y-2">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Add a comment..."
            rows={3}
            maxLength={5000}
            className="w-full rounded-xl px-4 py-3 text-sm outline-none resize-none"
            style={{
              background: 'var(--bg-surface-1)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
            }}
          />
          {error && (
            <p className="text-xs" style={{ color: '#ef4444' }}>{error}</p>
          )}
          <div className="flex items-center justify-between">
            <p className="font-mono text-[10px]" style={{ color: 'var(--text-muted)' }}>
              Free — sign with wallet
            </p>
            <button
              onClick={handleSubmit}
              disabled={!content.trim() || status !== 'idle'}
              className="px-4 py-2 rounded-lg font-bold text-xs transition-all flex items-center gap-1.5"
              style={{
                background: content.trim() && status === 'idle' ? 'var(--accent-primary)' : 'rgba(255,255,255,0.05)',
                color: content.trim() && status === 'idle' ? '#fff' : 'var(--text-muted)',
                cursor: content.trim() && status === 'idle' ? 'pointer' : 'not-allowed',
              }}
            >
              {status === 'signing' ? 'Signing...' : status === 'posting' ? 'Posting...' : 'Comment'}
            </button>
          </div>
        </div>
      ) : (
        <div
          className="text-center py-4 rounded-xl"
          style={{ background: 'var(--bg-surface-1)', border: '1px solid var(--border)' }}
        >
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Connect your wallet to comment
          </p>
        </div>
      )}
    </div>
  );
}
