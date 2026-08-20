import { QueryClient, type QueryFunction } from "@tanstack/react-query";
import { getApiUrl } from "./api";
import { ApiHttpError, isRetryableHttpError } from "./http-error";

function resolveCredentials(url: string, credentials?: RequestCredentials): RequestCredentials {
  if (credentials) {
    return credentials;
  }

  const normalizedPath = url.startsWith("/") ? url : `/${url}`;
  return normalizedPath.startsWith("/v1/public/") ? "omit" : "include";
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    throw new ApiHttpError(res.status, res.statusText, await res.text());
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown,
): Promise<Response> {
  const fullUrl = getApiUrl(url);

  const res = await fetch(fullUrl, {
    method,
    headers: {
      ...(data ? { "Content-Type": "application/json" } : {}),
    },
    body: data ? JSON.stringify(data) : undefined,
    credentials: resolveCredentials(url),
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const fullUrl = getApiUrl(queryKey[0] as string);
    const url = queryKey[0] as string;

    const res = await fetch(fullUrl, {
      credentials: resolveCredentials(url),
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      retryOnMount: false,
      staleTime: 30_000,
      retry: (failureCount, error) => failureCount < 1 && isRetryableHttpError(error),
    },
    mutations: {
      retry: false,
    },
  },
});
