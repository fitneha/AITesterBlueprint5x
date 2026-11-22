export class ModelError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.name = "ModelError";
    this.status = status;
  }
}

async function assertProviderResponse(response, providerName, authenticationMessage) {
  if (response.status === 401 || response.status === 403) {
    throw new ModelError(authenticationMessage);
  }
  if (response.status === 429) {
    let detail = "";
    try {
      const body = await response.json();
      const message = body?.error?.message ?? body?.message;
      if (typeof message === "string") {
        detail = message.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 400);
      }
    } catch {
      detail = "";
    }
    const retryAfter = response.headers?.get("retry-after");
    const retryHint = /^\d+(?:\.\d+)?$/.test(retryAfter || "") ? ` Retry after ${retryAfter} seconds.` : "";
    const guidance = providerName === "Groq"
      ? "Check Groq rate limits and account quota; wait for a reset, reduce the request size, or use another configured provider."
      : "Check the provider's rate and usage limits before retrying.";
    throw new ModelError(
      `${providerName} rate limit or usage quota reached.${detail ? ` ${detail}` : ""}${retryHint} ${guidance}`,
      429
    );
  }
  if (!response.ok) {
    throw new ModelError(`${providerName} returned an unexpected response (${response.status}).`);
  }
}

async function postJson(url, options, providerName, fetchImpl) {
  let response;
  try {
    response = await fetchImpl(url, {
      ...options,
      signal: AbortSignal.timeout(90000)
    });
  } catch {
    throw new ModelError(`Could not reach ${providerName}. Check the model server and network.`);
  }
  await assertProviderResponse(
    response,
    providerName,
    `${providerName} rejected the configured credentials or model access.`
  );
  try {
    return await response.json();
  } catch {
    throw new ModelError(`${providerName} returned invalid JSON.`);
  }
}

export async function callModel(messages, provider, fetchImpl = fetch) {
  if (!provider) throw new ModelError("Configure a model provider and model in the repository-root .env.", 503);
  let data;
  if (provider.provider === "groq") {
    data = await postJson("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${provider.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: provider.model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages
      })
    }, "Groq", fetchImpl);
    const text = data.choices?.[0]?.message?.content;
    return parseJsonText(text, "Groq");
  }

  let baseUrl;
  try {
    baseUrl = new URL(provider.baseUrl);
  } catch {
    throw new ModelError("OLLAMA_URL is not a valid URL.", 503);
  }
  if (!["http:", "https:"].includes(baseUrl.protocol) || baseUrl.username || baseUrl.password) {
    throw new ModelError("OLLAMA_URL must be an HTTP(S) URL without embedded credentials.", 503);
  }
  data = await postJson(`${provider.baseUrl.replace(/\/+$/, "")}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: provider.model,
      messages,
      stream: false,
      format: "json",
      options: { temperature: 0 }
    })
  }, "Ollama", fetchImpl);
  return parseJsonText(data.message?.content, "Ollama");
}

function parseJsonText(text, provider) {
  if (typeof text !== "string" || !text.trim()) {
    throw new ModelError(`${provider} returned an empty response.`);
  }
  const clean = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(clean);
  } catch {
    throw new ModelError(`${provider} returned malformed structured output. Retry the request or check the configured model.`);
  }
}

export async function testModelConnection(provider, fetchImpl = fetch) {
  if (!provider) throw new ModelError("The selected model provider is not configured.", 503);
  const isGroq = provider.provider === "groq";
  const url = isGroq
    ? "https://api.groq.com/openai/v1/models"
    : `${provider.baseUrl.replace(/\/+$/, "")}/api/tags`;
  let response;
  try {
    response = await fetchImpl(url, {
      headers: isGroq ? { Authorization: `Bearer ${provider.apiKey}` } : {},
      signal: AbortSignal.timeout(15000)
    });
  } catch {
    throw new ModelError(`Could not reach ${isGroq ? "Groq" : "Ollama"}.`);
  }
  const providerName = isGroq ? "Groq" : "Ollama";
  await assertProviderResponse(response, providerName, `${providerName} rejected the configured credentials.`);
  return { message: `${isGroq ? "Groq" : "Ollama"} connection successful.` };
}
