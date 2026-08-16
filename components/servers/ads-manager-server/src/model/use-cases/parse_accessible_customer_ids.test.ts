/**
 * @spec changes/2026/08/15/plxeiy-google-ads-manager/01-google-ads-manager/changes/google-ads-connection/SPEC.md
 * test_parse_accessible_accounts_includes_mcc_subaccounts
 */
import { describe, it, expect } from 'vitest';
import { parseAccessibleCustomerIds } from './parse_accessible_customer_ids';

describe('parseAccessibleCustomerIds', () => {
  describe('test_parse_accessible_accounts_includes_mcc_subaccounts', () => {
    it('formats a single accessible customer as XXX-XXX-XXXX', () => {
      const result = parseAccessibleCustomerIds(['customers/1234567890']);

      expect(result).toEqual(['123-456-7890']);
    });

    it('returns every sub-account reachable through an MCC identity, not just the manager', () => {
      // Given an MCC login whose ListAccessibleCustomers response includes the manager account
      // itself plus two linked sub-accounts (FR2: "incluindo sub-contas caso a identidade seja de
      // uma MCC")
      const resourceNames = ['customers/1112223330', 'customers/2223334440', 'customers/3334445550'];

      const result = parseAccessibleCustomerIds(resourceNames);

      expect(result).toEqual(['111-222-3330', '222-333-4440', '333-444-5550']);
      expect(result).toHaveLength(3);
    });

    it('returns an empty list when nothing is accessible', () => {
      expect(parseAccessibleCustomerIds([])).toEqual([]);
    });
  });
});
