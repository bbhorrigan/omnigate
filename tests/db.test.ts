import { AppDataSource, dbHealthcheck } from '../db';

describe('dbHealthcheck', () => {
  afterEach(() => {
    (AppDataSource as any).isInitialized = false;
    (AppDataSource as any).query = jest.fn();
  });

  it('returns not_initialized when data source is not initialized', async () => {
    (AppDataSource as any).isInitialized = false;
    const result = await dbHealthcheck();
    expect(result).toEqual({ ok: false, error: 'not_initialized' });
  });

  it('returns ok when data source is initialized and query succeeds', async () => {
    (AppDataSource as any).isInitialized = true;
    (AppDataSource as any).query = jest.fn().mockResolvedValueOnce([]);
    const result = await dbHealthcheck();
    expect(result).toEqual({ ok: true });
    expect((AppDataSource as any).query).toHaveBeenCalledWith('SELECT 1');
  });
});

