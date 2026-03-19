import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { verifyWalletSignature } from '@/lib/verifyWalletSignature';
import { buildCommentMessage } from '@/lib/community';

/**
 * POST /api/community/posts/[id]/comments
 * Add a comment to a post. Requires wallet signature.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: postId } = await params;
    const body = await request.json();
    const { wallet_address, content, signature, timestamp } = body;

    if (!wallet_address || !content || !signature || !timestamp) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    if (content.length < 1 || content.length > 5000) {
      return NextResponse.json({ error: 'Comment must be 1-5000 characters' }, { status: 400 });
    }

    // Verify signature
    const message = buildCommentMessage(postId, timestamp);
    const verification = await verifyWalletSignature(message, signature, wallet_address, timestamp);
    if (!verification.valid) {
      return NextResponse.json({ error: verification.error }, { status: 401 });
    }

    // Verify post exists
    const { data: post } = await supabase
      .from('community_posts')
      .select('id')
      .eq('id', postId)
      .single();

    if (!post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    // Insert comment
    const { data, error } = await supabase
      .from('community_comments')
      .insert({
        post_id: postId,
        wallet_address: wallet_address.toLowerCase(),
        content,
      })
      .select()
      .single();

    if (error) {
      console.error('Supabase insert comment error:', error);
      return NextResponse.json({ error: 'Failed to add comment' }, { status: 500 });
    }

    return NextResponse.json({ comment: data }, { status: 201 });
  } catch (err: any) {
    console.error('Error in POST /api/community/posts/[id]/comments:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
