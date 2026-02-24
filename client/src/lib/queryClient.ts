import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { getApiUrl, getCurrentDomain } from "./api";

function resolveCredentials(url: string, credentials?: RequestCredentials): RequestCredentials {
  if (credentials) {
    return credentials;
  }

  const normalizedPath = url.startsWith("/") ? url : `/${url}`;
  return normalizedPath.startsWith("/v1/public/") ? "omit" : "include";
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const fullUrl = getApiUrl(url);

  const res = await fetch(fullUrl, {
    method,
    headers: {
      ...(data ? { "Content-Type": "application/json" } : {}),
      "X-Server-Domain": getCurrentDomain(),
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
      headers: {
        "X-Server-Domain": getCurrentDomain(),
      },
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
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
