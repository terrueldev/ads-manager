// Pure parsing: normalizes the raw `resource_names` array returned by the Google Ads API's
// ListAccessibleCustomers (e.g. ["customers/1234567890", "customers/9876543210"]) into a list of
// Customer IDs formatted as `XXX-XXX-XXXX` (SPEC.md's Customer ID format).
//
// When the authenticated identity is an MCC (manager account), Google returns one resource_name
// per accessible sub-account (plus the manager account itself), so a MCC identity naturally
// yields multiple entries here — see FR2.
const CUSTOMER_ID_LENGTH_DIGITS = 10;
const RESOURCE_NAME_PREFIX = 'customers/';

const formatCustomerId = (digits: string): string =>
  `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, CUSTOMER_ID_LENGTH_DIGITS)}`;

export const parseAccessibleCustomerIds = (resourceNames: readonly string[]): readonly string[] =>
  resourceNames.map((resourceName) => formatCustomerId(resourceName.replace(RESOURCE_NAME_PREFIX, '')));
