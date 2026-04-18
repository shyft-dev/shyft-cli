import { describe, test, expect, beforeEach, mock } from 'bun:test';

const mockGet = mock(() => Promise.resolve({ data: {} }));
const mockPost = mock(() => Promise.resolve({ data: {} }));
const mockResolveProductId = mock((id?: string) => id || 'proj_default');

mock.module('../lib/api-client.js', () => ({
  getApiClient: () => ({ get: mockGet, post: mockPost }),
  ApiClientError: class ApiClientError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
}));

mock.module('../lib/project-config.js', () => ({
  getProjectConfigManager: () => ({
    resolveProductId: mockResolveProductId,
    load: () => ({ productId: 'proj_default' }),
    update: mock(),
    setProductId: mock(),
  }),
}));

mock.module('../lib/context.js', () => ({
  getContextManager: () => ({
    load: () => ({}),
    setFeature: mock(),
    clearAll: mock(),
    clearFeature: mock(),
  }),
}));

mock.module('../utils/output.js', () => ({
  output: mock(),
  info: mock(),
  error: mock(),
  success: mock(),
  isJsonMode: () => false,
  setJsonMode: mock(),
}));

mock.module('../utils/spinner.js', () => ({
  startSpinner: () => null,
  succeedSpinner: mock(),
  failSpinner: mock(),
}));

const { contextCommand } = await import('./context.js');

function findSubcommand(name: string) {
  return contextCommand.commands.find((c: { name: () => string }) => c.name() === name);
}

describe('context overview', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockResolveProductId.mockReset();
    mockResolveProductId.mockImplementation((id?: string) => id || 'proj_default');
    mockGet.mockResolvedValue({
      data: {
        product: { name: 'MyApp', description: 'A cool app', vision: 'Be the best' },
        repositories: [{ repoId: 'r1', name: 'org/repo1', architectureExcerpt: 'NestJS' }],
        featureCounts: { ideate: 2, build: 1, ship: 0 },
      },
    });
  });

  // Run fallback test first to avoid Commander option caching from explicit --product
  test('falls back to project config product ID', async () => {
    const cmd = findSubcommand('overview');
    await cmd!.parseAsync(['overview'], { from: 'user' });

    expect(mockResolveProductId).toHaveBeenCalledWith(undefined);
    expect(mockGet).toHaveBeenCalledWith('/products/proj_default/context/overview');
  });

  test('calls correct endpoint with product ID', async () => {
    const cmd = findSubcommand('overview');
    await cmd!.parseAsync(['overview', '--product', 'prod_1'], { from: 'user' });

    expect(mockGet).toHaveBeenCalledWith('/products/prod_1/context/overview');
  });
});

describe('context features', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockResolveProductId.mockReset();
    mockResolveProductId.mockImplementation((id?: string) => id || 'proj_default');
    mockGet.mockResolvedValue({
      data: {
        features: [{ id: 'f1', title: 'Auth', stage: 'build', affectedAreas: ['auth/'] }],
        total: 1,
      },
    });
  });

  test('calls features endpoint with stage filter', async () => {
    const cmd = findSubcommand('features');
    await cmd!.parseAsync(['features', '--product', 'prod_1', '--stage', 'build'], { from: 'user' });

    expect(mockGet).toHaveBeenCalledWith('/products/prod_1/context/features', {
      params: { stage: 'build' },
    });
  });
});

describe('context feature', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockResolveProductId.mockReset();
    mockResolveProductId.mockImplementation((id?: string) => id || 'proj_default');
    mockGet.mockResolvedValue({
      data: {
        id: 'feat_1',
        title: 'Auth',
        intent: 'Add OAuth',
        stage: 'build',
        plan: { overview: 'Implement OAuth', steps: [], files: { create: [], modify: [], delete: [] }, affectedAreas: [], estimatedComplexity: 'medium' },
        linkedPRs: [],
        externalSync: null,
      },
    });
  });

  test('calls feature detail endpoint', async () => {
    const cmd = findSubcommand('feature');
    // With { from: 'user' }, first arg is the positional <featureId>
    await cmd!.parseAsync(['feat_1', '--product', 'prod_1'], { from: 'user' });

    expect(mockGet).toHaveBeenCalledWith('/products/prod_1/context/features/feat_1');
  });
});

describe('context architecture', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockResolveProductId.mockReset();
    mockResolveProductId.mockImplementation((id?: string) => id || 'proj_default');
    mockGet.mockResolvedValue({
      data: {
        repositories: [{ repoId: 'r1', repoName: 'org/repo1', sections: { ARCHITECTURE: 'NestJS monorepo' } }],
      },
    });
  });

  test('calls architecture endpoint with filters', async () => {
    const cmd = findSubcommand('architecture');
    await cmd!.parseAsync(['architecture', '--product', 'prod_1', '--repo', 'r1', '--section', 'STACK'], { from: 'user' });

    expect(mockGet).toHaveBeenCalledWith('/products/prod_1/context/architecture', {
      params: { repoId: 'r1', section: 'STACK' },
    });
  });
});

describe('context plans', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockResolveProductId.mockReset();
    mockResolveProductId.mockImplementation((id?: string) => id || 'proj_default');
    mockGet.mockResolvedValue({
      data: {
        plans: [{ featureId: 'f1', featureTitle: 'Auth', plan: { overview: 'OAuth' }, build: { status: 'running', branchName: 'feat/auth', currentStep: 1, totalSteps: 3 } }],
      },
    });
  });

  test('calls plans endpoint', async () => {
    const cmd = findSubcommand('plans');
    await cmd!.parseAsync(['plans', '--product', 'prod_1'], { from: 'user' });

    expect(mockGet).toHaveBeenCalledWith('/products/prod_1/context/plans');
  });
});

describe('context search', () => {
  beforeEach(() => {
    mockPost.mockReset();
    mockResolveProductId.mockReset();
    mockResolveProductId.mockImplementation((id?: string) => id || 'proj_default');
    mockPost.mockResolvedValue({
      data: {
        results: [{ filePath: 'src/auth.ts', startLine: 10, endLine: 20, nodeName: 'login', nodeKind: 'function', score: 0.95, content: 'async function login() {}' }],
      },
    });
  });

  test('caps limit at 50', async () => {
    const cmd = findSubcommand('search');
    await cmd!.parseAsync(['test query', '--product', 'prod_1', '--limit', '999'], { from: 'user' });

    expect(mockPost).toHaveBeenCalledWith('/products/prod_1/context/search', {
      query: 'test query',
      limit: 50,
    });
  });

  test('calls search endpoint with POST and body', async () => {
    const cmd = findSubcommand('search');
    await cmd!.parseAsync(['authentication login', '--limit', '5'], { from: 'user' });

    expect(mockPost).toHaveBeenCalledWith('/products/prod_1/context/search', {
      query: 'authentication login',
      limit: 5,
    });
  });
});
