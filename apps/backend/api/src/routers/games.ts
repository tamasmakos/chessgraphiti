import { getDB } from "@yourcompany/backend-core/db";
import { logger } from "#log";
import { orpc } from "#orpc";
import { authOnly } from "#middleware";
import {
	createGameSchema,
	GameNotAuthorizedError,
	GameNotFoundError,
	GameService,
	getGameByIdSchema,
	saveGameSchema,
} from "#services/game";

export const gamesRouter = () => {
	const gameService = new GameService(getDB(), logger);

	return orpc.router({
		create: orpc
			.use(authOnly)
			.input(createGameSchema.omit({ userId: true }))
			.handler(async ({ context, input, errors }) => {
				const result = await gameService.createGame({
					// Auth middleware guarantees user existence
					userId: context.user.id,
					openingKey: input.openingKey,
					trainingMode: input.trainingMode,
					engineStrength: input.engineStrength,
					bookDepth: input.bookDepth,
					playerColor: input.playerColor,
					moves: input.moves,
					pgn: input.pgn,
				});

				if (result.isErr()) {
					logger.error("Failed to create game", result.error, { input, userId: context.user.id });

					if (result.error instanceof GameNotAuthorizedError) throw errors.FORBIDDEN();
					throw errors.BAD_REQUEST();
				}

				return result.value;
			}),

		save: orpc
			.use(authOnly)
			.input(saveGameSchema.omit({ userId: true }))
			.handler(async ({ context, input, errors }) => {
				const result = await gameService.saveGame({
					userId: context.user.id,
					id: input.id,
					moves: input.moves,
					pgn: input.pgn,
					result: input.result,
				});

				if (result.isErr()) {
					logger.error("Failed to save game", result.error, { input, userId: context.user.id });

					if (result.error instanceof GameNotFoundError) throw errors.NOT_FOUND();
					if (result.error instanceof GameNotAuthorizedError) throw errors.FORBIDDEN();
					throw errors.BAD_REQUEST();
				}

				return result.value;
			}),

		get: {
			byId: orpc
				.use(authOnly)
				.input(getGameByIdSchema.omit({ userId: true }))
				.handler(async ({ context, input, errors }) => {
					const result = await gameService.getGameById({
						userId: context.user.id,
						id: input.id,
					});

					if (result.isErr()) {
						logger.error("Failed to get game", result.error, { input, userId: context.user.id });

						if (result.error instanceof GameNotFoundError) throw errors.NOT_FOUND();
						if (result.error instanceof GameNotAuthorizedError) throw errors.FORBIDDEN();
						throw errors.BAD_REQUEST();
					}

					return result.value;
				}),
		},
	});
};

