import { useState, useEffect, useCallback, useRef } from 'react';
import { useDateRange, presetToRangeParam } from '../context/DateRangeContext';
import { useSyncContext } from '../context/SyncContext';
import { apiClient } from '../lib/apiClient';

interface QueryOptions {
  url: string | null;
  headers?: Record<string, string>;
  enabled?: boolean;
}

interface QueryResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
  initialLoading: boolean;
}

export function useDateRangeQuery<T = any>(options: QueryOptions): QueryResult<T> {
  const { preset, params, generation } = useDateRange();
  const { syncVersion } = useSyncContext();
  const { url, headers = {}, enabled = true } = options;

  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const abortRef = useRef<AbortController | null>(null);
  const fetchCountRef = useRef(0);

  const buildUrl = useCallback(() => {
    if (!url) return null;
    const sep = url.includes('?') ? '&' : '?';
    const rangeParam = presetToRangeParam(preset);
    if (rangeParam && rangeParam !== 'all' && preset !== 'custom') {
      return `${url}${sep}range=${rangeParam}`;
    }
    if (preset === 'custom') {
      return `${url}${sep}start_date=${encodeURIComponent(params.start_date)}&end_date=${encodeURIComponent(params.end_date)}`;
    }
    return url;
  }, [url, preset, params]);

  const fetchData = useCallback(async () => {
    const finalUrl = buildUrl();
    if (!finalUrl || !enabled) return;

    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const fetchId = ++fetchCountRef.current;
    setLoading(true);
    setError(null);

    try {
      const res = await apiClient.request(finalUrl, {
        signal: controller.signal,
        headers,
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();

      if (fetchId === fetchCountRef.current) {
        setData(json);
        setInitialLoading(false);
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      if (fetchId === fetchCountRef.current) {
        setError(err.message || 'Fetch failed');
        setInitialLoading(false);
      }
    } finally {
      if (fetchId === fetchCountRef.current) {
        setLoading(false);
      }
    }
  }, [buildUrl, enabled, headers]);

  useEffect(() => {
    fetchData();
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, [generation, syncVersion, url, enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  return { data, loading, error, refetch: fetchData, initialLoading };
}

export function useDateRangeQueries<T extends Record<string, string | null>>(
  urls: T,
  headers?: Record<string, string>,
  enabled = true,
) {
  const { preset, params, generation } = useDateRange();
  const { syncVersion } = useSyncContext();
  const [data, setData] = useState<Record<keyof T, any>>({} as any);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const abortRef = useRef<AbortController | null>(null);
  const fetchCountRef = useRef(0);

  // Derive a stable string key so the effect re-fires when urls change
  const urlsKey = Object.values(urls).join('|');

  const fetchAll = useCallback(async () => {
    if (!enabled) {
      setInitialLoading(false);
      setLoading(false);
      return;
    }
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const fetchId = ++fetchCountRef.current;
    setLoading(true);

    try {
      const entries = Object.entries(urls).filter(([, url]) => url !== null);
      const results = await Promise.all(
        entries.map(async ([key, baseUrl]) => {
          if (!baseUrl) return [key, null];
          const sep = baseUrl.includes('?') ? '&' : '?';
          const rangeParam = presetToRangeParam(preset);
          let finalUrl = baseUrl;
          if (rangeParam && rangeParam !== 'all' && preset !== 'custom') {
            finalUrl = `${baseUrl}${sep}range=${rangeParam}`;
          } else if (preset === 'custom') {
            finalUrl = `${baseUrl}${sep}start_date=${encodeURIComponent(params.start_date)}&end_date=${encodeURIComponent(params.end_date)}`;
          }
          const res = await apiClient.request(finalUrl, {
            signal: controller.signal,
            headers,
          });
          if (!res.ok) return [key, null];
          const json = await res.json();
          return [key, json];
        }),
      );

      if (fetchId === fetchCountRef.current) {
        const newData = Object.fromEntries(results) as Record<keyof T, any>;
        setData(newData);
        setInitialLoading(false);
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      if (fetchId === fetchCountRef.current) setInitialLoading(false);
    } finally {
      if (fetchId === fetchCountRef.current) setLoading(false);
    }
  }, [enabled, preset, params, generation, syncVersion, urlsKey, headers]); // eslint-disable-line

  useEffect(() => {
    fetchAll();
    return () => { if (abortRef.current) abortRef.current.abort(); };
  }, [generation, syncVersion, enabled, urlsKey]); // eslint-disable-line

  return { data, loading, initialLoading, refetch: fetchAll };
}
