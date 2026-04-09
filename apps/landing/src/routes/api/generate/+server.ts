import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { env as pubEnv } from '$env/dynamic/public';
import { createServerClient } from '@supabase/ssr';

export const POST: RequestHandler = async ({ request }) => {
  // Verify JWT
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const token = authHeader.slice(7);

  // Create a Supabase client with the user's JWT
  const supabase = createServerClient(pubEnv.PUBLIC_SUPABASE_URL!, pubEnv.PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    cookies: { getAll: () => [], setAll: () => {} }
  });

  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return json({ error: 'Invalid token' }, { status: 401 });
  }

  // Check premium status
  const { data: profile } = await supabase
    .from('profiles')
    .select('subscription_status')
    .eq('id', user.id)
    .single();

  if (profile?.subscription_status !== 'premium') {
    return json({ error: 'Premium subscription required' }, { status: 403 });
  }

  // Parse request body
  const body = await request.json();
  const { prompt, type } = body as { prompt: string; type: string };

  if (!prompt || !type) {
    return json({ error: 'Missing prompt or type' }, { status: 400 });
  }

  // Call z.ai GLM API
  const glmApiKey = env.GLM_API_KEY;
  const glmModel = env.GLM_MODEL || 'glm-4-flash';

  if (!glmApiKey) {
    return json({ error: 'GLM API not configured' }, { status: 503 });
  }

  try {
    const glmResponse = await fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${glmApiKey}`
      },
      body: JSON.stringify({
        model: glmModel,
        messages: [
          {
            role: 'system',
            content: `You are a professional freelance assistant. Generate a ${type} in French.`
          },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 2048
      })
    });

    if (!glmResponse.ok) {
      const errorText = await glmResponse.text();
      console.error('GLM API error:', glmResponse.status, errorText);
      return json({ error: 'AI generation failed' }, { status: 502 });
    }

    const glmData = await glmResponse.json();
    const generatedText = glmData.choices?.[0]?.message?.content ?? '';

    return json({
      text: generatedText,
      type,
      model: glmModel
    });
  } catch (err) {
    console.error('GLM API request failed:', err);
    return json({ error: 'AI service unavailable' }, { status: 503 });
  }
};
