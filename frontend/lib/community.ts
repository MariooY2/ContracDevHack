/* ─── VOLT Community — Types, constants & helpers ──────── */

export interface CommunityPost {
  id: string;
  wallet_address: string;
  title: string;
  content: string;
  category: CommunityCategory;
  created_at: string;
}

export interface CommunityComment {
  id: string;
  post_id: string;
  wallet_address: string;
  content: string;
  created_at: string;
}

export interface PostWithCounts extends CommunityPost {
  like_count: number;
  comment_count: number;
  liked_by_user?: boolean;
}

export type CommunityCategory = 'strategy' | 'analysis' | 'feature-request' | 'governance' | 'general';

export const CATEGORIES: { slug: CommunityCategory; label: string; color: string }[] = [
  { slug: 'strategy', label: 'Strategy', color: '#2973ff' },
  { slug: 'analysis', label: 'Market Analysis', color: '#10B981' },
  { slug: 'feature-request', label: 'Feature Requests', color: '#a78bfa' },
  { slug: 'governance', label: 'Governance', color: '#F59E0B' },
  { slug: 'general', label: 'General', color: '#8b8b8b' },
];

export function getCategoryMeta(slug: string) {
  return CATEGORIES.find((c) => c.slug === slug) || CATEGORIES[4];
}

export function truncateAddress(addr: string): string {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

/* ─── Deterministic message builders for signing ───────── */

export function buildPostMessage(title: string, category: string, timestamp: number): string {
  return `VOLT Community Post\n\nTitle: ${title}\nCategory: ${category}\nTimestamp: ${timestamp}`;
}

export function buildCommentMessage(postId: string, timestamp: number): string {
  return `VOLT Community Comment\n\nPost: ${postId}\nTimestamp: ${timestamp}`;
}

export function buildLikeMessage(postId: string, action: 'like' | 'unlike', timestamp: number): string {
  return `VOLT Community Like\n\nPost: ${postId}\nAction: ${action}\nTimestamp: ${timestamp}`;
}
