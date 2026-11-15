import type { RequestHandler } from './$types';
import { GLM_API_KEY, GLM_MODEL } from '$app/env/private';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$app/env/public';
import { createServerClient } from '@supabase/ssr';
import { createSupabaseAdminClient } from '#lib/server/supabase.js';
import { consumeGenerationCredit, refundGenerationCredit } from '#lib/server/credits.js';
import { parseGenerateBodyText, type GenerateBody } from '#lib/server/generate-validation.js';

function buildPrompt(body: GenerateBody): string {
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
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const token = authHeader.slice(7);

  // Create a Supabase client with the user's JWT
  const supabase = createServerClient(PUBLIC_SUPABASE_URL!, PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    cookies: { getAll: () => [], setAll: () => {} },
  });

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return Response.json({ error: 'Invalid token' }, { status: 401 });
  }

  const userId = user.id;

  // Parse and validate request body before any credit mutation. Direct prompt
  // injection is intentionally not part of the accepted schema.
  const parsedBody = parseGenerateBodyText(
    await request.text(),
    request.headers.get('content-length')
  );
  if (!parsedBody.ok) {
    return Response.json({ error: parsedBody.error }, { status: parsedBody.status });
  }

  const body = parsedBody.body;
  const { type } = body;
  const prompt = buildPrompt(body);

  // Check credit status
  const admin = createSupabaseAdminClient();
  const { data: profile } = await supabase
    .from('profiles')
    .select('credit_balance')
    .eq('id', userId)
    .single();

  const creditBalance = profile?.credit_balance ?? 0;

  if (creditBalance <= 0) {
    return Response.json(
      {
        error: 'INSUFFICIENT_CREDITS',
        creditBalance,
        creditsConsumed: 0,
      },
      { status: 402 }
    );
  }

  const glmApiKey = GLM_API_KEY;
  const glmModel = GLM_MODEL || 'glm-4-flash';

  if (!glmApiKey) {
    return Response.json({ error: 'GLM API not configured' }, { status: 503 });
  }

  const reservationMetadata = {
    mission_id: body.missionId ?? null,
    generation_type: type,
    model: glmModel,
  };
  const reservedBalance = await consumeGenerationCredit(admin, userId, reservationMetadata);

  if (reservedBalance === null) {
    return Response.json(
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
      return Response.json(
        { error: 'AI generation failed', creditBalance: refundedBalance, creditsConsumed: 0 },
        { status: 502 }
      );
    }

    const glmData = await glmResponse.json();
    const generatedText = glmData.choices?.[0]?.message?.content ?? '';

    if (!generatedText) {
      const refundedBalance = await refundReservedCredit('empty_content');
      return Response.json(
        {
          error: 'AI generation returned empty content',
          creditBalance: refundedBalance,
          creditsConsumed: 0,
        },
        { status: 502 }
      );
    }

    return Response.json({
      content: generatedText,
      type,
      model: glmModel,
      creditBalance: reservedBalance,
      creditsConsumed: 1,
    });
  } catch (err) {
    console.error('GLM API request failed:', err);
    const refundedBalance = await refundReservedCredit('request_failed');
    return Response.json(
      { error: 'AI service unavailable', creditBalance: refundedBalance, creditsConsumed: 0 },
      { status: 503 }
    );
  }
};
