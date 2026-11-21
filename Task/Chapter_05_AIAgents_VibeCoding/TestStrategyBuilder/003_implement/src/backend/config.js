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

function providerConfig(provider, env) {
  if (provider === "groq") {
    const missing = [
      ...(!env.GROQ_API_KEY ? ["GROQ_API_KEY"] : []),
      ...(!env.GROQ_MODEL ? ["GROQ_MODEL"] : [])
    ];
    return {
      provider,
      apiKey: env.GROQ_API_KEY || "",
      model: env.GROQ_MODEL || "",
      configured: missing.length === 0,
      missing
    };
  }

  const missing = [
    ...(!env.OLLAMA_URL ? ["OLLAMA_URL"] : []),
    ...(!env.OLLAMA_MODEL ? ["OLLAMA_MODEL"] : [])
  ];
  return {
    provider,
    baseUrl: env.OLLAMA_URL || "",
    model: env.OLLAMA_MODEL || "",
    configured: missing.length === 0,
    missing
  };
}

export function getRuntimeConfig(env = process.env) {
  const jiraMissing = [
    ...(!env.JIRA_BASE_URL ? ["JIRA_BASE_URL"] : []),
    ...(!env.JIRA_EMAIL ? ["JIRA_EMAIL"] : []),
    ...(!env.JIRA_TOKEN ? ["JIRA_TOKEN"] : [])
  ];
  const providers = {
    groq: providerConfig("groq", env),
    ollama: providerConfig("ollama", env)
  };
  const requestedProvider = (env.LLM_PROVIDER || "").trim().toLowerCase();
  const readyProviders = Object.values(providers).filter((item) => item.configured);
  let activeProvider = null;
  let providerError = null;

  if (requestedProvider) {
    if (!["groq", "ollama"].includes(requestedProvider)) {
      providerError = "LLM_PROVIDER must be either groq or ollama.";
    } else if (providers[requestedProvider].configured) {
      activeProvider = providers[requestedProvider];
    }
  } else if (readyProviders.length === 1) {
    activeProvider = readyProviders[0];
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
    activeProvider,
    providerError,
    port: Number.parseInt(env.TEST_STRATEGY_PORT || "3002", 10)
  };
}

export function getPublicConfig(config = getRuntimeConfig()) {
  return {
    jiraConfigured: config.jira.missing.length === 0,
    jiraMissing: config.jira.missing,
    providers: Object.fromEntries(
      Object.entries(config.providers).map(([name, item]) => [
        name,
        { configured: item.configured, model: item.model, missing: item.missing }
      ])
    ),
    activeProvider: config.activeProvider?.provider || null,
    providerError: config.providerError
  };
}
