import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { env as pubEnv } from '$env/dynamic/public';
import { createServerClient } from '@supabase/ssr';
import { createSupabaseAdminClient } from '$lib/server/supabase';
import {
  consumeGenerationCredit,
  grantPremiumMonthlyCredits,
  isPremiumProfileActive,
  refundGenerationCredit,
} from '$lib/server/credits';

type GenerationType = 'pitch' | 'cover-message' | 'cv-summary';

interface GenerateBody {
  missionId?: string;
  type?: GenerationType;
  prompt?: string;
  mission?: {
    title?: string;
    description?: string;
    client?: string;
    stack?: string[];
    location?: string;
  };
  profile?: {
    jobTitle?: string;
    stack?: string[];
    seniority?: string;
    location?: string;
  };
}

function buildPrompt(body: GenerateBody): string | null {
  if (body.prompt?.trim()) {
    return body.prompt.trim();
  }
  if (!body.type || !body.mission || !body.profile) {
    return null;
  }

  const mission = body.mission;
  const profile = body.profile;
  const generationLabel =
    body.type === 'pitch'
      ? 'un pitch court de candidature'
      : body.type === 'cover-message'
        ? 'un message recruteur'
        : 'un résumé CV adapté';

  return [
    `Génère ${generationLabel} en français pour cette mission freelance.`,
    '',
    `Mission: ${mission.title ?? 'Non précisée'}`,
    `Client: ${mission.client ?? 'Non précisé'}`,
    `Lieu: ${mission.location ?? 'Non précisé'}`,
    `Stack mission: ${(mission.stack ?? []).join(', ') || 'Non précisée'}`,
    `Description: ${mission.description ?? 'Non précisée'}`,
    '',
    `Profil candidat: ${profile.jobTitle ?? 'Non précisé'}`,
    `Séniorité: ${profile.seniority ?? 'Non précisée'}`,
    `Localisation: ${profile.location ?? 'Non précisée'}`,
    `Stack candidat: ${(profile.stack ?? []).join(', ') || 'Non précisée'}`,
    '',
    'Réponds avec un texte directement utilisable, concis et professionnel.',
  ].join('\n');
}

export const POST: RequestHandler = async ({ request }) => {
  // Verify JWT
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const token = authHeader.slice(7);

  // Create a Supabase client with the user's JWT
  const supabase = createServerClient(
    pubEnv.PUBLIC_SUPABASE_URL!,
    pubEnv.PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${token}` } },
      cookies: { getAll: () => [], setAll: () => {} },
    }
  );

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return json({ error: 'Invalid token' }, { status: 401 });
  }

  const userId = user.id;
  const admin = createSupabaseAdminClient();

  // Check credit status
  const { data: profile } = await supabase
    .from('profiles')
    .select('subscription_status, subscription_period_end, credit_balance')
    .eq('id', userId)
    .single();

  const isPremium = profile ? isPremiumProfileActive(profile) : false;
  let creditBalance = profile?.credit_balance ?? 0;

  if (isPremium) {
    creditBalance = (await grantPremiumMonthlyCredits(admin, userId)) ?? creditBalance;
  }

  if (creditBalance <= 0) {
    return json(
      {
        error: 'INSUFFICIENT_CREDITS',
        creditBalance,
        creditsConsumed: 0,
      },
      { status: 402 }
    );
  }

  // Parse request body
  const body = (await request.json()) as GenerateBody;
  const { type } = body;
  const prompt = buildPrompt(body);

  if (!prompt || !type) {
    return json({ error: 'Missing prompt or type' }, { status: 400 });
  }

  const glmApiKey = env.GLM_API_KEY;
  const glmModel = env.GLM_MODEL || 'glm-4-flash';

  if (!glmApiKey) {
    return json({ error: 'GLM API not configured' }, { status: 503 });
  }

  const reservationMetadata = {
    mission_id: body.missionId ?? null,
    generation_type: type,
    model: glmModel,
  };
  const reservedBalance = await consumeGenerationCredit(admin, userId, reservationMetadata);

  if (reservedBalance === null) {
    return json(
      {
        error: 'INSUFFICIENT_CREDITS',
        creditBalance,
        creditsConsumed: 0,
      },
      { status: 402 }
    );
  }

  async function refundReservedCredit(reason: string): Promise<number> {
    return (
      (await refundGenerationCredit(admin, userId, {
        ...reservationMetadata,
        refund_reason: reason,
      })) ?? creditBalance
    );
  }

  try {
    const glmResponse = await fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${glmApiKey}`,
      },
      body: JSON.stringify({
        model: glmModel,
        messages: [
          {
            role: 'system',
            content: `You are a professional freelance assistant. Generate a ${type} in French.`,
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.7,
        max_tokens: 2048,
      }),
    });

    if (!glmResponse.ok) {
      const errorText = await glmResponse.text();
      console.error('GLM API error:', glmResponse.status, errorText);
      const refundedBalance = await refundReservedCredit(`glm_status_${glmResponse.status}`);
      return json(
        { error: 'AI generation failed', creditBalance: refundedBalance, creditsConsumed: 0 },
        { status: 502 }
      );
    }

    const glmData = await glmResponse.json();
    const generatedText = glmData.choices?.[0]?.message?.content ?? '';

    if (!generatedText) {
      const refundedBalance = await refundReservedCredit('empty_content');
      return json(
        {
          error: 'AI generation returned empty content',
          creditBalance: refundedBalance,
          creditsConsumed: 0,
        },
        { status: 502 }
      );
    }

    return json({
      content: generatedText,
      type,
      model: glmModel,
      creditBalance: reservedBalance,
      creditsConsumed: 1,
    });
  } catch (err) {
    console.error('GLM API request failed:', err);
    const refundedBalance = await refundReservedCredit('request_failed');
    return json(
      { error: 'AI service unavailable', creditBalance: refundedBalance, creditsConsumed: 0 },
      { status: 503 }
    );
  }
};
