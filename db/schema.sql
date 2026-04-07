CREATE TABLE users (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	name text NOT NULL,
	email text NOT NULL,
	email_verified boolean NOT NULL,
  created_at timestamp NOT NULL,
	updated_at timestamp NOT NULL,
	CONSTRAINT users_email_unique UNIQUE(email)
);

CREATE TABLE accounts (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	account_id uuid NOT NULL,
	provider_id text NOT NULL,
	user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	access_token text,
	refresh_token text,
	id_token text,
	access_token_expires_at timestamp,
	refresh_token_expires_at timestamp,
	scope text,
	password text,
	created_at timestamp NOT NULL,
	updated_at timestamp NOT NULL
);

CREATE TABLE sessions (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	expires_at timestamp NOT NULL,
	token text NOT NULL,
	created_at timestamp NOT NULL,
	updated_at timestamp NOT NULL,
	ip_address text,
	user_agent text,
	user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	CONSTRAINT sessions_token_unique UNIQUE(token)
);

CREATE TABLE verifications (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	identifier text NOT NULL,
	value text NOT NULL,
	expires_at timestamp NOT NULL,
	created_at timestamp,
	updated_at timestamp
);

-- ---------------------------------------------------------------------------
-- Chess domain (MVP persistence)
-- ---------------------------------------------------------------------------

-- A persisted chess game for a user. Stores PGN + lightweight move JSON so
-- the client can replay immediately without recomputing from scratch.
CREATE TABLE games (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	opening_key text NOT NULL DEFAULT 'custom',
	training_mode text NOT NULL DEFAULT 'play', -- 'play' | 'learn'
	engine_strength int NOT NULL DEFAULT 10,
	book_depth int NOT NULL DEFAULT 20,
	player_color text NOT NULL DEFAULT 'w', -- 'w' | 'b'
	moves jsonb NOT NULL DEFAULT '[]'::jsonb,
	pgn text NOT NULL DEFAULT '',
	result text,
	started_at timestamp NOT NULL DEFAULT NOW(),
	ended_at timestamp NULL,
	created_at timestamp NOT NULL DEFAULT NOW(),
	updated_at timestamp NOT NULL DEFAULT NOW()
);

CREATE INDEX games_user_id_idx ON games(user_id);
CREATE INDEX games_opening_key_idx ON games(opening_key);

-- Tracks learning progress for an opening line. We store a `san_path`
-- representing the sequence of SAN moves that has been completed up to
-- (and including) `max_step_completed`.
CREATE TABLE opening_progress (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	opening_key text NOT NULL,
	san_path text NOT NULL,
	max_step_completed int NOT NULL DEFAULT 0,
	completed boolean NOT NULL DEFAULT false,
	last_played_at timestamp NULL,
	created_at timestamp NOT NULL DEFAULT NOW(),
	updated_at timestamp NOT NULL DEFAULT NOW(),
	CONSTRAINT opening_progress_user_opening_san_path_unique UNIQUE (user_id, opening_key, san_path)
);

CREATE INDEX opening_progress_user_id_idx ON opening_progress(user_id);

-- Content-export jobs (reels). Worker will update `status` + write output URLs.
CREATE TABLE exports (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	game_id uuid REFERENCES games(id) ON DELETE CASCADE,
	status text NOT NULL DEFAULT 'queued', -- 'queued' | 'processing' | 'completed' | 'failed'
	fps int NOT NULL DEFAULT 12,
	overlays jsonb NOT NULL DEFAULT '{}'::jsonb,
	url text,
	thumbnail_url text,
	error text,
	created_at timestamp NOT NULL DEFAULT NOW(),
	updated_at timestamp NOT NULL DEFAULT NOW()
);

CREATE INDEX exports_user_id_idx ON exports(user_id);
CREATE INDEX exports_game_id_idx ON exports(game_id);

-- ---------------------------------------------------------------------------
-- Graph Theory & Temporal Analysis
-- ---------------------------------------------------------------------------

-- Temporal Graphs represent a series of graph snapshots over time (e.g., a game).
CREATE TABLE temporal_graphs (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	game_id uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
	created_at timestamp NOT NULL DEFAULT NOW(),
	updated_at timestamp NOT NULL DEFAULT NOW()
);

CREATE INDEX temporal_graphs_game_id_idx ON temporal_graphs(game_id);

-- Graph Nodes (Pieces)
CREATE TABLE graph_nodes (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	temporal_graph_id uuid NOT NULL REFERENCES temporal_graphs(id) ON DELETE CASCADE,
	ply int NOT NULL, -- The half-move number this node belongs to
	square text NOT NULL, -- e.g. 'e4'
	piece_type text NOT NULL, -- p, n, b, r, q, k
	color text NOT NULL, -- w, b
	piece_value float NOT NULL,
	community_id int,
	centrality_degree float,
	centrality_weighted float,
	centrality_betweenness float,
	centrality_closeness float,
	centrality_pagerank float,
	created_at timestamp NOT NULL DEFAULT NOW()
);

CREATE INDEX graph_nodes_temporal_graph_id_ply_idx ON graph_nodes(temporal_graph_id, ply);

-- Graph Edges (Interactions: Attacks/Defenses)
CREATE TABLE graph_edges (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	temporal_graph_id uuid NOT NULL REFERENCES temporal_graphs(id) ON DELETE CASCADE,
	ply int NOT NULL,
	from_square text NOT NULL,
	to_square text NOT NULL,
	edge_type text NOT NULL, -- 'attack' | 'defense'
	weight float NOT NULL,
	created_at timestamp NOT NULL DEFAULT NOW()
);

CREATE INDEX graph_edges_temporal_graph_id_ply_idx ON graph_edges(temporal_graph_id, ply);
