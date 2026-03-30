import { logger } from "#log";
import { appConfig } from "#config";
import { orpc } from "#orpc";
import {
	EngineExecutionError,
	EnginePathError,
	EngineTimeoutError,
	EngineService,
	analyzePositionInputSchema,
	getBestMoveInputSchema,
} from "#services/engine";

const mapEngineError = (
	error: Error,
	errors: { BAD_REQUEST: (o: { message: string }) => Error; INTERNAL_SERVER_ERROR: (o?: { message: string }) => Error },
	context: Record<string, unknown>,
): never => {
	logger.error("Engine call failed", error, context);
	if (error instanceof EnginePathError) throw errors.BAD_REQUEST({ message: error.message });
	if (error instanceof EngineTimeoutError) throw errors.BAD_REQUEST({ message: "Engine timed out" });
	if (error instanceof EngineExecutionError) throw errors.INTERNAL_SERVER_ERROR({ message: error.message });
	throw errors.INTERNAL_SERVER_ERROR();
};

export const engineRouter = () => {
	const engineService = new EngineService(
		appConfig.engine.modelsDir,
		appConfig.engine.booksDir,
		appConfig.engine.scriptPath,
	);

	return orpc.router({
		listFiles: orpc
			.handler(async ({ errors }) => {
				const result = await engineService.listFiles();
				if (result.isErr()) {
					logger.error("Engine listFiles failed", result.error);
					throw errors.INTERNAL_SERVER_ERROR({ message: result.error.message });
				}
				return result.value;
			}),

		bestMove: orpc
			.input(getBestMoveInputSchema)
			.handler(async ({ input, errors }) => {
				const result = await engineService.getBestMove(input);
				if (result.isErr()) return mapEngineError(result.error, errors, { fen: input.fen });
				return result.value;
			}),

		analyzePosition: orpc
			.input(analyzePositionInputSchema)
			.handler(async ({ input, errors }) => {
				const result = await engineService.analyzePosition(input);
				if (result.isErr()) return mapEngineError(result.error, errors, { fen: input.fen });
				return result.value;
			}),
	});
};
