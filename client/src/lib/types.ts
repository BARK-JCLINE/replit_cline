export interface DropdownOption {
  value: string;
  label: string;
}

export const WAREHOUSE_OPTIONS: DropdownOption[] = [
  { value: "om-bbl", label: "OM Fulfillment Service BBL" },
  { value: "om-bbh", label: "OM Fulfillment Service BBH" },
  { value: "om-bbp", label: "OM Fulfillment Service BBP" },
];

export const ADDRESS_OPTIONS: DropdownOption[] = [
  { value: "us-columbus", label: "500 W Broad St, Columbus OH, 43215" },
  { value: "ca-ottawa", label: "123 Maple Grove Rd, Ottawa ON, K2P 1L4" },
];

export const PRODUCT_OPTIONS: DropdownOption[] = [
  { value: "prod-123", label: "Test Product A (SKU: TEST-A-001)" },
  { value: "prod-456", label: "Test Product B (SKU: TEST-B-002)" },
  { value: "prod-789", label: "Test Product C (SKU: TEST-C-003)" },
  { value: "prod-101", label: "Test Subscription Box (SKU: SUB-001)" },
];

export const SUBSCRIPTION_TYPE_OPTIONS: DropdownOption[] = [
  { value: "first-sub-box", label: "First Sub Box" },
  { value: "non-first-sub-box", label: "Non-First Sub Box" },
  { value: "one-time", label: "One-Time Purchase" },
];

export const CUSTOMER_SEGMENT_OPTIONS: DropdownOption[] = [
  { value: "new-customer", label: "New Customer" },
  { value: "returning-customer", label: "Returning Customer" },
  { value: "vip-customer", label: "VIP Customer" },
];

export const ADDRESS_TEMPLATE_OPTIONS: DropdownOption[] = [
  { value: "us-residential", label: "US - Residential" },
  { value: "us-commercial", label: "US - Commercial" },
  { value: "us-po-box", label: "US - PO Box" },
  { value: "ca-residential", label: "Canada - Residential" },
  { value: "ca-commercial", label: "Canada - Commercial" },
];

export const STATE_PROVINCE_OPTIONS: DropdownOption[] = [
  { value: "ca", label: "California" },
  { value: "ny", label: "New York" },
  { value: "tx", label: "Texas" },
  { value: "on", label: "Ontario" },
  { value: "bc", label: "British Columbia" },
];

export const ORDER_DELAY_OPTIONS: DropdownOption[] = [
  { value: "0", label: "No delay" },
  { value: "1", label: "1 second" },
  { value: "5", label: "5 seconds" },
  { value: "10", label: "10 seconds" },
];
