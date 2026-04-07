import { z } from "zod";
import { orpc } from "#orpc";
import { getDB } from "@yourcompany/backend-core/db";
import { GraphSnapshotSchema } from "@yourcompany/chess/types";

export const graphRouter = () =>
  orpc.router({
    getSnapshot: orpc
      .input(z.object({
        temporalGraphId: z.string().uuid(),
        ply: z.number().int().min(0),
      }))
      .output(GraphSnapshotSchema)
      .handler(async ({ input }) => {
        const db = getDB();

        const nodes = await db
          .selectFrom("graphNodes")
          .selectAll()
          .where("temporalGraphId", "=", input.temporalGraphId)
          .where("ply", "=", input.ply)
          .execute();

        const edges = await db
          .selectFrom("graphEdges")
          .selectAll()
          .where("temporalGraphId", "=", input.temporalGraphId)
          .where("ply", "=", input.ply)
          .execute();

        // Map database fields back to Zod schema expected by client
        return {
          nodes: nodes.map(n => ({
            square: n.square,
            type: n.pieceType as any,
            color: n.color as any,
            value: n.pieceValue,
            communityId: n.communityId ?? 0,
            centralityBetweenness: n.centralityBetweenness ?? 0,
            centralityDegree: n.centralityDegree ?? 0,
            centralityWeighted: n.centralityWeighted ?? 0,
            centralityCloseness: n.centralityCloseness ?? 0,
            centralityPageRank: n.centralityPageRank ?? 0,
          })),
          edges: edges.map(e => ({
            from: e.fromSquare,
            to: e.toSquare,
            weight: e.weight,
            type: e.edgeType as any,
          })),
          metadata: {
            fen: "", // Fen and ply info would ideally be stored in TemporalGraphs or derived
            ply: input.ply,
          }
        };
      }),

    createSnapshot: orpc
      .input(z.object({
        temporalGraphId: z.string().uuid(),
        ply: z.number().int().min(0),
        snapshot: GraphSnapshotSchema,
      }))
      .handler(async ({ input }) => {
        const db = getDB();

        await db.transaction().execute(async (trx) => {
          // Insert nodes
          if (input.snapshot.nodes.length > 0) {
            await trx.insertInto("graphNodes")
              .values(input.snapshot.nodes.map(n => ({
                temporalGraphId: input.temporalGraphId,
                ply: input.ply,
                square: n.square,
                pieceType: n.type,
                color: n.color,
                pieceValue: n.value,
                communityId: n.communityId,
                centralityDegree: n.centralityDegree,
                centralityWeighted: n.centralityWeighted,
                centralityBetweenness: n.centralityBetweenness,
                centralityCloseness: n.centralityCloseness,
                centralityPageRank: n.centralityPageRank,
              })))
              .execute();
          }

          // Insert edges
          if (input.snapshot.edges.length > 0) {
            await trx.insertInto("graphEdges")
              .values(input.snapshot.edges.map(e => ({
                temporalGraphId: input.temporalGraphId,
                ply: input.ply,
                fromSquare: e.from,
                toSquare: e.to,
                edgeType: e.type,
                weight: e.weight,
              })))
              .execute();
          }
        });

        return { success: true };
      }),
  });
