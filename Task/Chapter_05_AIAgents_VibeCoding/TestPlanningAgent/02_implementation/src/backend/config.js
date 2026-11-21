import { existsSync } from "node:fs";
import { dirname, parse, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

function findEnvFile(startDirectory = dirname(fileURLToPath(import.meta.url))) {
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

function getProviderConfig(provider, env = process.env) {
  if (provider === "groq") {
    return {
      provider,
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
    provider,
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
  const jiraMissing = [
    ...(!env.JIRA_BASE_URL ? ["JIRA_BASE_URL"] : []),
    ...(!env.JIRA_EMAIL ? ["JIRA_EMAIL"] : []),
    ...(!env.JIRA_TOKEN ? ["JIRA_TOKEN"] : [])
  ];
  const providers = {
    groq: getProviderConfig("groq", env),
    ollama: getProviderConfig("ollama", env)
  };
  const requestedProvider = (env.LLM_PROVIDER || "").trim().toLowerCase();
  const readyProviders = Object.values(providers).filter((provider) => provider.configured);

  let provider = null;
  let providerError = null;
  if (requestedProvider) {
    if (!["groq", "ollama"].includes(requestedProvider)) {
      providerError = "LLM_PROVIDER must be either groq or ollama.";
    } else if (providers[requestedProvider].configured) {
      provider = providers[requestedProvider];
    }
  } else if (readyProviders.length === 1) {
    provider = readyProviders[0];
  } else if (readyProviders.length > 1) {
    providerError = "Set LLM_PROVIDER because both model providers are configured.";
  }

  return {
    jira: {
      baseUrl: env.JIRA_BASE_URL || "",
      email: env.JIRA_EMAIL || "",
      token: env.JIRA_TOKEN || "",
      missing: jiraMissing
    },
    providers,
    provider,
    providerError,
    port: Number.parseInt(env.PORT || "3001", 10)
  };
}

export function getPublicConfig(config = getRuntimeConfig()) {
  return {
    jira: {
      baseUrl: config.jira.baseUrl,
      email: config.jira.email,
      configured: config.jira.missing.length === 0,
      tokenConfigured: Boolean(config.jira.token),
      missing: config.jira.missing
    },
    providers: Object.fromEntries(
      Object.entries(config.providers).map(([name, provider]) => [
        name,
        { configured: provider.configured, model: provider.model, missing: provider.missing }
      ])
    ),
    activeProvider: config.provider?.provider || null,
    providerError: config.providerError
  };
}

export { findEnvFile };
