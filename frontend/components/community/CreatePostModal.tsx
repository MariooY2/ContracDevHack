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
            style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)' }}
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          {/* Modal */}
          <motion.div
            className="relative w-full max-w-lg rounded-2xl overflow-hidden"
            style={{ background: 'var(--bg-card)', border: '1px solid rgba(41,115,255,0.15)' }}
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 20 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          >
            {/* Accent bar */}
            <div className="h-0.5" style={{ background: 'linear-gradient(90deg, var(--accent-primary), #a78bfa, transparent)' }} />

            {/* Header */}
            <div className="flex items-center justify-between p-5">
              <div className="flex items-center gap-3">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center"
                  style={{ background: 'rgba(41,115,255,0.08)', border: '1px solid rgba(41,115,255,0.15)' }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth="2">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </div>
                <div>
                  <h2 className="font-bold" style={{ color: 'var(--text-primary)', fontSize: 'var(--text-h2)' }}>
                    New Post
                  </h2>
                  <p className="font-mono text-[10px]" style={{ color: 'var(--text-muted)' }}>
                    Sign with wallet — no gas required
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:bg-white/5"
                style={{ color: 'var(--text-muted)' }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }} />

            {/* Form */}
            <div className="p-5 space-y-5">
              {/* Title */}
              <div>
                <label className="block font-mono text-[10px] mb-2 uppercase tracking-widest font-bold" style={{ color: 'var(--text-muted)' }}>
                  Title
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="What's on your mind?"
                  maxLength={200}
                  className="w-full rounded-xl px-4 py-3.5 text-sm outline-none transition-all"
                  style={{
                    background: 'var(--bg-surface-1)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-primary)',
                  }}
                />
                <p className="text-right mt-1 font-mono" style={{ color: 'var(--text-muted)', fontSize: '10px' }}>
                  {title.length}/200
                </p>
              </div>

              {/* Category */}
              <div>
                <label className="block font-mono text-[10px] mb-2 uppercase tracking-widest font-bold" style={{ color: 'var(--text-muted)' }}>
                  Category
                </label>
                <div className="flex gap-2 flex-wrap">
                  {CATEGORIES.map((cat) => (
                    <motion.button
                      key={cat.slug}
                      onClick={() => setCategory(cat.slug)}
                      className="px-3.5 py-2 rounded-xl text-xs font-mono font-bold transition-all"
                      style={{
                        background: category === cat.slug ? `${cat.color}15` : 'var(--bg-surface-1)',
                        border: `1px solid ${category === cat.slug ? `${cat.color}35` : 'var(--border)'}`,
                        color: category === cat.slug ? cat.color : 'var(--text-muted)',
                      }}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      {cat.label}
                    </motion.button>
                  ))}
                </div>
              </div>

              {/* Content */}
              <div>
                <label className="block font-mono text-[10px] mb-2 uppercase tracking-widest font-bold" style={{ color: 'var(--text-muted)' }}>
                  Content
                </label>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Share your thoughts, strategies, or ideas..."
                  rows={5}
                  maxLength={10000}
                  className="w-full rounded-xl px-4 py-3.5 text-sm outline-none resize-none transition-all"
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
                <motion.p
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-sm rounded-xl px-4 py-2.5"
                  style={{ color: '#ef4444', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)' }}
                >
                  {error}
                </motion.p>
              )}

              {/* Submit */}
              <motion.button
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="w-full py-3.5 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2"
                style={{
                  background: canSubmit ? 'var(--accent-primary)' : 'rgba(255,255,255,0.05)',
                  color: canSubmit ? '#fff' : 'var(--text-muted)',
                  cursor: canSubmit ? 'pointer' : 'not-allowed',
                }}
                whileHover={canSubmit ? { scale: 1.01 } : {}}
                whileTap={canSubmit ? { scale: 0.99 } : {}}
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
                    Sign & Publish
                  </>
                )}
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
