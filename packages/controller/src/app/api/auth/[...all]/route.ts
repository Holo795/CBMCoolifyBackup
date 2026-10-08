import { getRequestAuth } from "@/lib/auth";

// The instance with the sign-in providers configured now (see lib/auth).
async function handle(req: Request): Promise<Response> {
  return (await getRequestAuth()).handler(req);
}

export const GET = handle;
export const POST = handle;
