// src/index.ts
import { config as loadDotenv } from "dotenv";
import { Command as Command10 } from "commander";

// src/commands/login.ts
import { Command } from "commander";

// src/lib/auth-flow.ts
import { hostname, platform, release } from "os";

// src/lib/api-client.ts
import axios from "axios";

// src/lib/config.ts
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from "fs";
import { join as join2 } from "path";

// src/lib/constants.ts
import { join } from "path";
import { homedir } from "os";
var CONFIG_DIR_NAME = ".shyft";
var CONFIG_FILE_NAME = "config.json";
var DEFAULT_API_URL = "https://api.shyft.dev";
var EXIT_CODES = {
  SUCCESS: 0,
  GENERAL_ERROR: 1,
  AUTH_REQUIRED: 2,
  AUTH_FAILED: 3,
  API_ERROR: 4,
  VALIDATION_ERROR: 5,
  TIMEOUT: 6
};
function getDefaultConfigDir() {
  return process.env.SHYFT_CONFIG_DIR || join(homedir(), CONFIG_DIR_NAME);
}

// src/lib/config.ts
function createConfigManager(configDir) {
  const dir = configDir ?? getDefaultConfigDir();
  const configPath = join2(dir, CONFIG_FILE_NAME);
  function ensureDir() {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true, mode: 448 });
    }
  }
  function loadConfig() {
    if (!existsSync(configPath)) return {};
    try {
      const content = readFileSync(configPath, "utf-8");
      return JSON.parse(content);
    } catch {
      return {};
    }
  }
  function saveConfig(config) {
    ensureDir();
    writeFileSync(configPath, JSON.stringify(config, null, 2), {
      encoding: "utf-8",
      mode: 384
    });
  }
  function updateConfig(partial) {
    const current = loadConfig();
    const updated = { ...current, ...partial };
    saveConfig(updated);
    return updated;
  }
  function clearConfig() {
    if (existsSync(configPath)) {
      unlinkSync(configPath);
    }
  }
  function isAuthenticated() {
    const config = loadConfig();
    return !!(config.accessToken || config.apiKey);
  }
  function getAuthHeader() {
    const config = loadConfig();
    const token = config.accessToken || config.apiKey;
    return token ? `Bearer ${token}` : null;
  }
  return { loadConfig, saveConfig, updateConfig, clearConfig, isAuthenticated, getAuthHeader };
}
var defaultManager;
function getConfigManager() {
  if (!defaultManager) {
    defaultManager = createConfigManager();
  }
  return defaultManager;
}

// src/lib/api-client.ts
var ApiClientError = class extends Error {
  code;
  status;
  details;
  constructor(message, code, status, details) {
    super(message);
    this.name = "ApiClientError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
};
function getApiUrl() {
  const config = getConfigManager().loadConfig();
  return config.apiUrl || process.env.SHYFT_API_URL || DEFAULT_API_URL;
}
function createApiClient(requireAuth = true) {
  const baseURL = getApiUrl();
  const client = axios.create({
    baseURL,
    timeout: 3e4,
    headers: { "Content-Type": "application/json" }
  });
  if (requireAuth) {
    client.interceptors.request.use((requestConfig) => {
      const mgr = getConfigManager();
      if (!mgr.isAuthenticated()) {
        throw new ApiClientError(
          "Not authenticated. Run `shyft login` first.",
          "auth_required",
          401
        );
      }
      const authHeader = mgr.getAuthHeader();
      if (authHeader) {
        requestConfig.headers.Authorization = authHeader;
      }
      return requestConfig;
    });
  }
  client.interceptors.response.use(
    (response) => response,
    (err) => {
      if (err.response) {
        const { status, data } = err.response;
        const apiError = data?.error;
        throw new ApiClientError(
          apiError?.message || err.message,
          apiError?.code || "api_error",
          status,
          apiError?.details
        );
      }
      if (err.code === "ECONNREFUSED") {
        throw new ApiClientError("Could not connect to Shyft API", "connection_error");
      }
      if (err.code === "ETIMEDOUT") {
        throw new ApiClientError("Request timed out", "timeout");
      }
      throw new ApiClientError(err.message || "Unknown error", "unknown_error");
    }
  );
  return client;
}
function getPublicApiClient() {
  return createApiClient(false);
}
function getApiClient() {
  return createApiClient(true);
}

// src/utils/open-browser.ts
async function openBrowser(url) {
  const open = await import("open");
  await open.default(url);
}

// src/utils/spinner.ts
import ora from "ora";

// src/utils/output.ts
var jsonMode = false;
function setJsonMode(enabled) {
  jsonMode = enabled;
}
function isJsonMode() {
  return jsonMode;
}
function output(data) {
  if (jsonMode) {
    console.log(JSON.stringify(data, null, 2));
  } else if (typeof data === "string") {
    console.log(data);
  } else {
    console.log(JSON.stringify(data, null, 2));
  }
}
function success(message) {
  if (!jsonMode) {
    console.log(`\u2713 ${message}`);
  }
}
function error(message) {
  if (jsonMode) {
    console.error(JSON.stringify({ error: message }));
  } else {
    console.error(`\u2717 ${message}`);
  }
}
function info(message) {
  if (!jsonMode) {
    console.log(message);
  }
}

// src/utils/spinner.ts
var currentSpinner = null;
function startSpinner(text) {
  if (isJsonMode()) return null;
  currentSpinner = ora(text).start();
  return currentSpinner;
}
function updateSpinner(text) {
  if (currentSpinner) {
    currentSpinner.text = text;
  }
}
function succeedSpinner(text) {
  if (currentSpinner) {
    currentSpinner.succeed(text);
    currentSpinner = null;
  }
}
function failSpinner(text) {
  if (currentSpinner) {
    currentSpinner.fail(text);
    currentSpinner = null;
  }
}

// src/lib/auth-flow.ts
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
async function runBrowserAuthFlow() {
  const client = getPublicApiClient();
  const mgr = getConfigManager();
  try {
    startSpinner("Creating auth session...");
    const { data: session } = await client.post("/cli-auth/sessions", {
      cliVersion: "0.4.5",
      os: `${platform()} ${release()}`,
      hostname: hostname()
    });
    updateSpinner("Waiting for browser authorization...");
    try {
      await openBrowser(session.authUrl);
      info(`
Opened browser to: ${session.authUrl}`);
    } catch {
      info(`
Please open this URL in your browser:
${session.authUrl}`);
    }
    info(`
Session code: ${session.sessionCode}`);
    info("Waiting for authorization...\n");
    const timeoutMs = 3e5;
    const intervalMs = 2e3;
    const startTime = Date.now();
    let attempt = 0;
    while (Date.now() - startTime < timeoutMs) {
      attempt++;
      if (attempt % 10 === 0) {
        updateSpinner(`Waiting for authorization... (${Math.floor((Date.now() - startTime) / 1e3)}s)`);
      }
      try {
        const { data: pollResponse } = await client.get("/cli-auth/sessions/poll", {
          params: { token: session.pollToken }
        });
        if (pollResponse.status === "approved" && pollResponse.apiKey) {
          await client.post("/cli-auth/sessions/claim", {
            pollToken: session.pollToken
          });
          mgr.updateConfig({
            apiKey: pollResponse.apiKey,
            userId: pollResponse.userId,
            email: pollResponse.email,
            teamId: pollResponse.teamId,
            teamName: pollResponse.teamName
          });
          succeedSpinner("Authenticated successfully!");
          success(`Logged in as ${pollResponse.email}`);
          return { success: true };
        }
        if (pollResponse.status === "expired") {
          failSpinner("Session expired");
          return { success: false, error: "Session expired. Please try again." };
        }
      } catch (err) {
        failSpinner("Authorization failed");
        const message = err instanceof Error ? err.message : "Unknown error";
        return { success: false, error: message };
      }
      await sleep(intervalMs);
    }
    failSpinner("Authorization timed out");
    return { success: false, error: "Session timed out. Please try again." };
  } catch (err) {
    failSpinner("Failed to start auth flow");
    const message = err instanceof Error ? err.message : "Unknown error";
    return { success: false, error: message };
  }
}
async function runApiKeyAuthFlow(apiKey) {
  const client = getPublicApiClient();
  const mgr = getConfigManager();
  try {
    startSpinner("Validating API key...");
    const { data } = await client.get(
      "/auth/me",
      { headers: { Authorization: `Bearer ${apiKey}` } }
    );
    mgr.updateConfig({
      apiKey,
      userId: data.userId,
      email: data.email,
      teamId: data.teamId,
      teamName: data.teamName
    });
    succeedSpinner("API key validated!");
    success(`Logged in as ${data.email}`);
    return { success: true };
  } catch (err) {
    failSpinner("Invalid API key");
    const message = err instanceof Error ? err.message : "Unknown error";
    return { success: false, error: message };
  }
}

// src/commands/login.ts
var loginCommand = new Command("login").description("Authenticate with the Shyft platform").option("--api-key <key>", "Authenticate with an API key (for CI/scripts)").option("--no-browser", "Print the auth URL instead of opening a browser").action(async (options) => {
  const mgr = getConfigManager();
  if (mgr.isAuthenticated()) {
    const config = mgr.loadConfig();
    const method = config.accessToken ? "browser session" : "API key";
    error(`Already authenticated via ${method} as ${config.email}. Run \`shyft logout\` first.`);
    process.exit(EXIT_CODES.GENERAL_ERROR);
  }
  let result;
  if (options.apiKey) {
    result = await runApiKeyAuthFlow(options.apiKey);
  } else {
    result = await runBrowserAuthFlow();
  }
  if (!result.success) {
    error(result.error || "Authentication failed");
    process.exit(EXIT_CODES.AUTH_FAILED);
  }
  if (isJsonMode()) {
    const config = mgr.loadConfig();
    output({
      status: "ok",
      email: config.email,
      teamId: config.teamId,
      teamName: config.teamName
    });
  }
});

// src/commands/logout.ts
import { Command as Command2 } from "commander";
var logoutCommand = new Command2("logout").description("Log out and clear stored credentials").action(() => {
  const mgr = getConfigManager();
  if (!mgr.isAuthenticated()) {
    error("Not currently authenticated.");
    if (isJsonMode()) {
      output({ status: "ok", message: "Not authenticated" });
    }
    return;
  }
  mgr.clearConfig();
  success("Logged out successfully.");
  if (isJsonMode()) {
    output({ status: "ok" });
  }
});

// src/commands/status.ts
import { Command as Command3 } from "commander";
var statusCommand = new Command3("status").description("Show current authentication status").action(() => {
  const mgr = getConfigManager();
  const config = mgr.loadConfig();
  if (!mgr.isAuthenticated()) {
    if (isJsonMode()) {
      output({ authenticated: false });
    } else {
      error("Not authenticated. Run `shyft login` to get started.");
    }
    process.exit(EXIT_CODES.AUTH_REQUIRED);
  }
  const method = config.accessToken ? "browser" : "api-key";
  if (isJsonMode()) {
    output({
      authenticated: true,
      method,
      email: config.email ?? null,
      userId: config.userId ?? null,
      teamId: config.teamId ?? null,
      teamName: config.teamName ?? null,
      expiresAt: config.expiresAt ?? null,
      apiUrl: config.apiUrl ?? null
    });
  } else {
    info(`  Auth method: ${method}`);
    if (config.email) info(`  Email:       ${config.email}`);
    if (config.teamName) info(`  Team:        ${config.teamName}`);
    if (config.expiresAt) info(`  Expires:     ${config.expiresAt}`);
    if (config.apiUrl) info(`  API URL:     ${config.apiUrl}`);
  }
});

// src/commands/config.ts
import { Command as Command4 } from "commander";
var SENSITIVE_KEYS = /* @__PURE__ */ new Set(["accessToken", "refreshToken", "apiKey"]);
var SETTABLE_KEYS = /* @__PURE__ */ new Set(["apiUrl"]);
function redactConfig(config) {
  const redacted = {};
  for (const [key, value] of Object.entries(config)) {
    if (value === void 0) continue;
    if (SENSITIVE_KEYS.has(key)) {
      redacted[key] = "***";
    } else {
      redacted[key] = value;
    }
  }
  return redacted;
}
var configCommand = new Command4("config").description("View or modify CLI configuration").action(() => {
  const mgr = getConfigManager();
  const config = mgr.loadConfig();
  const redacted = redactConfig(config);
  if (Object.keys(redacted).length === 0) {
    if (isJsonMode()) {
      output({});
    } else {
      info("No configuration set. Run `shyft login` to get started.");
    }
    return;
  }
  output(redacted);
});
configCommand.command("get <key>").description("Get a configuration value").action((key) => {
  const mgr = getConfigManager();
  const config = mgr.loadConfig();
  const value = config[key];
  if (value === void 0) {
    error(`Key "${key}" is not set.`);
    process.exit(EXIT_CODES.GENERAL_ERROR);
  }
  if (SENSITIVE_KEYS.has(key)) {
    if (isJsonMode()) {
      output({ [key]: "***" });
    } else {
      info("***");
    }
  } else {
    if (isJsonMode()) {
      output({ [key]: value });
    } else {
      info(String(value));
    }
  }
});
configCommand.command("set <key> <value>").description("Set a configuration value").action((key, value) => {
  if (!SETTABLE_KEYS.has(key)) {
    error(`Cannot set "${key}". Settable keys: ${[...SETTABLE_KEYS].join(", ")}`);
    process.exit(EXIT_CODES.VALIDATION_ERROR);
  }
  const mgr = getConfigManager();
  mgr.updateConfig({ [key]: value });
  success(`Set ${key} = ${value}`);
  if (isJsonMode()) {
    output({ [key]: value });
  }
});
configCommand.command("reset").description("Reset configuration to defaults (preserves auth)").action(() => {
  const mgr = getConfigManager();
  const config = mgr.loadConfig();
  const authFields = {};
  if (config.accessToken) authFields.accessToken = config.accessToken;
  if (config.refreshToken) authFields.refreshToken = config.refreshToken;
  if (config.expiresAt) authFields.expiresAt = config.expiresAt;
  if (config.apiKey) authFields.apiKey = config.apiKey;
  if (config.userId) authFields.userId = config.userId;
  if (config.email) authFields.email = config.email;
  if (config.teamId) authFields.teamId = config.teamId;
  if (config.teamName) authFields.teamName = config.teamName;
  mgr.saveConfig(authFields);
  success("Configuration reset to defaults (auth preserved).");
  if (isJsonMode()) {
    output({ status: "ok" });
  }
});

// src/commands/context.ts
import { Command as Command5 } from "commander";

// src/lib/context.ts
import { existsSync as existsSync2, mkdirSync as mkdirSync2, readFileSync as readFileSync2, writeFileSync as writeFileSync2 } from "fs";
import { join as join3 } from "path";
var CONTEXT_DIR = ".shyft";
var CONTEXT_FILE = "context.json";
function createContextManager(baseDir) {
  const contextDir = join3(baseDir, CONTEXT_DIR);
  const contextPath = join3(contextDir, CONTEXT_FILE);
  function ensureDir() {
    if (!existsSync2(contextDir)) {
      mkdirSync2(contextDir, { recursive: true, mode: 448 });
    }
  }
  function load() {
    if (!existsSync2(contextPath)) return {};
    try {
      const content = readFileSync2(contextPath, "utf-8");
      return JSON.parse(content);
    } catch {
      return {};
    }
  }
  function save(context) {
    ensureDir();
    const clean = {};
    if (context.featureId) clean.featureId = context.featureId;
    if (context.activePhases && Object.keys(context.activePhases).length > 0) {
      clean.activePhases = context.activePhases;
    }
    writeFileSync2(contextPath, JSON.stringify(clean, null, 2), { encoding: "utf-8", mode: 384 });
  }
  function setFeature(id) {
    const current = load();
    save({ ...current, featureId: id });
  }
  function clearFeature() {
    const current = load();
    delete current.featureId;
    save(current);
  }
  function clearAll() {
    save({});
  }
  function resolveFeatureId(explicit) {
    if (explicit) return explicit;
    const ctx = load();
    if (ctx.featureId) return ctx.featureId;
    throw new Error(
      "No feature specified. Use <id> argument or run: shyft context set --feature <id>"
    );
  }
  function getActivePhases() {
    return load().activePhases || {};
  }
  function saveActivePhases(phases) {
    const current = load();
    current.activePhases = phases;
    save(current);
  }
  return { load, setFeature, clearFeature, clearAll, resolveFeatureId, getActivePhases, saveActivePhases };
}
var defaultManager2;
function getContextManager() {
  if (!defaultManager2) {
    defaultManager2 = createContextManager(process.cwd());
  }
  return defaultManager2;
}

// src/lib/project-config.ts
import { existsSync as existsSync3, mkdirSync as mkdirSync3, readFileSync as readFileSync3, writeFileSync as writeFileSync3 } from "fs";
import { join as join4 } from "path";
var CONFIG_DIR = ".shyft";
var CONFIG_FILE = "config.json";
function createProjectConfigManager(baseDir) {
  const dirPath = join4(baseDir, CONFIG_DIR);
  const filePath = join4(dirPath, CONFIG_FILE);
  function ensureDir() {
    if (!existsSync3(dirPath)) {
      mkdirSync3(dirPath, { recursive: true, mode: 448 });
    }
  }
  function exists() {
    return existsSync3(filePath);
  }
  function load() {
    if (!existsSync3(filePath)) return {};
    try {
      const raw = readFileSync3(filePath, "utf-8");
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  function save(config) {
    ensureDir();
    writeFileSync3(filePath, JSON.stringify(config, null, 2), { encoding: "utf-8", mode: 384 });
  }
  function update(partial) {
    const current = load();
    const updated = { ...current, ...partial };
    save(updated);
    return updated;
  }
  function setProductId(id) {
    update({ productId: id });
  }
  function resolveProductId(explicit) {
    if (explicit) return explicit;
    const config = load();
    if (config.productId) return config.productId;
    throw new Error(
      "No product specified. Use --product <id> or run: shyft context set --product <id>"
    );
  }
  return { load, save, update, setProductId, resolveProductId, exists };
}
var defaultManager3;
function getProjectConfigManager() {
  if (!defaultManager3) {
    defaultManager3 = createProjectConfigManager(process.cwd());
  }
  return defaultManager3;
}

// src/commands/context.ts
var contextCommand = new Command5("context").description("Manage per-directory product and feature context").action(() => {
  showContext();
});
function showContext() {
  const projMgr = getProjectConfigManager();
  const ctxMgr = getContextManager();
  const projConfig = projMgr.load();
  const userCtx = ctxMgr.load();
  const merged = {
    productId: projConfig.productId || null,
    featureId: userCtx.featureId || null
  };
  if (isJsonMode()) {
    output(merged);
    return;
  }
  if (!merged.productId && !merged.featureId) {
    info("No context set. Use: shyft context set --product <id> --feature <id>");
    return;
  }
  if (merged.productId) info(`  Product: ${merged.productId}`);
  if (merged.featureId) info(`  Feature: ${merged.featureId}`);
}
contextCommand.command("show").description("Show current context").action(() => {
  showContext();
});
contextCommand.command("set").description("Set product or feature context").option("--product <id>", "Set product ID (saved to project config)").option("--feature <id>", "Set feature ID (saved to user context)").action((opts) => {
  if (!opts.product && !opts.feature) {
    error("Provide --product <id> and/or --feature <id>");
    process.exit(EXIT_CODES.VALIDATION_ERROR);
  }
  if (opts.product) {
    const projMgr = getProjectConfigManager();
    projMgr.setProductId(opts.product);
    success(`Product set to ${opts.product} (project config)`);
  }
  if (opts.feature) {
    const ctxMgr = getContextManager();
    ctxMgr.setFeature(opts.feature);
    success(`Feature set to ${opts.feature} (user context)`);
  }
});
contextCommand.command("clear").description("Clear context").option("--product", "Clear product (from project config)").option("--all", "Clear everything").action((opts) => {
  const projMgr = getProjectConfigManager();
  const ctxMgr = getContextManager();
  if (opts.all) {
    projMgr.update({ productId: void 0 });
    ctxMgr.clearAll();
    success("All context cleared.");
    return;
  }
  if (opts.product) {
    projMgr.update({ productId: void 0 });
    ctxMgr.clearAll();
    success("Product and feature context cleared.");
    return;
  }
  ctxMgr.clearFeature();
  success("Feature context cleared.");
});
function handleApiError(err) {
  if (err instanceof ApiClientError) {
    error(err.message);
    if (err.status === 404) process.exit(EXIT_CODES.GENERAL_ERROR);
    if (err.status === 401) process.exit(EXIT_CODES.AUTH_REQUIRED);
    process.exit(EXIT_CODES.API_ERROR);
  }
  throw err;
}
function resolveProduct(explicit) {
  const projMgr = getProjectConfigManager();
  return projMgr.resolveProductId(explicit);
}
contextCommand.command("overview").description("Get product context overview").option("--product <id>", "Product ID (defaults to project config)").action(async (opts) => {
  let productId;
  try {
    productId = resolveProduct(opts.product);
  } catch (err) {
    error(err.message);
    process.exit(EXIT_CODES.VALIDATION_ERROR);
  }
  const spinner = startSpinner("Fetching product overview...");
  try {
    const client = getApiClient();
    const { data } = await client.get(`/products/${productId}/context/overview`);
    succeedSpinner("Product overview loaded.");
    if (isJsonMode()) {
      output(data);
    } else {
      info("");
      info(`  Product:      ${data.product.name}`);
      info(`  Description:  ${data.product.description || "(none)"}`);
      info(`  Vision:       ${data.product.vision || "(none)"}`);
      info("");
      info("  Feature Counts:");
      const fc = data.featureCounts || {};
      info(`    Ideate: ${fc.ideate ?? 0}   Build: ${fc.build ?? 0}   Ship: ${fc.ship ?? 0}`);
      info("");
      if (data.repositories && data.repositories.length > 0) {
        info("  Repositories:");
        for (const repo of data.repositories) {
          info(`    - ${repo.name}`);
          if (repo.architectureExcerpt) {
            const excerpt = repo.architectureExcerpt.slice(0, 120).replace(/\n/g, " ");
            info(`      ${excerpt}${repo.architectureExcerpt.length > 120 ? "..." : ""}`);
          }
        }
      } else {
        info("  Repositories: (none)");
      }
      info("");
    }
  } catch (err) {
    failSpinner("Failed to fetch product overview.");
    handleApiError(err);
  }
});
contextCommand.command("features").description("List product features for context analysis").option("--product <id>", "Product ID (defaults to project config)").option("--stage <stage>", "Filter by stage (ideate, build, ship)").action(async (opts) => {
  let productId;
  try {
    productId = resolveProduct(opts.product);
  } catch (err) {
    error(err.message);
    process.exit(EXIT_CODES.VALIDATION_ERROR);
  }
  const spinner = startSpinner("Fetching features...");
  try {
    const client = getApiClient();
    const params = {};
    if (opts.stage) params.stage = opts.stage;
    const { data } = await client.get(`/products/${productId}/context/features`, { params });
    succeedSpinner("Features loaded.");
    if (isJsonMode()) {
      output(data);
    } else {
      if (!data.features || data.features.length === 0) {
        info("No features found.");
        return;
      }
      info("");
      info(`  ${"ID".padEnd(28)} ${"Stage".padEnd(8)} ${"Title".padEnd(30)} Affected Areas`);
      info(`  ${"\u2500".repeat(28)} ${"\u2500".repeat(8)} ${"\u2500".repeat(30)} ${"\u2500".repeat(20)}`);
      for (const f of data.features) {
        const areas = (f.affectedAreas || []).join(", ") || "\u2014";
        info(`  ${String(f.id).padEnd(28)} ${String(f.stage).padEnd(8)} ${String(f.title).slice(0, 30).padEnd(30)} ${areas}`);
      }
      info(`
  Total: ${data.total}`);
      info("");
    }
  } catch (err) {
    failSpinner("Failed to fetch features.");
    handleApiError(err);
  }
});
contextCommand.command("feature <featureId>").description("Get full feature detail for conflict analysis").option("--product <id>", "Product ID (defaults to project config)").action(async (featureId, opts) => {
  let productId;
  try {
    productId = resolveProduct(opts.product);
  } catch (err) {
    error(err.message);
    process.exit(EXIT_CODES.VALIDATION_ERROR);
  }
  const spinner = startSpinner("Fetching feature detail...");
  try {
    const client = getApiClient();
    const { data } = await client.get(`/products/${productId}/context/features/${featureId}`);
    succeedSpinner("Feature detail loaded.");
    if (isJsonMode()) {
      output(data);
    } else {
      info("");
      info(`  ID:      ${data.id}`);
      info(`  Title:   ${data.title}`);
      info(`  Intent:  ${data.intent || "(none)"}`);
      info(`  Stage:   ${data.stage}`);
      if (data.plan) {
        info("");
        info("  Plan:");
        info(`    Overview:    ${data.plan.overview}`);
        info(`    Complexity:  ${data.plan.estimatedComplexity}`);
        if (data.plan.steps?.length) {
          info("    Steps:");
          for (const step of data.plan.steps) {
            info(`      - ${step.title}: ${step.description}`);
          }
        }
        const files = data.plan.files || {};
        if (files.create?.length) info(`    Create: ${files.create.join(", ")}`);
        if (files.modify?.length) info(`    Modify: ${files.modify.join(", ")}`);
        if (files.delete?.length) info(`    Delete: ${files.delete.join(", ")}`);
        if (data.plan.affectedAreas?.length) {
          info(`    Affected Areas: ${data.plan.affectedAreas.join(", ")}`);
        }
      }
      if (data.linkedPRs?.length) {
        info("");
        info("  Linked PRs:");
        for (const pr of data.linkedPRs) {
          info(`    - #${pr.number} (${pr.status}) ${pr.url}`);
        }
      }
      if (data.externalSync) {
        info(`  External: ${data.externalSync.source} \u2014 ${data.externalSync.externalUrl}`);
      }
      info("");
    }
  } catch (err) {
    failSpinner("Failed to fetch feature detail.");
    handleApiError(err);
  }
});
contextCommand.command("architecture").description("Get architecture docs for linked repositories").option("--product <id>", "Product ID (defaults to project config)").option("--repo <id>", "Filter to a specific repository").option("--section <name>", "Filter to a section (ARCHITECTURE, CONVENTIONS, STRUCTURE, STACK)").action(async (opts) => {
  let productId;
  try {
    productId = resolveProduct(opts.product);
  } catch (err) {
    error(err.message);
    process.exit(EXIT_CODES.VALIDATION_ERROR);
  }
  const spinner = startSpinner("Fetching architecture docs...");
  try {
    const client = getApiClient();
    const params = {};
    if (opts.repo) params.repoId = opts.repo;
    if (opts.section) params.section = opts.section;
    const { data } = await client.get(`/products/${productId}/context/architecture`, { params });
    succeedSpinner("Architecture docs loaded.");
    if (isJsonMode()) {
      output(data);
    } else {
      if (!data.repositories || data.repositories.length === 0) {
        info("No architecture docs found.");
        return;
      }
      for (const repo of data.repositories) {
        info("");
        info(`  Repository: ${repo.repoName} (${repo.repoId})`);
        info(`  ${"\u2500".repeat(60)}`);
        const sections = repo.sections || {};
        const keys = Object.keys(sections);
        if (keys.length === 0) {
          info("    (no sections available)");
        } else {
          for (const key of keys) {
            info(`
  [${key}]`);
            info(`  ${sections[key]}`);
          }
        }
      }
      info("");
    }
  } catch (err) {
    failSpinner("Failed to fetch architecture docs.");
    handleApiError(err);
  }
});
contextCommand.command("plans").description("Get active implementation plans (features in build stage)").option("--product <id>", "Product ID (defaults to project config)").action(async (opts) => {
  let productId;
  try {
    productId = resolveProduct(opts.product);
  } catch (err) {
    error(err.message);
    process.exit(EXIT_CODES.VALIDATION_ERROR);
  }
  const spinner = startSpinner("Fetching active plans...");
  try {
    const client = getApiClient();
    const { data } = await client.get(`/products/${productId}/context/plans`);
    succeedSpinner("Plans loaded.");
    if (isJsonMode()) {
      output(data);
    } else {
      if (!data.plans || data.plans.length === 0) {
        info("No active plans found.");
        return;
      }
      for (const entry of data.plans) {
        info("");
        info(`  Feature: ${entry.featureTitle} (${entry.featureId})`);
        info(`  Build:   ${entry.build.status} \u2014 step ${entry.build.currentStep}/${entry.build.totalSteps}`);
        if (entry.build.branchName) info(`  Branch:  ${entry.build.branchName}`);
        if (entry.plan) {
          info(`  Plan:    ${entry.plan.overview}`);
          if (entry.plan.affectedAreas?.length) {
            info(`  Areas:   ${entry.plan.affectedAreas.join(", ")}`);
          }
        }
        info(`  ${"\u2500".repeat(60)}`);
      }
      info("");
    }
  } catch (err) {
    failSpinner("Failed to fetch plans.");
    handleApiError(err);
  }
});
contextCommand.command("search <query>").description("Semantic code search across product repositories").option("--product <id>", "Product ID (defaults to project config)").option("--limit <n>", "Max results (default 10, max 50)", "10").action(async (query, opts) => {
  let productId;
  try {
    productId = resolveProduct(opts.product);
  } catch (err) {
    error(err.message);
    process.exit(EXIT_CODES.VALIDATION_ERROR);
  }
  const limit = Math.min(Math.max(parseInt(opts.limit, 10) || 10, 1), 50);
  const spinner = startSpinner("Searching codebase...");
  try {
    const client = getApiClient();
    const { data } = await client.post(`/products/${productId}/context/search`, { query, limit });
    succeedSpinner("Search complete.");
    if (isJsonMode()) {
      output(data);
    } else {
      if (!data.results || data.results.length === 0) {
        info("No results found.");
        return;
      }
      info("");
      for (const r of data.results) {
        const score = (r.score * 100).toFixed(1);
        info(`  ${r.filePath}:${r.startLine}-${r.endLine}  ${r.nodeName} (${r.nodeKind})  [${score}%]`);
        if (r.content) {
          const preview = r.content.split("\n").slice(0, 3).join("\n    ");
          info(`    ${preview}`);
        }
        info("");
      }
    }
  } catch (err) {
    failSpinner("Search failed.");
    handleApiError(err);
  }
});

// src/commands/products.ts
import { Command as Command7 } from "commander";

// src/commands/init.ts
import { Command as Command6 } from "commander";
import { existsSync as existsSync4, readFileSync as readFileSync4, writeFileSync as writeFileSync4 } from "fs";
import { join as join5 } from "path";
function buildCreateProductPayload(name, description) {
  const trimmedName = name.trim();
  const payload = { name: trimmedName };
  const trimmedDesc = description.trim();
  if (trimmedDesc) {
    payload.description = trimmedDesc;
  }
  return payload;
}
async function askQuestion(prompt) {
  const readline = await import("readline");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
  rl.close();
  return answer;
}
async function askYesNo(prompt) {
  const answer = await askQuestion(`${prompt} (y/N): `);
  return answer.trim().toLowerCase() === "y";
}
async function createProduct(name, description) {
  const spinner = startSpinner("Creating product...");
  try {
    const client = getApiClient();
    const payload = buildCreateProductPayload(name, description);
    const { data } = await client.post("/products", payload);
    succeedSpinner(`Product created: ${data.name} (${data.id})`);
    return data.id;
  } catch (err) {
    failSpinner("Failed to create product.");
    if (err instanceof ApiClientError) {
      error(err.message);
      process.exit(EXIT_CODES.API_ERROR);
    }
    throw err;
  }
}
async function selectOrCreateProduct() {
  const spinner = startSpinner("Fetching products...");
  let products = [];
  try {
    const client = getApiClient();
    const { data } = await client.get("/products");
    succeedSpinner("Products loaded.");
    products = data || [];
  } catch (err) {
    failSpinner("Failed to fetch products.");
    if (err instanceof ApiClientError) {
      error(err.message);
      process.exit(EXIT_CODES.API_ERROR);
    }
    throw err;
  }
  info("");
  for (let i = 0; i < products.length; i++) {
    info(`  ${i + 1}. ${products[i].name} (${products[i].id})`);
  }
  if (products.length > 0) {
    info(`  ${"\u2500".repeat(40)}`);
  }
  info(`  ${products.length + 1}. + Create a new product`);
  info("");
  const answer = await askQuestion("Select an option (number): ");
  const index = parseInt(answer, 10) - 1;
  if (isNaN(index) || index < 0 || index > products.length) {
    error("Invalid selection.");
    process.exit(EXIT_CODES.VALIDATION_ERROR);
  }
  if (index === products.length) {
    const name = await askQuestion("Product name: ");
    if (!name.trim()) {
      error("Product name is required.");
      process.exit(EXIT_CODES.VALIDATION_ERROR);
    }
    const description = await askQuestion("Description (optional): ");
    return createProduct(name, description);
  }
  return products[index].id;
}
var CONTEXT_IGNORE = ".shyft/context.json";
function ensureGitignore(baseDir) {
  const gitignorePath = join5(baseDir, ".gitignore");
  if (existsSync4(gitignorePath)) {
    const content = readFileSync4(gitignorePath, "utf-8");
    if (content.includes(CONTEXT_IGNORE)) return;
    if (content.includes(".shyft/")) {
      const updated = content.replace(/^\.shyft\/\s*\n?/m, `${CONTEXT_IGNORE}
`);
      writeFileSync4(gitignorePath, updated, "utf-8");
      return;
    }
    const newline = content.endsWith("\n") ? "" : "\n";
    writeFileSync4(gitignorePath, content + newline + CONTEXT_IGNORE + "\n", "utf-8");
  } else {
    writeFileSync4(gitignorePath, CONTEXT_IGNORE + "\n", "utf-8");
  }
}
var initCommand = new Command6("init").description("Initialize Shyft project config for this directory").option("--product <id>", "Product ID to associate with this project").option("--name <name>", "Name for a new product (used with product creation)").option("--description <desc>", "Description for a new product").action(async (opts) => {
  const configMgr = getConfigManager();
  if (!configMgr.isAuthenticated()) {
    error("Not authenticated. Run: shyft login");
    process.exit(EXIT_CODES.AUTH_REQUIRED);
  }
  const projMgr = getProjectConfigManager();
  if (projMgr.exists()) {
    const config = projMgr.load();
    if (isJsonMode()) {
      if (!opts.product && !opts.name) {
        output(config);
        return;
      }
    } else {
      info("Project already initialized (.shyft/config.json exists).");
      info(`  Current product: ${config.productId || "(not set)"}`);
      const confirmed = await askYesNo("Reconfigure this project?");
      if (!confirmed) {
        info("Keeping existing configuration.");
        return;
      }
    }
  }
  let productId = opts.product;
  if (!productId && opts.name) {
    productId = await createProduct(opts.name, opts.description || "");
  }
  if (!productId) {
    if (isJsonMode()) {
      error("Use --product <id> or --name <name> to specify product in JSON mode.");
      process.exit(EXIT_CODES.VALIDATION_ERROR);
    }
    productId = await selectOrCreateProduct();
  }
  projMgr.update({ productId });
  ensureGitignore(process.cwd());
  success("Project initialized.");
  if (isJsonMode()) {
    output(projMgr.load());
  } else {
    info(`  Config:  .shyft/config.json`);
    info(`  Product: ${productId}`);
    info("");
    info("Next steps:");
    info("  1. Commit .shyft/config.json to your repo");
    info("  2. Install the shyft-skills plugin in your coding agent");
    info("  3. Run /shyft:ideate to start building a feature");
  }
});

// src/commands/products.ts
function handleApiError2(err) {
  if (err instanceof ApiClientError) {
    error(err.message);
    if (err.status === 404) process.exit(EXIT_CODES.GENERAL_ERROR);
    if (err.status === 401) process.exit(EXIT_CODES.AUTH_REQUIRED);
    process.exit(EXIT_CODES.API_ERROR);
  }
  throw err;
}
var productsCommand = new Command7("products").description("Manage products");
productsCommand.command("list").description("List all products").action(async () => {
  const spinner = startSpinner("Fetching products...");
  try {
    const client = getApiClient();
    const { data } = await client.get("/products");
    succeedSpinner("Products loaded.");
    if (isJsonMode()) {
      output(data);
    } else {
      if (!data || data.length === 0) {
        info("No products found.");
        return;
      }
      info("");
      info(`  ${"ID".padEnd(28)} ${"Name".padEnd(30)} Description`);
      info(`  ${"\u2500".repeat(28)} ${"\u2500".repeat(30)} ${"\u2500".repeat(30)}`);
      for (const p of data) {
        const desc = p.description ? p.description.slice(0, 30) : "";
        info(`  ${String(p.id).padEnd(28)} ${String(p.name).padEnd(30)} ${desc}`);
      }
      info("");
    }
  } catch (err) {
    failSpinner("Failed to fetch products.");
    handleApiError2(err);
  }
});
productsCommand.command("get <id>").description("Get product by ID").action(async (id) => {
  const spinner = startSpinner("Fetching product...");
  try {
    const client = getApiClient();
    const { data } = await client.get(`/products/${id}`);
    succeedSpinner("Product loaded.");
    if (isJsonMode()) {
      output(data);
    } else {
      info("");
      info(`  ID:           ${data.id}`);
      info(`  Name:         ${data.name}`);
      info(`  Description:  ${data.description || "(none)"}`);
      info(`  Repositories: ${data.repositoryIds?.length ?? 0}`);
      if (data.featureCounts) {
        info(`  Features:     ${JSON.stringify(data.featureCounts)}`);
      }
      info(`  Created:      ${data.createdAt}`);
      info(`  Updated:      ${data.updatedAt}`);
      info("");
    }
  } catch (err) {
    failSpinner("Failed to fetch product.");
    handleApiError2(err);
  }
});
productsCommand.command("create").description("Create a new product").requiredOption("--name <name>", "Product name").option("--description <desc>", "Product description").action(async (opts) => {
  const spinner = startSpinner("Creating product...");
  try {
    const client = getApiClient();
    const payload = buildCreateProductPayload(opts.name, opts.description || "");
    const { data } = await client.post("/products", payload);
    succeedSpinner("Product created.");
    if (isJsonMode()) {
      output(data);
    } else {
      info("");
      info(`  ID:          ${data.id}`);
      info(`  Name:        ${data.name}`);
      info(`  Description: ${data.description || "(none)"}`);
      info("");
    }
  } catch (err) {
    failSpinner("Failed to create product.");
    handleApiError2(err);
  }
});

// src/commands/features.ts
import { Command as Command8 } from "commander";
import { createReadStream, existsSync as fileExists } from "fs";
import { basename } from "path";
function handleApiError3(err) {
  if (err instanceof ApiClientError) {
    error(err.message);
    if (err.status === 404) process.exit(EXIT_CODES.GENERAL_ERROR);
    if (err.status === 401) process.exit(EXIT_CODES.AUTH_REQUIRED);
    process.exit(EXIT_CODES.API_ERROR);
  }
  throw err;
}
var featuresCommand = new Command8("features").description("Manage features");
featuresCommand.command("list").description("List features for a product").option("--product <id>", "Product ID").option("--stage <stage>", "Filter by stage (ideate, build, ship)").option("--assignee <userId>", "Filter by assignee").action(async (opts) => {
  const projMgr = getProjectConfigManager();
  let productId;
  try {
    productId = projMgr.resolveProductId(opts.product);
  } catch (err) {
    error(err.message);
    process.exit(EXIT_CODES.VALIDATION_ERROR);
  }
  const spinner = startSpinner("Fetching features...");
  try {
    const client = getApiClient();
    const params = {};
    if (opts.stage) params.stage = opts.stage;
    if (opts.assignee) params.assignee = opts.assignee;
    const { data } = await client.get(`/products/${productId}/features`, { params });
    succeedSpinner("Features loaded.");
    if (isJsonMode()) {
      output(data);
    } else {
      if (!data || data.length === 0) {
        info("No features found.");
        return;
      }
      info("");
      info(`  ${"ID".padEnd(28)} ${"Stage".padEnd(8)} Title`);
      info(`  ${"\u2500".repeat(28)} ${"\u2500".repeat(8)} ${"\u2500".repeat(40)}`);
      for (const f of data) {
        info(`  ${String(f.id).padEnd(28)} ${String(f.stage).padEnd(8)} ${f.title}`);
      }
      info("");
    }
  } catch (err) {
    failSpinner("Failed to fetch features.");
    handleApiError3(err);
  }
});
featuresCommand.command("get [id]").description("Get feature by ID").action(async (id) => {
  const ctx = getContextManager();
  let featureId;
  try {
    featureId = ctx.resolveFeatureId(id);
  } catch (err) {
    error(err.message);
    process.exit(EXIT_CODES.VALIDATION_ERROR);
  }
  const spinner = startSpinner("Fetching feature...");
  try {
    const client = getApiClient();
    const { data } = await client.get(`/features/${featureId}`);
    succeedSpinner("Feature loaded.");
    if (isJsonMode()) {
      output(data);
    } else {
      info("");
      info(`  ID:        ${data.id}`);
      info(`  Product:   ${data.productId}`);
      info(`  Title:     ${data.title}`);
      info(`  Stage:     ${data.stage}`);
      info(`  Intent:    ${data.intent || "(none)"}`);
      if (data.assignee) info(`  Assignee:  ${data.assignee}`);
      if (data.linkedPRs?.length) {
        info(`  PRs:       ${data.linkedPRs.map((pr) => pr.url).join(", ")}`);
      }
      info(`  Created:   ${data.createdAt}`);
      info(`  Updated:   ${data.updatedAt}`);
      info("");
    }
  } catch (err) {
    failSpinner("Failed to fetch feature.");
    handleApiError3(err);
  }
});
featuresCommand.command("create").description("Create a new feature").requiredOption("--title <title>", "Feature title").requiredOption("--intent <intent>", "Feature intent description").option("--product <id>", "Product ID").action(async (opts) => {
  const projMgr = getProjectConfigManager();
  let productId;
  try {
    productId = projMgr.resolveProductId(opts.product);
  } catch (err) {
    error(err.message);
    process.exit(EXIT_CODES.VALIDATION_ERROR);
  }
  const spinner = startSpinner("Creating feature...");
  try {
    const client = getApiClient();
    const { data } = await client.post(`/products/${productId}/features`, {
      title: opts.title,
      intent: opts.intent
    });
    succeedSpinner("Feature created.");
    if (isJsonMode()) {
      output(data);
    } else {
      success(`Feature created: ${data.id}`);
      info(`  Title: ${data.title}`);
      info(`  Stage: ${data.stage}`);
    }
  } catch (err) {
    failSpinner("Failed to create feature.");
    handleApiError3(err);
  }
});
featuresCommand.command("update [id]").description("Update a feature").option("--title <title>", "New title").option("--stage <stage>", "New stage (ideate, build, ship)").option("--intent <intent>", "New intent description").option("--assignee <userId>", "Assign to user ID").action(async (id, opts) => {
  const ctx = getContextManager();
  let featureId;
  try {
    featureId = ctx.resolveFeatureId(id);
  } catch (err) {
    error(err.message);
    process.exit(EXIT_CODES.VALIDATION_ERROR);
  }
  const body = {};
  if (opts.title) body.title = opts.title;
  if (opts.stage) body.stage = opts.stage;
  if (opts.intent) body.intent = opts.intent;
  if (opts.assignee) body.assignee = opts.assignee;
  if (Object.keys(body).length === 0) {
    error("Provide at least one field to update (--title, --stage, --intent, --assignee).");
    process.exit(EXIT_CODES.VALIDATION_ERROR);
  }
  const spinner = startSpinner("Updating feature...");
  try {
    const client = getApiClient();
    const { data } = await client.patch(`/features/${featureId}`, body);
    succeedSpinner("Feature updated.");
    if (isJsonMode()) {
      output(data);
    } else {
      success(`Feature updated: ${data.id}`);
      info(`  Title: ${data.title}`);
      info(`  Stage: ${data.stage}`);
    }
  } catch (err) {
    failSpinner("Failed to update feature.");
    handleApiError3(err);
  }
});
featuresCommand.command("delete [id]").description("Delete a feature").option("--force", "Skip confirmation prompt").action(async (id, opts) => {
  const ctx = getContextManager();
  let featureId;
  try {
    featureId = ctx.resolveFeatureId(id);
  } catch (err) {
    error(err.message);
    process.exit(EXIT_CODES.VALIDATION_ERROR);
  }
  if (!opts.force && !isJsonMode()) {
    const readline = await import("readline");
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise((resolve) => {
      rl.question(`Delete feature ${featureId}? (y/N) `, resolve);
    });
    rl.close();
    if (answer.toLowerCase() !== "y") {
      info("Cancelled.");
      return;
    }
  } else if (isJsonMode() && !opts.force) {
    error("Use --force to delete in JSON mode.");
    process.exit(EXIT_CODES.VALIDATION_ERROR);
  }
  const spinner = startSpinner("Deleting feature...");
  try {
    const client = getApiClient();
    await client.delete(`/features/${featureId}`);
    succeedSpinner("Feature deleted.");
    if (isJsonMode()) {
      output({ deleted: featureId });
    } else {
      success(`Feature deleted: ${featureId}`);
    }
  } catch (err) {
    failSpinner("Failed to delete feature.");
    handleApiError3(err);
  }
});
featuresCommand.command("plan [id]").description("Generate an implementation plan for a feature").action(async (id) => {
  const ctx = getContextManager();
  let featureId;
  try {
    featureId = ctx.resolveFeatureId(id);
  } catch (err) {
    error(err.message);
    process.exit(EXIT_CODES.VALIDATION_ERROR);
  }
  const spinner = startSpinner("Generating plan...");
  try {
    const client = getApiClient();
    const { data } = await client.post(`/features/${featureId}/plan/generate`, {});
    succeedSpinner("Plan generated.");
    if (isJsonMode()) {
      output(data);
    } else {
      if (data && typeof data === "object") {
        output(data);
      } else {
        success("Plan generated successfully.");
      }
    }
  } catch (err) {
    failSpinner("Failed to generate plan.");
    handleApiError3(err);
  }
});
featuresCommand.command("plan-history [id]").description("Get plan version history for a feature").action(async (id) => {
  const ctx = getContextManager();
  let featureId;
  try {
    featureId = ctx.resolveFeatureId(id);
  } catch (err) {
    error(err.message);
    process.exit(EXIT_CODES.VALIDATION_ERROR);
  }
  const spinner = startSpinner("Fetching plan history...");
  try {
    const client = getApiClient();
    const { data } = await client.get(`/features/${featureId}/plan/history`);
    succeedSpinner("Plan history loaded.");
    if (isJsonMode()) {
      output(data);
    } else {
      if (!data || Array.isArray(data) && data.length === 0) {
        info("No plan history found.");
        return;
      }
      output(data);
    }
  } catch (err) {
    failSpinner("Failed to fetch plan history.");
    handleApiError3(err);
  }
});
featuresCommand.command("link-pr [id]").description("Link a pull request to a feature").requiredOption("--url <url>", "Full URL of the PR").action(async (id, opts) => {
  const ctx = getContextManager();
  let featureId;
  try {
    featureId = ctx.resolveFeatureId(id);
  } catch (err) {
    error(err.message);
    process.exit(EXIT_CODES.VALIDATION_ERROR);
  }
  const spinner = startSpinner("Linking PR...");
  try {
    const client = getApiClient();
    const { data } = await client.post(`/features/${featureId}/link-pr`, { url: opts.url });
    succeedSpinner("PR linked.");
    if (isJsonMode()) {
      output(data);
    } else {
      success(`PR linked to feature ${featureId}`);
    }
  } catch (err) {
    failSpinner("Failed to link PR.");
    handleApiError3(err);
  }
});
featuresCommand.command("upload-doc [id]").description("Upload a document to a feature").requiredOption("--file <path>", "Path to the file to upload").action(async (id, opts) => {
  const ctx = getContextManager();
  let featureId;
  try {
    featureId = ctx.resolveFeatureId(id);
  } catch (err) {
    error(err.message);
    process.exit(EXIT_CODES.VALIDATION_ERROR);
  }
  if (!fileExists(opts.file)) {
    error(`File not found: ${opts.file}`);
    process.exit(EXIT_CODES.VALIDATION_ERROR);
  }
  const spinner = startSpinner("Uploading document...");
  try {
    const client = getApiClient();
    const FormData = (await import("form-data")).default;
    const form = new FormData();
    form.append("file", createReadStream(opts.file), basename(opts.file));
    const { data } = await client.post(`/features/${featureId}/documents`, form, {
      headers: form.getHeaders()
    });
    succeedSpinner("Document uploaded.");
    if (isJsonMode()) {
      output(data);
    } else {
      success(`Document uploaded to feature ${featureId}`);
    }
  } catch (err) {
    failSpinner("Failed to upload document.");
    handleApiError3(err);
  }
});

// src/commands/analytics.ts
import { Command as Command9 } from "commander";

// src/lib/analytics.ts
function createPhaseTracker(contextManager, sender) {
  function getActivePhases() {
    return contextManager.getActivePhases();
  }
  async function startPhase(phase, productId, featureId, metadata) {
    const phases = contextManager.getActivePhases();
    phases[phase] = { startedAt: Date.now(), productId, featureId };
    contextManager.saveActivePhases(phases);
    try {
      await sender.sendEvent({
        productId,
        featureId,
        eventType: "phase_started",
        phase,
        source: "cli",
        metadata
      });
    } catch {
    }
  }
  async function endPhase(phase, metadata) {
    const phases = contextManager.getActivePhases();
    const state = phases[phase];
    if (!state) return null;
    const durationMs = Date.now() - state.startedAt;
    delete phases[phase];
    contextManager.saveActivePhases(phases);
    try {
      await sender.sendEvent({
        productId: state.productId,
        featureId: state.featureId,
        eventType: "phase_completed",
        phase,
        source: "cli",
        durationMs,
        metadata
      });
    } catch {
    }
    return { phase, durationMs, productId: state.productId, featureId: state.featureId };
  }
  return { getActivePhases, startPhase, endPhase };
}
function createApiEventSender() {
  return {
    async sendEvent(event) {
      const client = getApiClient();
      await client.post("/analytics/lifecycle/events", event);
    }
  };
}
var defaultTracker;
function getPhaseTracker() {
  if (!defaultTracker) {
    defaultTracker = createPhaseTracker(getContextManager(), createApiEventSender());
  }
  return defaultTracker;
}

// src/commands/analytics.ts
var analyticsCommand = new Command9("analytics").description("Track SDLC phase analytics");
analyticsCommand.command("start-phase <phase>").description("Start tracking a phase (ideate, plan, build, verify)").option("--product <id>", "Product ID (defaults to project config)").option("--feature <id>", "Feature ID (defaults to context)").action(async (phase, opts) => {
  try {
    const projMgr = getProjectConfigManager();
    const ctxMgr = getContextManager();
    const productId = opts.product || projMgr.load().productId;
    if (!productId) {
      error("No product ID available. Use --product <id> or run: shyft init");
      process.exit(EXIT_CODES.VALIDATION_ERROR);
    }
    const featureId = opts.feature || ctxMgr.load().featureId;
    const tracker = getPhaseTracker();
    const active = tracker.getActivePhases();
    if (active[phase]) {
      error(`Phase "${phase}" is already active. End it first with: shyft analytics end-phase ${phase}`);
      process.exit(EXIT_CODES.VALIDATION_ERROR);
    }
    await tracker.startPhase(phase, productId, featureId);
    if (isJsonMode()) {
      output({ phase, status: "started", productId, featureId: featureId || null });
    } else {
      success(`Phase "${phase}" started`);
    }
  } catch (err) {
    error(err.message || "Failed to start phase");
    process.exit(EXIT_CODES.GENERAL_ERROR);
  }
});
analyticsCommand.command("end-phase <phase>").description("End tracking a phase and report duration").action(async (phase) => {
  try {
    const tracker = getPhaseTracker();
    const result = await tracker.endPhase(phase);
    if (!result) {
      error(`No active phase "${phase}" found. Start one with: shyft analytics start-phase ${phase}`);
      process.exit(EXIT_CODES.VALIDATION_ERROR);
    }
    if (isJsonMode()) {
      output({
        phase: result.phase,
        status: "completed",
        durationMs: result.durationMs,
        productId: result.productId,
        featureId: result.featureId || null
      });
    } else {
      const seconds = (result.durationMs / 1e3).toFixed(1);
      success(`Phase "${result.phase}" completed (${seconds}s)`);
    }
  } catch (err) {
    error(err.message || "Failed to end phase");
    process.exit(EXIT_CODES.GENERAL_ERROR);
  }
});
analyticsCommand.command("status").description("Show active phases").action(() => {
  try {
    const tracker = getPhaseTracker();
    const phases = tracker.getActivePhases();
    const entries = Object.entries(phases);
    if (isJsonMode()) {
      output({ activePhases: phases });
      return;
    }
    if (entries.length === 0) {
      info("No active phases.");
      return;
    }
    info("Active phases:");
    for (const [phase, state] of entries) {
      const elapsed = ((Date.now() - state.startedAt) / 1e3).toFixed(1);
      const feature = state.featureId ? ` (feature: ${state.featureId})` : "";
      info(`  ${phase}: ${elapsed}s elapsed${feature}`);
    }
  } catch (err) {
    error(err.message || "Failed to get phase status");
    process.exit(EXIT_CODES.GENERAL_ERROR);
  }
});

// src/index.ts
loadDotenv({ path: ".env.local" });
loadDotenv();
var program = new Command10();
program.name("shyft").description("CLI for the Shyft platform").version("0.4.5").option("--json", "Output in JSON format").hook("preAction", (thisCommand) => {
  const opts = thisCommand.opts();
  if (opts.json) {
    setJsonMode(true);
  }
});
program.addCommand(loginCommand);
program.addCommand(logoutCommand);
program.addCommand(statusCommand);
program.addCommand(configCommand);
program.addCommand(contextCommand);
program.addCommand(productsCommand);
program.addCommand(featuresCommand);
program.addCommand(initCommand);
program.addCommand(analyticsCommand);
function run() {
  program.parse();
}
export {
  run
};
