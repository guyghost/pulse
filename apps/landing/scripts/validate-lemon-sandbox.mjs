#!/usr/bin/env node

const requiredKeys = [
  'LEMON_SQUEEZY_API_KEY',
  'LEMON_SQUEEZY_STORE_ID',
  'LEMON_SQUEEZY_PREMIUM_YEARLY_VARIANT_ID',
  'LEMON_SQUEEZY_WEBHOOK_SECRET',
];
const missing = requiredKeys.filter((key) => !process.env[key]);

if (missing.length > 0) {
  console.error(
    JSON.stringify({
      status: 'blocked_external',
      missing,
      note: 'Only Lemon Squeezy test-mode values are accepted.',
    })
  );
  process.exit(2);
}
if (process.env.LEMON_SQUEEZY_EXPECTED_TEST_MODE !== 'true') {
  console.error(
    JSON.stringify({
      status: 'blocked_external',
      error: 'TEST_MODE_REQUIRED',
    })
  );
  process.exit(2);
}

const apiKey = process.env.LEMON_SQUEEZY_API_KEY;
const storeId = process.env.LEMON_SQUEEZY_STORE_ID;
const variantId = process.env.LEMON_SQUEEZY_PREMIUM_YEARLY_VARIANT_ID;
const headers = {
  Accept: 'application/vnd.api+json',
  'Content-Type': 'application/vnd.api+json',
  Authorization: `Bearer ${apiKey}`,
};

async function readJson(path) {
  const response = await fetch(`https://api.lemonsqueezy.com/v1/${path}`, { headers });
  if (!response.ok) {
    throw new Error(`LEMON_API_${response.status}`);
  }
  return response.json();
}

function assert(condition, code) {
  if (!condition) {
    throw new Error(code);
  }
}

try {
  const variantResponse = await readJson(`variants/${encodeURIComponent(variantId)}`);
  const variant = variantResponse?.data;
  const variantAttributes = variant?.attributes;
  assert(variant?.type === 'variants', 'VARIANT_RESPONSE_INVALID');
  assert(String(variant?.id) === variantId, 'VARIANT_ID_MISMATCH');
  assert(variantAttributes?.test_mode === true, 'VARIANT_NOT_TEST_MODE');
  assert(variantAttributes?.price === 1000, 'VARIANT_PRICE_MISMATCH');
  assert(variantAttributes?.is_subscription === true, 'VARIANT_NOT_SUBSCRIPTION');
  assert(variantAttributes?.interval === 'year', 'VARIANT_INTERVAL_MISMATCH');
  assert(variantAttributes?.interval_count === 1, 'VARIANT_INTERVAL_COUNT_MISMATCH');
  assert(variantAttributes?.has_free_trial === false, 'UNEXPECTED_FREE_TRIAL');
  assert(variantAttributes?.pay_what_you_want === false, 'PAY_WHAT_YOU_WANT_FORBIDDEN');
  assert(
    variantAttributes?.status === 'published' || variantAttributes?.status === 'pending',
    'VARIANT_NOT_PUBLISHABLE'
  );

  const productResponse = await readJson(
    `products/${encodeURIComponent(String(variantAttributes.product_id))}`
  );
  const product = productResponse?.data;
  assert(product?.type === 'products', 'PRODUCT_RESPONSE_INVALID');
  assert(String(product?.attributes?.store_id) === storeId, 'STORE_ID_MISMATCH');
  assert(product?.attributes?.test_mode === true, 'PRODUCT_NOT_TEST_MODE');
  assert(product?.attributes?.status === 'published', 'PRODUCT_NOT_PUBLISHED');

  const pricesResponse = await readJson(
    `prices?filter[variant_id]=${encodeURIComponent(variantId)}&page[size]=1`
  );
  const price = pricesResponse?.data?.[0]?.attributes;
  assert(price?.category === 'subscription', 'PRICE_CATEGORY_MISMATCH');
  assert(price?.scheme === 'standard', 'PRICE_SCHEME_MISMATCH');
  assert(price?.unit_price === 1000, 'PRICE_AMOUNT_MISMATCH');
  assert(price?.renewal_interval_unit === 'year', 'PRICE_INTERVAL_MISMATCH');
  assert(price?.renewal_interval_quantity === 1, 'PRICE_INTERVAL_QUANTITY_MISMATCH');
  assert(price?.trial_interval_unit === null, 'PRICE_TRIAL_FORBIDDEN');

  console.log(
    JSON.stringify(
      {
        status: 'catalog_passed',
        testMode: true,
        storeMatched: true,
        variantMatched: true,
        amountMinor: 1000,
        interval: 'year',
        intervalCount: 1,
        manualFlowStillRequired: [
          'complete one test-mode checkout and confirm the displayed total is 10.00 EUR tax inclusive',
          'receive signed subscription_created and subscription_updated webhooks on a non-production HTTPS callback',
          'replay the same webhook and confirm duplicate',
          'simulate cancellation, resume, expiry and full/partial refund',
          'confirm dashboard and extension entitlement projections match',
        ],
      },
      null,
      2
    )
  );
} catch (error) {
  console.error(
    JSON.stringify({
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
    })
  );
  process.exit(1);
}
