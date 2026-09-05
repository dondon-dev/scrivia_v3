import { describe, it, expect, beforeEach, vi } from 'vitest';
import { syncStntable, syncDivtable } from './syncEngine';
import { decodeDbf } from './dbf';

// Mock the necessary dependencies
vi.mock('./dbf', () => ({
  decodeDbf: vi.fn(),
}));

vi.mock('@/lib/pb', () => ({
  supabase: {
    from: vi.fn(),
  },
  fetchAll: vi.fn(),
  chunkedIn: vi.fn(),
  formatError: vi.fn(),
}));

vi.mock('./restoreSync', () => ({
  syncMastfile: vi.fn(),
  syncDedfile: vi.fn(),
  loadDivisionDirectory: vi.fn(),
  resolveDivisionId: vi.fn(),
}));

vi.mock('./categories', () => ({
  inCategory: vi.fn(),
  categoryOfStacode: vi.fn(),
}));

describe('syncEngine dbfTemplate Integration', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should integrate with STNTABLE dbfTemplate structure', async () => {
    // Mock decodeDbf to return test data
    (decodeDbf as vi.Mock).mockReturnValue({
      records: [
        {
          STACODE: 'S001',
          STANAME: 'School 1',
          DIVCODE: 'D001',
          REGCODE: 'R001',
          ADDRESS: '123 Main St',
          DISTRICT: 'North',
          CATEGORY: 'Public',
          MUNIC: 'City A',
          PROV: 'Province A',
          ZIPCODE: '12345',
        }
      ]
    });

    // Mock upsertTable to return a result
    const mockUpsert = vi.fn().mockResolvedValue({
      tableName: 'STNTABLE',
      fileName: '',
      inserted: 1,
      updated: 0,
      skipped: 0,
      duplicates: 0,
      errors: [],
      durationMs: 100,
    });
    
    // This will be needed to patch the function
    const originalUpsertTable = (global as any).upsertTable;
    (global as any).upsertTable = mockUpsert;

    try {
      const result = await syncStntable(new Uint8Array());
      
      expect(result).toBeDefined();
      expect(result.tableName).toBe('STNTABLE');
      expect(result.inserted).toBe(1);
      
      // Verify that upsertTable was called with proper parameters
      expect(mockUpsert).toHaveBeenCalled();
    } finally {
      (global as any).upsertTable = originalUpsertTable;
    }
  });

  it('should integrate with DIVTABLE dbfTemplate structure', async () => {
    // Mock decodeDbf to return test data
    (decodeDbf as vi.Mock).mockReturnValue({
      records: [
        {
          DIVCODE: 'D001',
          DIVNAME: 'Division 1',
          REGCODE: 'R001',
          ADDRESS: '456 Oak Ave',
          CHIEF: 'John Doe',
        }
      ]
    });

    // Mock upsertTable to return a result
    const mockUpsert = vi.fn().mockResolvedValue({
      tableName: 'DIVTABLE',
      fileName: '',
      inserted: 1,
      updated: 0,
      skipped: 0,
      duplicates: 0,
      errors: [],
      durationMs: 100,
    });
    
    // This will be needed to patch the function
    const originalUpsertTable = (global as any).upsertTable;
    (global as any).upsertTable = mockUpsert;

    try {
      const result = await syncDivtable(new Uint8Array());
      
      expect(result).toBeDefined();
      expect(result.tableName).toBe('DIVTABLE');
      expect(result.inserted).toBe(1);
      
      // Verify that upsertTable was called with proper parameters
      expect(mockUpsert).toHaveBeenCalled();
    } finally {
      (global as any).upsertTable = originalUpsertTable;
    }
  });
});