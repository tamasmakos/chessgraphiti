import { getDB } from "@yourcompany/backend-core/db";
import { logger } from "#log";
import { authOnly } from "#middleware";
import { orpc } from "#orpc";
import {
  ExportNotAuthorizedError,
  ExportNotFoundError,
  ExportService,
  enqueueExportSchema,
  getExportByIdSchema,
} from "#services/export";

export const exportsRouter = () => {
  const exportService = new ExportService(getDB(), logger);

  return orpc.router({
    enqueue: orpc
      .use(authOnly)
      .input(enqueueExportSchema.omit({ userId: true }))
      .handler(async ({ context, input, errors }) => {
        const result = await exportService.enqueueExport({
          userId: context.user.id,
          gameId: input.gameId,
          fps: input.fps,
          pgn: input.pgn,
          moves: input.moves,
          overlays: input.overlays,
        });

        if (result.isErr()) {
          logger.error("Failed to enqueue export", result.error, {
            userId: context.user.id,
            input,
          });

          if (result.error instanceof ExportNotAuthorizedError) throw errors.FORBIDDEN();
          throw errors.BAD_REQUEST();
        }

        return result.value;
      }),

    get: {
      byId: orpc
        .use(authOnly)
        .input(getExportByIdSchema.omit({ userId: true }))
        .handler(async ({ context, input, errors }) => {
          const result = await exportService.getExportById({
            userId: context.user.id,
            id: input.id,
          });

          if (result.isErr()) {
            logger.error("Failed to get export by id", result.error, {
              userId: context.user.id,
              input,
            });

            if (result.error instanceof ExportNotFoundError) throw errors.NOT_FOUND();
            if (result.error instanceof ExportNotAuthorizedError) throw errors.FORBIDDEN();
            throw errors.INTERNAL_SERVER_ERROR();
          }

          return result.value;
        }),
    },
  });
};
