import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CREDIT_PACKS, isCreditPackId } from '../src/lib/credits';

const testDir = dirname(fileURLToPath(import.meta.url));
const landingDir = resolve(testDir, '..');

describe('credit packs', () => {
  it('defines the launch credit packs', () => {
    expect(CREDIT_PACKS.starter).toMatchObject({ credits: 5, priceCents: 490 });
    expect(CREDIT_PACKS.pro).toMatchObject({ credits: 15, priceCents: 1290 });
    expect(CREDIT_PACKS.power).toMatchObject({ credits: 40, priceCents: 2990 });
  });

  it('rejects unknown checkout pack ids', () => {
    expect(isCreditPackId('starter')).toBe(true);
    expect(isCreditPackId('enterprise')).toBe(false);
    expect(isCreditPackId(null)).toBe(false);
  });
});

describe('credit security invariants', () => {
  const schemaSql = readFileSync(resolve(landingDir, 'supabase/schema.sql'), 'utf8');

  it('restricts credit mutation RPCs to the service role', () => {
    const restrictedFunctions = [
      'consume_generation_credit(uuid, text, jsonb)',
      'refund_generation_credit(uuid, text, jsonb)',
      'add_credits_from_purchase(uuid, integer, text, jsonb)',
    ];

    for (const functionSignature of restrictedFunctions) {
      expect(schemaSql).toContain(
        `revoke execute on function public.${functionSignature} from public, anon, authenticated;`
      );
      expect(schemaSql).toContain(
        `grant execute on function public.${functionSignature} to service_role;`
      );
    }
  });

  it('keeps Premium and credit balances independent', () => {
    const generateRoute = readFileSync(
      resolve(landingDir, 'src/routes/api/generate/+server.ts'),
      'utf8'
    );

    expect(schemaSql).not.toContain('grant_premium_monthly_credits');
    expect(schemaSql).not.toContain('premium_monthly_bonus');
    expect(generateRoute).not.toContain('subscription_status');
    expect(generateRoute).not.toContain('grantPremiumMonthlyCredits');
  });

  it('reserves a generation credit before the paid GLM call and refunds failure paths', () => {
    const generateRoute = readFileSync(
      resolve(landingDir, 'src/routes/api/generate/+server.ts'),
      'utf8'
    );

    const reserveIndex = generateRoute.indexOf(
      'const reservedBalance = await consumeGenerationCredit'
    );
    const fetchIndex = generateRoute.indexOf('const glmResponse = await fetch');

    expect(reserveIndex).toBeGreaterThan(-1);
    expect(fetchIndex).toBeGreaterThan(-1);
    expect(reserveIndex).toBeLessThan(fetchIndex);
    expect(generateRoute).toContain(
      'await refundReservedCredit(`glm_status_${glmResponse.status}`)'
    );
    expect(generateRoute).toContain("await refundReservedCredit('empty_content')");
    expect(generateRoute).toContain("await refundReservedCredit('request_failed')");
  });
});
