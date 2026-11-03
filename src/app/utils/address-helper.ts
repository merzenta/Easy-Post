/**
 * Address and Recipient extraction and normalization utilities for Wix Orders & EasyPost.
 */

const US_STATE_NAME_TO_CODE: Record<string, string> = {
  ALABAMA: 'AL',
  ALASKA: 'AK',
  ARIZONA: 'AZ',
  ARKANSAS: 'AR',
  CALIFORNIA: 'CA',
  COLORADO: 'CO',
  CONNECTICUT: 'CT',
  DELAWARE: 'DE',
  FLORIDA: 'FL',
  GEORGIA: 'GA',
  HAWAII: 'HI',
  IDAHO: 'ID',
  ILLINOIS: 'IL',
  INDIANA: 'IN',
  IOWA: 'IA',
  KANSAS: 'KS',
  KENTUCKY: 'KY',
  LOUISIANA: 'LA',
  MAINE: 'ME',
  MARYLAND: 'MD',
  MASSACHUSETTS: 'MA',
  MICHIGAN: 'MI',
  MINNESOTA: 'MN',
  MISSISSIPPI: 'MS',
  MISSOURI: 'MO',
  MONTANA: 'MT',
  NEBRASKA: 'NE',
  NEVADA: 'NV',
  'NEW HAMPSHIRE': 'NH',
  'NEW JERSEY': 'NJ',
  'NEW MEXICO': 'NM',
  'NEW YORK': 'NY',
  'NORTH CAROLINA': 'NC',
  'NORTH DAKOTA': 'ND',
  OHIO: 'OH',
  OKLAHOMA: 'OK',
  OREGON: 'OR',
  PENNSYLVANIA: 'PA',
  'RHODE ISLAND': 'RI',
  'SOUTH CAROLINA': 'SC',
  'SOUTH DAKOTA': 'SD',
  TENNESSEE: 'TN',
  TEXAS: 'TX',
  UTAH: 'UT',
  VERMONT: 'VT',
  VIRGINIA: 'VA',
  WASHINGTON: 'WA',
  'WEST VIRGINIA': 'WV',
  WISCONSIN: 'WI',
  WYOMING: 'WY',
  'DISTRICT OF COLUMBIA': 'DC',
};

/**
 * Normalizes state / province / subdivision codes.
 * E.g., "US-NJ" -> "NJ", "New Jersey" -> "NJ", "AU-NSW" -> "NSW".
 */
export function normalizeStateCode(stateOrSubdivision?: string | null, country = 'US'): string {
  if (!stateOrSubdivision) return '';
  let cleaned = String(stateOrSubdivision).trim();

  // Strip ISO country prefix like "US-NJ" -> "NJ", "AU-NSW" -> "NSW", "CA-ON" -> "ON"
  cleaned = cleaned.replace(/^[A-Za-z]{2}-/, '').trim();

  const cUpper = (country || 'US').trim().toUpperCase();
  if (cUpper === 'US') {
    const upper = cleaned.toUpperCase();
    if (US_STATE_NAME_TO_CODE[upper]) {
      return US_STATE_NAME_TO_CODE[upper];
    }
    return upper.length <= 2 ? upper : upper.slice(0, 2);
  }

  return cleaned.toUpperCase();
}

export interface ExtractedOrderRecipient {
  name: string;
  phone: string;
  email: string;
  street1: string;
  street2: string;
  city: string;
  state: string;
  zip: string;
  country: string;
}

/**
 * Robustly extracts recipient and destination address details from any Wix Order representation.
 */
export function extractOrderRecipient(order: any): ExtractedOrderRecipient {
  if (!order) {
    return {
      name: 'Valued Customer',
      phone: '',
      email: '',
      street1: '',
      street2: '',
      city: '',
      state: '',
      zip: '',
      country: 'US',
    };
  }

  // 1. Check all possible contact detail locations
  const destContact = order?.shippingInfo?.logistics?.shippingDestination?.contactDetails;
  const recipientContact = order?.recipient?.contactDetails;
  const billingContact = order?.billingInfo?.contactDetails;
  const shippingRecipient = order?.shippingAddress?.recipient;
  const buyerContact = order?.buyerContactDetails;

  const contact = destContact || recipientContact || billingContact || shippingRecipient || buyerContact || {};

  const firstName = contact.firstName || order?.buyerInfo?.firstName || order?.buyerContactDetails?.firstName || '';

  const lastName = contact.lastName || order?.buyerInfo?.lastName || order?.buyerContactDetails?.lastName || '';

  let fullName = `${firstName} ${lastName}`.trim();

  if (!fullName) {
    if (contact.name && typeof contact.name === 'string') {
      fullName = contact.name.trim();
    } else if (order?.buyerInfo?.email) {
      const emailPrefix = order.buyerInfo.email.split('@')[0];
      fullName = emailPrefix ? emailPrefix.charAt(0).toUpperCase() + emailPrefix.slice(1) : 'Valued Customer';
    } else if (contact.email) {
      const emailPrefix = contact.email.split('@')[0];
      fullName = emailPrefix ? emailPrefix.charAt(0).toUpperCase() + emailPrefix.slice(1) : 'Valued Customer';
    } else {
      fullName = 'Valued Customer';
    }
  }

  // 2. Check all possible address locations
  const addr =
    order?.shippingInfo?.logistics?.shippingDestination?.address ||
    order?.recipient?.address ||
    order?.billingInfo?.address ||
    order?.shippingAddress?.address ||
    order?.shippingAddress ||
    {};

  const street1 =
    addr.addressLine1 ||
    addr.addressLine ||
    (addr.streetAddress?.name ? `${addr.streetAddress?.number || ''} ${addr.streetAddress?.name || ''}`.trim() : '') ||
    addr.street ||
    '';

  const street2 = addr.addressLine2 || addr.streetAddress?.apt || '';
  const city = addr.city || '';
  const country = (addr.country || 'US').trim().toUpperCase();
  const rawSubdivision = addr.subdivision || addr.state || '';
  const state = normalizeStateCode(rawSubdivision, country);
  const zip = addr.postalCode || addr.zip || '';

  const phone =
    contact.phone || order?.buyerInfo?.phone || order?.buyerContactDetails?.phone || billingContact?.phone || '';

  const email = order?.buyerInfo?.email || order?.buyerContactDetails?.email || contact.email || '';

  return {
    name: fullName,
    phone,
    email,
    street1,
    street2,
    city,
    state,
    zip,
    country,
  };
}
