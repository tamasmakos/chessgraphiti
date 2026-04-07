import type { DB } from "@yourcompany/backend-core/db";
import type { Logger } from "@yourcompany/backend-core/log";
import type { Game } from "@yourcompany/backend-core/types";
import { typedError, validateInput } from "@yourcompany/backend-core/validation";
import { err, fromAsyncThrowable, type Result } from "neverthrow";
import { z } from "zod";

const trainingModeSchema = z.enum(["play", "learn"]);
const playerColorSchema = z.enum(["w", "b"]);

export const createGameSchema = z.object({
  userId: z.uuid(),
  openingKey: z.string().trim().min(1).max(200),
  trainingMode: trainingModeSchema,
  engineStrength: z.number().int().min(0).max(30),
  bookDepth: z.number().int().min(1).max(50),
  playerColor: playerColorSchema,
  moves: z.any().optional(),
  pgn: z.string().optional(),
});
export type CreateGameInput = z.infer<typeof createGameSchema>;
export type CreateGameResult = Result<Game, Error>;

export const saveGameSchema = z.object({
  userId: z.uuid(),
  id: z.uuid(),
  moves: z.any(),
  pgn: z.string(),
  // If omitted, we keep result/endedAt unchanged (useful for mid-game saves).
  result: z.string().nullable().optional(),
});
export type SaveGameInput = z.infer<typeof saveGameSchema>;
export type SaveGameResult = Result<Game, Error>;

export const getGameByIdSchema = z.object({
  userId: z.uuid(),
  id: z.uuid(),
});
export type GetGameByIdInput = z.infer<typeof getGameByIdSchema>;
export type GetGameByIdResult = Result<Game, Error>;

export class GameNotFoundError extends Error {
  constructor(message: string = "Game not found") {
    super(message);
    this.name = "GameNotFoundError";
  }
}

export class GameNotAuthorizedError extends Error {
  constructor(message: string = "Game not authorized") {
    super(message);
    this.name = "GameNotAuthorizedError";
  }
}

export class GameService {
  private readonly db: DB;
  private readonly logger: Logger;
  constructor(db: DB, logger: Logger) {
    this.db = db;
    this.logger = logger;
  }

  async createGame(input: CreateGameInput): Promise<CreateGameResult> {
    const validated = validateInput(createGameSchema, input);
    if (validated.isErr()) return err(validated.error);

    return await fromAsyncThrowable(
      async () => {
        const now = new Date();
        const [game] = await this.db
          .insertInto("games")
          .values({
            userId: validated.value.userId,
            openingKey: validated.value.openingKey,
            trainingMode: validated.value.trainingMode,
            engineStrength: validated.value.engineStrength,
            bookDepth: validated.value.bookDepth,
            playerColor: validated.value.playerColor,
            moves: validated.value.moves ?? [],
            pgn: validated.value.pgn ?? "",
            result: null,
            startedAt: now,
            endedAt: null,
            createdAt: now,
            updatedAt: now,
          })
          .returningAll()
          .execute();

        if (!game) {
          throw new Error("Failed to create game");
        }

        this.logger.info("Game created", { gameId: game.id });
        return game;
      },
      (e) => typedError(e),
    )();
  }

  async saveGame(input: SaveGameInput): Promise<SaveGameResult> {
    const validated = validateInput(saveGameSchema, input);
    if (validated.isErr()) return err(validated.error);

    return await fromAsyncThrowable(
      async () => {
        const existing = await this.db
          .selectFrom("games")
          .where("id", "=", validated.value.id)
          .selectAll()
          .executeTakeFirst();

        if (!existing) throw new GameNotFoundError();
        if (existing.userId !== validated.value.userId) throw new GameNotAuthorizedError();

        const patch: Partial<Game> & { updatedAt: Date } = {
          moves: validated.value.moves,
          pgn: validated.value.pgn,
          updatedAt: new Date(),
        };

        if (validated.value.result !== undefined) {
          patch.result = validated.value.result;
          patch.endedAt = validated.value.result ? patch.updatedAt : null;
        }

        const [game] = await this.db
          .updateTable("games")
          .set(patch)
          .where("id", "=", existing.id)
          .returningAll()
          .execute();

        if (!game) throw new GameNotFoundError();
        return game;
      },
      (e) => typedError(e),
    )();
  }

  async getGameById(input: GetGameByIdInput): Promise<GetGameByIdResult> {
    const validated = validateInput(getGameByIdSchema, input);
    if (validated.isErr()) return err(validated.error);

    return await fromAsyncThrowable(
      async () => {
        const game = await this.db
          .selectFrom("games")
          .where("id", "=", validated.value.id)
          .selectAll()
          .executeTakeFirst();

        if (!game) throw new GameNotFoundError();
        if (game.userId !== validated.value.userId) throw new GameNotAuthorizedError();

        return game;
      },
      (e) => typedError(e),
    )();
  }

  // Placeholder for Phase 1 later:
  // - opening_progress updates
  // - analytics / graph snapshot persistence
}
