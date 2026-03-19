import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

/**
 * GET /api/community/posts/[id]
 * Fetch a single post with all comments and like count.
 * Optional: ?wallet=0x... to check if user has liked
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const wallet = searchParams.get('wallet')?.toLowerCase();

    // Fetch post with counts
    const { data: post, error } = await supabase
      .from('community_posts')
      .select('*, community_likes(count), community_comments(count)')
      .eq('id', id)
      .single();

    if (error || !post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    // Fetch all comments
    const { data: comments } = await supabase
      .from('community_comments')
      .select('*')
      .eq('post_id', id)
      .order('created_at', { ascending: true });

    // Check if user liked
    let liked_by_user = false;
    if (wallet) {
      const { data: like } = await supabase
        .from('community_likes')
        .select('wallet_address')
        .eq('post_id', id)
        .eq('wallet_address', wallet)
        .maybeSingle();
      liked_by_user = !!like;
    }

    return NextResponse.json({
      post: {
        id: post.id,
        wallet_address: post.wallet_address,
        title: post.title,
        content: post.content,
        category: post.category,
        created_at: post.created_at,
        like_count: post.community_likes?.[0]?.count || 0,
        comment_count: post.community_comments?.[0]?.count || 0,
        liked_by_user,
      },
      comments: comments || [],
    });
  } catch (err: any) {
    console.error('Error in GET /api/community/posts/[id]:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
