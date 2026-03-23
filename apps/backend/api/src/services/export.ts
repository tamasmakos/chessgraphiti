import { type Result, err, fromAsyncThrowable } from "neverthrow";
import { z } from "zod";

import type { DB } from "@yourcompany/backend-core/db";
import type { Logger } from "@yourcompany/backend-core/log";
import type { ExportJob } from "@yourcompany/backend-core/types";
import { typedError, validateInput } from "@yourcompany/backend-core/validation";

export const enqueueExportSchema = z.object({
	userId: z.uuid(),
	// We allow `gameId` to be omitted for MVP export flows that only have PGN.
	gameId: z.uuid().optional().nullable(),
	fps: z.number().int().min(1).max(60),
	// For MVP we store export payload in `overlays` jsonb so the worker can
	// reconstruct the timeline later.
	pgn: z.string().optional(),
	moves: z.any().optional(),
	overlays: z.any().optional(),
});
export type EnqueueExportInput = z.infer<typeof enqueueExportSchema>;
export type EnqueueExportResult = Result<ExportJob, Error>;

export const getExportByIdSchema = z.object({
	userId: z.uuid(),
	id: z.uuid(),
});
export type GetExportByIdInput = z.infer<typeof getExportByIdSchema>;
export type GetExportByIdResult = Result<ExportJob, Error>;

export class ExportNotFoundError extends Error {
	constructor(message: string = "Export not found") {
		super(message);
		this.name = "ExportNotFoundError";
	}
}

export class ExportNotAuthorizedError extends Error {
	constructor(message: string = "Export not authorized") {
		super(message);
		this.name = "ExportNotAuthorizedError";
	}
}

export class ExportService {
	private readonly db: DB;
	private readonly logger: Logger;
	constructor(db: DB, logger: Logger) {
		this.db = db;
		this.logger = logger;
	}

	async enqueueExport(input: EnqueueExportInput): Promise<EnqueueExportResult> {
		const validated = validateInput(enqueueExportSchema, input);
		if (validated.isErr()) return err(validated.error);

		return await fromAsyncThrowable(
			async () => {
				const now = new Date();

				// Optional: enforce tenancy when `gameId` is provided.
				if (validated.value.gameId) {
					const game = await this.db
						.selectFrom("games")
						.where("id", "=", validated.value.gameId)
						.select(["id", "userId"])
						.executeTakeFirst();

					if (!game || game.userId !== validated.value.userId) {
						throw new ExportNotAuthorizedError();
					}
				}

				const overlays = {
					fps: validated.value.fps,
					pgn: validated.value.pgn ?? "",
					moves: validated.value.moves ?? [],
					overlaysConfig: validated.value.overlays ?? {},
				};

				const [job] = await this.db
					.insertInto("exports")
					.values({
						userId: validated.value.userId,
						gameId: validated.value.gameId ?? null,
						status: "queued",
						fps: validated.value.fps,
						overlays,
						url: null,
						thumbnailUrl: null,
						error: null,
						createdAt: now,
						updatedAt: now,
					})
					.returningAll()
					.execute();

				if (!job) throw new Error("Failed to enqueue export");

				// "Worker" simulation: process in the background (MVP).
				void this.processExport(job.id).catch((e) => {
					this.logger.error("Export worker failed", e);
				});

				return job;
			},
			(e) => typedError(e),
		)();
	}

	async getExportById(input: GetExportByIdInput): Promise<GetExportByIdResult> {
		const validated = validateInput(getExportByIdSchema, input);
		if (validated.isErr()) return err(validated.error);

		return await fromAsyncThrowable(
			async () => {
				const job = await this.db
					.selectFrom("exports")
					.where("id", "=", validated.value.id)
					.selectAll()
					.executeTakeFirst();

				if (!job) throw new ExportNotFoundError();
				if (job.userId !== validated.value.userId) throw new ExportNotAuthorizedError();

				return job;
			},
			(e) => typedError(e),
		)();
	}

	private async processExport(exportId: string): Promise<void> {
		const start = new Date();
		this.logger.info("Processing export", { exportId, start });

		// Mark as processing.
		await this.db
			.updateTable("exports")
			.set({
				status: "processing",
				updatedAt: new Date(),
			})
			.where("id", "=", exportId)
			.execute();

		// Simulate expensive headless rendering.
		await new Promise((r) => setTimeout(r, 1200));

		const url = `https://example.com/exports/${exportId}.mp4`;

		await this.db
			.updateTable("exports")
			.set({
				status: "completed",
				url,
				thumbnailUrl: null,
				error: null,
				updatedAt: new Date(),
			})
			.where("id", "=", exportId)
			.execute();
	}
}

