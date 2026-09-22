'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import { api, get, getSession, onSessionChange, qs, Session } from './api';
import { useToast } from '@/components/ui';

export function useSession(): Session | null {
  return useSyncExternalStore(
    (cb) => {
      const off = onSessionChange(cb);
      return () => {
        off();
      };
    },
    getSession,
    () => null,
  );
}

export interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

export function useList<T = Record<string, unknown>>(endpoint: string, params: Record<string, string | number | boolean | undefined> = {}, enabled = true) {
  return useQuery({
    queryKey: [endpoint, params],
    queryFn: () => get<Paginated<T> | T[]>(endpoint + qs(params)),
    enabled,
  });
}

export function useGet<T = Record<string, unknown>>(path: string | null) {
  return useQuery({ queryKey: [path], queryFn: () => get<T>(path!), enabled: !!path });
}

type Lookups = Record<string, { id: string; code?: string; name: string; [k: string]: unknown }[]>;

/** Shared dropdown data (/lookups), cached for a minute. */
export function useLookups(kinds: string[]) {
  const key = [...kinds].sort().join(',');
  return useQuery({
    queryKey: ['lookups', key],
    queryFn: () => get<Lookups>(`/lookups${qs({ kinds: key })}`),
    staleTime: 60_000,
  });
}

/** Mutation that toasts success/error and invalidates all queries. */
export function useAction<TVars = void, TRes = unknown>(fn: (v: TVars) => Promise<TRes>, success?: string, onDone?: (r: TRes) => void) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: fn,
    onSuccess: (r) => {
      if (success) toast(success);
      void qc.invalidateQueries();
      onDone?.(r);
    },
    onError: (e: Error) => toast(e.message, 'error'),
  });
}

export { api };
