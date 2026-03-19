'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAccount, useWalletClient } from 'wagmi';
import { CATEGORIES, buildPostMessage, type CommunityCategory } from '@/lib/community';

interface CreatePostModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function CreatePostModal({ open, onClose, onSuccess }: CreatePostModalProps) {
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState<CommunityCategory>('general');
  const [status, setStatus] = useState<'idle' | 'signing' | 'posting' | 'error'>('idle');
  const [error, setError] = useState('');

  const canSubmit = title.length >= 3 && content.length >= 10 && status === 'idle';

  const handleSubmit = async () => {
    if (!walletClient || !address) return;

    try {
      setStatus('signing');
      setError('');

      const timestamp = Date.now();
      const message = buildPostMessage(title, category, timestamp);
      const signature = await walletClient.signMessage({ message });

      setStatus('posting');

      const res = await fetch('/api/community/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet_address: address, title, content, category, signature, timestamp }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create post');
      }

      setTitle('');
      setContent('');
      setCategory('general');
      setStatus('idle');
      onSuccess();
      onClose();
    } catch (err: any) {
      if (err?.message?.includes('User rejected') || err?.message?.includes('denied')) {
        setStatus('idle');
        return;
      }
      setError(err.message || 'Something went wrong');
      setStatus('error');
      setTimeout(() => setStatus('idle'), 3000);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0"
            style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          {/* Modal */}
          <motion.div
            className="relative w-full max-w-lg rounded-2xl overflow-hidden"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b" style={{ borderColor: 'var(--border)' }}>
              <h2 className="font-bold" style={{ color: 'var(--text-primary)', fontSize: 'var(--text-h2)' }}>
                New Post
              </h2>
              <button onClick={onClose} style={{ color: 'var(--text-muted)' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Form */}
            <div className="p-5 space-y-4">
              {/* Title */}
              <div>
                <label className="block font-mono text-xs mb-2 uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                  Title
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="What's on your mind?"
                  maxLength={200}
                  className="w-full rounded-xl px-4 py-3 text-sm outline-none transition-colors"
                  style={{
                    background: 'var(--bg-surface-1)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>

              {/* Category */}
              <div>
                <label className="block font-mono text-xs mb-2 uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                  Category
                </label>
                <div className="flex gap-2 flex-wrap">
                  {CATEGORIES.map((cat) => (
                    <button
                      key={cat.slug}
                      onClick={() => setCategory(cat.slug)}
                      className="px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all"
                      style={{
                        background: category === cat.slug ? `${cat.color}18` : 'var(--bg-surface-1)',
                        border: `1px solid ${category === cat.slug ? `${cat.color}40` : 'var(--border)'}`,
                        color: category === cat.slug ? cat.color : 'var(--text-muted)',
                      }}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Content */}
              <div>
                <label className="block font-mono text-xs mb-2 uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                  Content
                </label>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Share your thoughts, strategies, or ideas..."
                  rows={5}
                  maxLength={10000}
                  className="w-full rounded-xl px-4 py-3 text-sm outline-none resize-none transition-colors"
                  style={{
                    background: 'var(--bg-surface-1)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-primary)',
                  }}
                />
                <p className="text-right mt-1 font-mono" style={{ color: 'var(--text-muted)', fontSize: '10px' }}>
                  {content.length}/10000
                </p>
              </div>

              {/* Error */}
              {error && (
                <p className="text-sm rounded-lg px-3 py-2" style={{ color: '#ef4444', background: 'rgba(239,68,68,0.08)' }}>
                  {error}
                </p>
              )}

              {/* Submit */}
              <button
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="w-full py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2"
                style={{
                  background: canSubmit ? 'var(--accent-primary)' : 'rgba(255,255,255,0.05)',
                  color: canSubmit ? '#fff' : 'var(--text-muted)',
                  opacity: canSubmit ? 1 : 0.5,
                  cursor: canSubmit ? 'pointer' : 'not-allowed',
                }}
              >
                {status === 'signing' ? (
                  <>
                    <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                    </svg>
                    Waiting for signature...
                  </>
                ) : status === 'posting' ? (
                  <>
                    <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                    </svg>
                    Posting...
                  </>
                ) : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M12 19V5M5 12l7-7 7 7" />
                    </svg>
                    Sign & Post
                  </>
                )}
              </button>

              <p className="text-center font-mono" style={{ color: 'var(--text-muted)', fontSize: '10px' }}>
                Signing is free — no gas required
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
