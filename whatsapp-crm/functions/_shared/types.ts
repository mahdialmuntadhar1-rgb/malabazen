// Cloudflare Pages Functions shared types

export interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_KEY: string;
  NABDA_BASE_URL: string;
  NABDA_TOKEN: string;
}

// Cloudflare Pages Function handler type
export interface PagesFunction<Env = unknown> {
  (context: {
    request: Request;
    env: Env;
    params: Record<string, string>;
    data: Record<string, unknown>;
    next: () => Promise<Response>;
  }): Promise<Response> | Response;
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

export function error(message: string, status = 400): Response {
  return json({ error: message }, status);
}
