/// <reference types="@sveltejs/kit" />

interface ImportMetaEnv {
	/** Endpoint GraphQL compatível com a API pública do AniList (POST JSON `{ query, variables }`). */
	readonly PUBLIC_METADATA_GRAPHQL_URL?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
