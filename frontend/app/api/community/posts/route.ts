import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { verifyWalletSignature } from '@/lib/verifyWalletSignature';
import { buildPostMessage } from '@/lib/community';

const VALID_CATEGORIES = ['strategy', 'analysis', 'feature-request', 'governance', 'general'];

/**
 * GET /api/community/posts
 * List posts with like/comment counts.
 * Params: ?category=, ?sort=recent|popular, ?page=, ?wallet= (for liked_by_user)
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const sort = searchParams.get('sort') || 'recent';
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const wallet = searchParams.get('wallet')?.toLowerCase();
    const limit = 20;
    const offset = (page - 1) * limit;

    // Build query — fetch posts with aggregated counts
    let query = supabase
      .from('community_posts')
      .select('*, community_comments(count), community_likes(count)')
      .range(offset, offset + limit - 1);

    if (category && VALID_CATEGORIES.includes(category)) {
      query = query.eq('category', category);
    }

    if (sort === 'popular') {
      query = query.order('created_at', { ascending: false });
    } else {
      query = query.order('created_at', { ascending: false });
    }

    const { data, error } = await query;

    if (error) {
      console.error('Supabase error fetching posts:', error);
      return NextResponse.json({ error: 'Failed to fetch posts' }, { status: 500 });
    }

    // Transform response to flatten counts
    const posts = (data || []).map((post: any) => ({
      id: post.id,
      wallet_address: post.wallet_address,
      title: post.title,
      content: post.content,
      category: post.category,
      created_at: post.created_at,
      like_count: post.community_likes?.[0]?.count || 0,
      comment_count: post.community_comments?.[0]?.count || 0,
    }));

    // Sort by popularity (like_count) if requested
    if (sort === 'popular') {
      posts.sort((a: any, b: any) => b.like_count - a.like_count);
    }

    // If wallet provided, check which posts the user has liked
    if (wallet && posts.length > 0) {
      const postIds = posts.map((p: any) => p.id);
      const { data: likes } = await supabase
        .from('community_likes')
        .select('post_id')
        .eq('wallet_address', wallet.toLowerCase())
        .in('post_id', postIds);

      const likedSet = new Set((likes || []).map((l: any) => l.post_id));
      posts.forEach((p: any) => { p.liked_by_user = likedSet.has(p.id); });
    }

    return NextResponse.json({ posts, page, hasMore: posts.length === limit });
  } catch (err: any) {
    console.error('Error in GET /api/community/posts:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/community/posts
 * Create a new post. Requires wallet signature.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { wallet_address, title, content, category, signature, timestamp } = body;

    // Validate fields
    if (!wallet_address || !title || !content || !category || !signature || !timestamp) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    if (!VALID_CATEGORIES.includes(category)) {
      return NextResponse.json({ error: 'Invalid category' }, { status: 400 });
    }
    if (title.length < 3 || title.length > 200) {
      return NextResponse.json({ error: 'Title must be 3-200 characters' }, { status: 400 });
    }
    if (content.length < 10 || content.length > 10000) {
      return NextResponse.json({ error: 'Content must be 10-10000 characters' }, { status: 400 });
    }

    // Verify signature
    const message = buildPostMessage(title, category, timestamp);
    const verification = await verifyWalletSignature(message, signature, wallet_address, timestamp);
    if (!verification.valid) {
      return NextResponse.json({ error: verification.error }, { status: 401 });
    }

    // Insert post
    const { data, error } = await supabase
      .from('community_posts')
      .insert({
        wallet_address: wallet_address.toLowerCase(),
        title,
        content,
        category,
      })
      .select()
      .single();

    if (error) {
      console.error('Supabase insert error:', error);
      return NextResponse.json({ error: 'Failed to create post' }, { status: 500 });
    }

    return NextResponse.json({ post: { ...data, like_count: 0, comment_count: 0 } }, { status: 201 });
  } catch (err: any) {
    console.error('Error in POST /api/community/posts:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
