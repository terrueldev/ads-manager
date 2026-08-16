/**
 * @spec changes/2026/08/15/plxeiy-google-ads-manager/01-google-ads-manager/changes/campaign-performance-dashboard/SPEC.md
 * test_calculate_derived_metrics_from_raw_values
 * test_calculate_derived_metrics_handles_zero_clicks_and_zero_conversions
 */
import { describe, it, expect } from 'vitest';
import { calculateDerivedMetrics } from './calculate_derived_metrics';

describe('calculateDerivedMetrics', () => {
  describe('test_calculate_derived_metrics_from_raw_values', () => {
    it('computes ctr, avg_cpc, cost, conversion_rate, cost_per_conversion, roas and budget from raw values', () => {
      // Matches SPEC.md's API Contract example response for "Campanha Institucional".
      const result = calculateDerivedMetrics({
        impressions: 12345,
        clicks: 234,
        costMicros: 292_500_000,
        conversions: 8,
        conversionsValue: 936,
        budgetMicros: 50_000_000,
      });

      expect(result.cost).toBeCloseTo(292.5, 5);
      expect(result.ctr).toBeCloseTo(234 / 12345, 5);
      expect(result.avgCpc).toBeCloseTo(292.5 / 234, 5);
      expect(result.conversionRate).toBeCloseTo(8 / 234, 5);
      expect(result.costPerConversion).toBeCloseTo(292.5 / 8, 5);
      expect(result.roas).toBeCloseTo(936 / 292.5, 5);
      expect(result.budget).toBeCloseTo(50.0, 5);
    });

    it('converts micros to currency units', () => {
      const result = calculateDerivedMetrics({
        impressions: 100,
        clicks: 10,
        costMicros: 1_000_000,
        conversions: 1,
        conversionsValue: 2_000_000,
        budgetMicros: 5_000_000,
      });

      expect(result.cost).toBe(1);
      expect(result.budget).toBe(5);
    });

    it('returns null budget when budgetMicros is null (e.g. shared budget group, per SPEC.md Gaps & Assumptions)', () => {
      const result = calculateDerivedMetrics({
        impressions: 100,
        clicks: 10,
        costMicros: 1_000_000,
        conversions: 1,
        conversionsValue: 1_000_000,
        budgetMicros: null,
      });

      expect(result.budget).toBeNull();
    });
  });

  describe('test_calculate_derived_metrics_handles_zero_clicks_and_zero_conversions', () => {
    it('returns 0 (not NaN/Infinity) for ctr when impressions is 0', () => {
      const result = calculateDerivedMetrics({
        impressions: 0,
        clicks: 0,
        costMicros: 0,
        conversions: 0,
        conversionsValue: 0,
        budgetMicros: null,
      });

      expect(result.ctr).toBe(0);
      expect(Number.isNaN(result.ctr)).toBe(false);
    });

    it('returns 0 (not NaN/Infinity) for avg_cpc and conversion_rate when clicks is 0', () => {
      const result = calculateDerivedMetrics({
        impressions: 1000,
        clicks: 0,
        costMicros: 0,
        conversions: 0,
        conversionsValue: 0,
        budgetMicros: null,
      });

      expect(result.avgCpc).toBe(0);
      expect(result.conversionRate).toBe(0);
      expect(Number.isFinite(result.avgCpc)).toBe(true);
      expect(Number.isFinite(result.conversionRate)).toBe(true);
    });

    it('returns 0 (not NaN/Infinity) for cost_per_conversion when conversions is 0', () => {
      const result = calculateDerivedMetrics({
        impressions: 1000,
        clicks: 50,
        costMicros: 10_000_000,
        conversions: 0,
        conversionsValue: 0,
        budgetMicros: null,
      });

      expect(result.costPerConversion).toBe(0);
      expect(Number.isFinite(result.costPerConversion)).toBe(true);
    });

    it('returns 0 (not NaN/Infinity) for roas when cost is 0', () => {
      const result = calculateDerivedMetrics({
        impressions: 0,
        clicks: 0,
        costMicros: 0,
        conversions: 0,
        conversionsValue: 0,
        budgetMicros: null,
      });

      expect(result.roas).toBe(0);
      expect(Number.isFinite(result.roas)).toBe(true);
    });

    it('handles an entirely zeroed-out campaign (new campaign with no data yet) without any NaN/Infinity field', () => {
      const result = calculateDerivedMetrics({
        impressions: 0,
        clicks: 0,
        costMicros: 0,
        conversions: 0,
        conversionsValue: 0,
        budgetMicros: 10_000_000,
      });

      expect(result).toEqual({
        ctr: 0,
        avgCpc: 0,
        cost: 0,
        conversionRate: 0,
        costPerConversion: 0,
        roas: 0,
        budget: 10,
      });
    });
  });
});
