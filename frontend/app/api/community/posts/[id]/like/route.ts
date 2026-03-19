import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { verifyWalletSignature } from '@/lib/verifyWalletSignature';
import { buildLikeMessage } from '@/lib/community';

/**
 * POST /api/community/posts/[id]/like
 * Toggle like on a post. Requires wallet signature.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: postId } = await params;
    const body = await request.json();
    const { wallet_address, signature, timestamp } = body;

    if (!wallet_address || !signature || !timestamp) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const walletLower = wallet_address.toLowerCase();

    // Check if already liked
    const { data: existingLike } = await supabase
      .from('community_likes')
      .select('wallet_address')
      .eq('post_id', postId)
      .eq('wallet_address', walletLower)
      .maybeSingle();

    const action = existingLike ? 'unlike' : 'like';

    // Verify signature
    const message = buildLikeMessage(postId, action, timestamp);
    const verification = await verifyWalletSignature(message, signature, wallet_address, timestamp);
    if (!verification.valid) {
      return NextResponse.json({ error: verification.error }, { status: 401 });
    }

    if (action === 'unlike') {
      await supabase
        .from('community_likes')
        .delete()
        .eq('post_id', postId)
        .eq('wallet_address', walletLower);
    } else {
      await supabase
        .from('community_likes')
        .insert({ post_id: postId, wallet_address: walletLower });
    }

    // Get updated count
    const { count } = await supabase
      .from('community_likes')
      .select('*', { count: 'exact', head: true })
      .eq('post_id', postId);

    return NextResponse.json({ liked: action === 'like', count: count || 0 });
  } catch (err: any) {
    console.error('Error in POST /api/community/posts/[id]/like:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
