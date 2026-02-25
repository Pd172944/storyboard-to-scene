import { initTRPC } from "@trpc/server";
import superjson from "superjson";

/**
 * tRPC context — available in every procedure.
 * Can be extended with session, user, etc. in future phases.
 */
export interface TRPCContext {
  // Placeholder for future auth context
}

export async function createTRPCContext(): Promise<TRPCContext> {
  return {};
}

const t = initTRPC.context<TRPCContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;
export const createCallerFactory = t.createCallerFactory;
