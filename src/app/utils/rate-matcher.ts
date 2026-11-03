import { EasyPostRate } from '@/app/types/easypost.model';

export interface OrderShippingChoice {
  code?: string | null;
  title?: string | null;
  cost?: {
    price?: string | null;
    currency?: string | null;
  } | null;
  amount?: string | null;
  deliveryTime?: string | null;
}

export interface RateMatchResult {
  matchedRate: EasyPostRate;
  matchType: 'EXACT_ID' | 'CARRIER_SERVICE' | 'SERVICE_NAME' | 'PRICE_MATCH' | 'FALLBACK_LOWEST';
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  explanation: string;
}

/**
 * Normalizes text to lowercase alphanumeric only for robust comparison.
 */
function clean(s?: string | null): string {
  return (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Matches customer's shipping selection from Wix checkout against EasyPost live carrier rates.
 */
export function matchRateWithCheckoutChoice(
  rates: EasyPostRate[],
  choice?: OrderShippingChoice | null,
): RateMatchResult | null {
  if (!rates || rates.length === 0) return null;

  const choiceCode = (choice?.code || '').trim();
  const choiceTitle = (choice?.title || '').trim();
  const choicePrice = parseFloat(choice?.cost?.price || choice?.amount || '');

  // 1. Direct Rate ID match (if rate was cached or rate ID persists)
  if (choiceCode) {
    const rawRateId = choiceCode.replace(/^easypost-/, '');
    const idMatch = rates.find((r) => r.id === rawRateId || r.id === choiceCode);
    if (idMatch) {
      return {
        matchedRate: idMatch,
        matchType: 'EXACT_ID',
        confidence: 'HIGH',
        explanation: `Matched exact rate ID (${idMatch.id}) from checkout selection`,
      };
    }
  }

  if (choiceTitle) {
    const cleanTitle = clean(choiceTitle);

    // 2. Exact Carrier and Service match (e.g. "USPS — GroundAdvantage", "USPS — Priority", "FedEx — 2Day")
    const fullMatch = rates.find((r) => {
      const cleanCombined = clean(`${r.carrier}${r.service}`);
      const cleanReverse = clean(`${r.service}${r.carrier}`);
      return cleanTitle === cleanCombined || cleanTitle.includes(cleanCombined) || cleanTitle === cleanReverse;
    });

    if (fullMatch) {
      return {
        matchedRate: fullMatch,
        matchType: 'CARRIER_SERVICE',
        confidence: 'HIGH',
        explanation: `Matched carrier & service: ${fullMatch.carrier} ${fullMatch.service}`,
      };
    }

    // 2b. Individual carrier + service token containment
    const tokenMatch = rates.find((r) => {
      const c = clean(r.carrier);
      const s = clean(r.service);
      return cleanTitle.includes(c) && cleanTitle.includes(s);
    });

    if (tokenMatch) {
      return {
        matchedRate: tokenMatch,
        matchType: 'CARRIER_SERVICE',
        confidence: 'HIGH',
        explanation: `Matched carrier and service keywords: ${tokenMatch.carrier} ${tokenMatch.service}`,
      };
    }

    // 3. Service-only name match (e.g., "Ground Advantage", "Priority Mail", "Express")
    const serviceMatch = rates.find((r) => {
      const s = clean(r.service);
      return cleanTitle.includes(s) || s.includes(cleanTitle);
    });

    if (serviceMatch) {
      return {
        matchedRate: serviceMatch,
        matchType: 'SERVICE_NAME',
        confidence: 'MEDIUM',
        explanation: `Matched shipping service name: ${serviceMatch.service}`,
      };
    }

    // 3b. Standard / Ground delivery keyword match
    if (
      cleanTitle.includes('standard') ||
      cleanTitle.includes('ground') ||
      cleanTitle.includes('economy') ||
      cleanTitle.includes('advantage')
    ) {
      const standardRate = rates.find((r) => {
        const s = clean(r.service);
        return s.includes('ground') || s.includes('standard') || s.includes('advantage') || s.includes('economy');
      });
      if (standardRate) {
        return {
          matchedRate: standardRate,
          matchType: 'SERVICE_NAME',
          confidence: 'MEDIUM',
          explanation: `Matched standard delivery option: ${standardRate.carrier} ${standardRate.service}`,
        };
      }
    }

    // 3c. Expedited / Express / Priority / Overnight keyword match
    if (
      cleanTitle.includes('express') ||
      cleanTitle.includes('priority') ||
      cleanTitle.includes('overnight') ||
      cleanTitle.includes('2day') ||
      cleanTitle.includes('expedited')
    ) {
      const expeditedRate = rates.find((r) => {
        const s = clean(r.service);
        return (
          s.includes('express') ||
          s.includes('priority') ||
          s.includes('overnight') ||
          s.includes('2day') ||
          s.includes('saver')
        );
      });
      if (expeditedRate) {
        return {
          matchedRate: expeditedRate,
          matchType: 'SERVICE_NAME',
          confidence: 'MEDIUM',
          explanation: `Matched expedited delivery option: ${expeditedRate.carrier} ${expeditedRate.service}`,
        };
      }
    }
  }

  // 4. Exact or Nearest Price Match
  if (!isNaN(choicePrice) && choicePrice > 0) {
    const priceMatch = rates.find((r) => {
      const rateCost = parseFloat(r.rate);
      return Math.abs(rateCost - choicePrice) < 0.05;
    });

    if (priceMatch) {
      return {
        matchedRate: priceMatch,
        matchType: 'PRICE_MATCH',
        confidence: 'MEDIUM',
        explanation: `Matched carrier postage rate by price ($${priceMatch.rate})`,
      };
    }
  }

  // 5. Fallback: Return lowest rate available
  const sorted = [...rates].sort((a, b) => parseFloat(a.rate) - parseFloat(b.rate));
  return {
    matchedRate: sorted[0],
    matchType: 'FALLBACK_LOWEST',
    confidence: 'LOW',
    explanation: `Defaulted to lowest carrier rate available (${sorted[0].carrier} ${sorted[0].service} - $${sorted[0].rate})`,
  };
}

/**
 * Extracts normalized shipping choice information from a Wix Order object.
 */
export function extractOrderShippingChoice(order?: any): OrderShippingChoice {
  if (!order) return {};

  const info = order.shippingInfo || {};
  const title = info.title || '';
  const code = info.code || '';
  const costPrice = info.cost?.price || order.priceSummary?.shipping?.amount || '';
  const currency = info.cost?.currency || order.currency || 'USD';
  const deliveryTime = info.logistics?.deliveryTime || '';

  return {
    title: title || undefined,
    code: code || undefined,
    cost: costPrice ? { price: String(costPrice), currency } : undefined,
    amount: costPrice ? String(costPrice) : undefined,
    deliveryTime: deliveryTime || undefined,
  };
}

/**
 * Formats carrier and service names into clean, readable display text with proper spacing.
 * E.g., "USPS", "GroundAdvantage" -> "USPS — Ground Advantage"
 * E.g., "FedEx", "FEDEX_2_DAY" -> "FedEx — 2 Day"
 */
export function formatCarrierService(carrier?: string, service?: string): string {
  if (!service && !carrier) return 'Standard Delivery';
  if (!service) return carrier || 'Standard Delivery';

  const specialMap: Record<string, string> = {
    GroundAdvantage: 'Ground Advantage',
    PriorityMailInternational: 'Priority Mail International',
    FirstClassPackageInternationalService: 'First Class Package International',
    FirstClassMailInternational: 'First Class Mail International',
    ExpressMailInternational: 'Priority Mail Express International',
    ParcelSelect: 'Parcel Select',
    Priority: 'Priority Mail',
    Express: 'Priority Mail Express',
    FEDEX_GROUND: 'Ground',
    FEDEX_2_DAY: '2 Day',
    FEDEX_2_DAY_AM: '2 Day A.M.',
    FEDEX_EXPRESS_SAVER: 'Express Saver',
    STANDARD_OVERNIGHT: 'Standard Overnight',
    PRIORITY_OVERNIGHT: 'Priority Overnight',
    FIRST_OVERNIGHT: 'First Overnight',
    GROUND_HOME_DELIVERY: 'Home Delivery',
    UPS_GROUND: 'Ground',
    UPS_SAVER: 'Saver',
    UPS_NEXT_DAY_AIR: 'Next Day Air',
    UPS_2ND_DAY_AIR: '2nd Day Air',
  };

  let formatted = specialMap[service];
  if (!formatted) {
    // Replace underscores with space
    formatted = service.replace(/_/g, ' ');
    // Insert space between lower and uppercase (CamelCase)
    formatted = formatted.replace(/([a-z])([A-Z])/g, '$1 $2');
  }

  // Normalize carrier name (e.g. FedExDefault -> FedEx)
  let effectiveCarrier = (carrier || '').trim();
  if (effectiveCarrier.toLowerCase() === 'fedexdefault') {
    effectiveCarrier = 'FedEx';
  }

  if (effectiveCarrier) {
    // Avoid repetition like "FedEx — FedEx Ground"
    const cleanedService = formatted.replace(new RegExp(`^${effectiveCarrier}\\s*`, 'i'), '').trim();
    return `${effectiveCarrier} — ${cleanedService || formatted}`;
  }

  return formatted;
}
