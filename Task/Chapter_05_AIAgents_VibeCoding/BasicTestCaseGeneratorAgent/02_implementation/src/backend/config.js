import { existsSync } from "node:fs";
import { dirname, parse, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

export function findEnvFile(startDirectory = dirname(fileURLToPath(import.meta.url))) {
  let directory = resolve(startDirectory);

  while (true) {
    const candidate = resolve(directory, ".env");
    if (existsSync(candidate)) return candidate;

    const parent = dirname(directory);
    if (parent === directory || directory === parse(directory).root) return null;
    directory = parent;
  }
}

const envFile = findEnvFile();
if (envFile) dotenv.config({ path: envFile });

function providerConfig(name, env) {
  if (name === "groq") {
    return {
      provider: name,
      configured: Boolean(env.GROQ_API_KEY && env.GROQ_MODEL),
      model: env.GROQ_MODEL || "",
      apiKey: env.GROQ_API_KEY || "",
      missing: [
        ...(!env.GROQ_API_KEY ? ["GROQ_API_KEY"] : []),
        ...(!env.GROQ_MODEL ? ["GROQ_MODEL"] : [])
      ]
    };
  }
  return {
    provider: name,
    configured: Boolean(env.OLLAMA_URL && env.OLLAMA_MODEL),
    model: env.OLLAMA_MODEL || "",
    baseUrl: env.OLLAMA_URL || "",
    missing: [
      ...(!env.OLLAMA_URL ? ["OLLAMA_URL"] : []),
      ...(!env.OLLAMA_MODEL ? ["OLLAMA_MODEL"] : [])
    ]
  };
}

export function getRuntimeConfig(env = process.env) {
  const providers = {
    groq: providerConfig("groq", env),
    ollama: providerConfig("ollama", env)
  };
  const readyProviders = Object.values(providers).filter(({ configured }) => configured);
  const requested = (env.LLM_PROVIDER || "").trim().toLowerCase();
  let provider = null;
  let providerError = null;

  if (requested) {
    if (!["groq", "ollama"].includes(requested)) {
      providerError = "LLM_PROVIDER must be either groq or ollama.";
    } else if (providers[requested].configured) {
      provider = providers[requested];
    } else {
      providerError = `The selected model provider is missing configuration: ${providers[requested].missing.join(", ")}.`;
    }
  } else if (readyProviders.length === 1) {
    provider = readyProviders[0];
  } else if (readyProviders.length > 1) {
    providerError = "Set LLM_PROVIDER because both model providers are configured.";
  }

  const jiraMissing = [
    ...(!env.JIRA_BASE_URL ? ["JIRA_BASE_URL"] : []),
    ...(!env.JIRA_EMAIL ? ["JIRA_EMAIL"] : []),
    ...(!env.JIRA_TOKEN ? ["JIRA_TOKEN"] : [])
  ];
  const requestedPort = Number.parseInt(env.AI_TEST_CASE_GENERATOR_PORT || "3003", 10);
  const requestedUploadMb = Number.parseInt(env.MAX_UPLOAD_MB || "8", 10);

  return {
    providers,
    provider,
    providerError,
    jira: {
      baseUrl: (env.JIRA_BASE_URL || "").replace(/\/+$/, ""),
      email: env.JIRA_EMAIL || "",
      token: env.JIRA_TOKEN || "",
      missing: jiraMissing
    },
    connectors: {
      google: Boolean(env.GOOGLE_ACCESS_TOKEN),
      notion: Boolean(env.NOTION_TOKEN),
      sharepoint: Boolean(env.MS_GRAPH_ACCESS_TOKEN)
    },
    googleAccessToken: env.GOOGLE_ACCESS_TOKEN || "",
    notionToken: env.NOTION_TOKEN || "",
    graphAccessToken: env.MS_GRAPH_ACCESS_TOKEN || "",
    documentAllowedHosts: (env.DOCUMENT_ALLOWED_HOSTS || "")
      .split(",")
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean),
    port: Number.isInteger(requestedPort) && requestedPort > 0 && requestedPort <= 65535 ? requestedPort : 3003,
    maxUploadBytes: (Number.isInteger(requestedUploadMb) && requestedUploadMb > 0
      ? Math.min(requestedUploadMb, 50)
      : 8) * 1024 * 1024
  };
}

export function getPublicConfig(config = getRuntimeConfig()) {
  return {
    jira: {
      configured: config.jira.missing.length === 0,
      baseUrl: config.jira.baseUrl,
      email: config.jira.email,
      missing: config.jira.missing
    },
    providers: Object.fromEntries(
      Object.entries(config.providers).map(([name, value]) => [
        name,
        { configured: value.configured, model: value.model, missing: value.missing }
      ])
    ),
    activeProvider: config.provider?.provider || null,
    providerError: config.providerError,
    connectors: config.connectors
  };
}
