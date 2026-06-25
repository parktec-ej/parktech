import { createClient, SupabaseClient } from "@supabase/supabase-js";

let _instance: SupabaseClient | null = null;

function getInstance(): SupabaseClient {
  if (!_instance) {
    _instance = createClient(
      (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim(),
      (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim()
    );
  }
  return _instance;
}

export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    return Reflect.get(getInstance(), prop, receiver);
  },
});